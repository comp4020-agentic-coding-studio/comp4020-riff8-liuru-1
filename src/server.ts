import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { marked } from "marked";
import { flyingSample, isKind, newestEventId, recentTraces, repliesFor } from "./db.ts";
import { broadcast, openStream, parseCursor } from "./live.ts";
import { handleFor, log, requestId } from "./log.ts";
import {
  catchPlane,
  createPlane,
  currentHold,
  expireHolds,
  myPlanes,
  publicPlane,
  publicPlanes,
  releasePlane,
  renewHold,
  type Result,
} from "./planes.ts";
import { renderArchive, renderReadme, renderSky } from "./templates.ts";

const PORT = Number(process.env.PORT ?? 8080);
const VISITOR_COOKIE = "visitor";
const FIVE_YEARS = 60 * 60 * 24 * 365 * 5;
const MAX_BODY_BYTES = 8 * 1024;
// how many flying planes a page is sent to draw; catching "any" still asks
// the database for every flying plane
const SKY_SAMPLE = 60;

// The browser's files, read once at start. src/web is served as-is; three.js
// comes straight from node_modules (a runtime dependency, so it's in the image).
const STATIC: Record<string, { type: string; body: string }> = {};
for (const f of ["app.js", "scene.js", "paper.js", "rules.js", "regions.json", "land.json", "app.css"]) {
  const type = f.endsWith(".js") ? "text/javascript" : f.endsWith(".css") ? "text/css" : "application/json";
  STATIC[`/web/${f}`] = { type, body: readFileSync(new URL(`./web/${f}`, import.meta.url), "utf8") };
}
for (const f of ["three.module.js", "three.core.js"]) {
  STATIC[`/vendor/${f}`] = {
    type: "text/javascript",
    body: readFileSync(new URL(`../node_modules/three/build/${f}`, import.meta.url), "utf8"),
  };
}

// A malformed cookie (a stray % escape, say) is ignored, not fatal.
function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    try {
      out[part.slice(0, eq).trim()] = decodeURIComponent(part.slice(eq + 1).trim());
    } catch {
      // skip it
    }
  }
  return out;
}

const VISITOR_SHAPE = /^[A-Za-z0-9_-]{8,64}$/;

class TooLarge extends Error {}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    // past the cap, stop keeping it but let it drain, so the 413 can be read
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        chunks.length = 0;
        reject(new TooLarge());
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

// Fields from either a fetch() JSON body or a plain form post.
async function readFields(req: IncomingMessage): Promise<Record<string, unknown>> {
  const raw = await readBody(req);
  if ((req.headers["content-type"] ?? "").startsWith("application/json")) {
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  }
  const fields: Record<string, unknown> = Object.fromEntries(new URLSearchParams(raw));
  // the no-JavaScript forms send one <select> of "AU" or "AU-canberra"
  if (typeof fields.place === "string" && fields.place) {
    const [country] = fields.place.split("-");
    fields.country = country;
    fields.city = fields.place.includes("-") ? fields.place : "";
  }
  return fields;
}

// Writes have to come from this site's own pages. A browser always says where
// a cross-site request came from (Origin, Sec-Fetch-Site); a request carrying
// neither isn't from a browser page, so it's not a CSRF risk and goes on to
// the ordinary checks.
function crossSite(req: IncomingMessage): boolean {
  const site = req.headers["sec-fetch-site"];
  if (site === "cross-site" || site === "same-site") return true;
  const origin = req.headers.origin;
  if (!origin || origin === "null") return origin === "null";
  try {
    return new URL(origin).host !== req.headers.host;
  } catch {
    return true;
  }
}

// Small per-visitor budgets for the writes, generous for a person and tight
// for a script: a fixed one-minute window, in memory (one machine).
const LIMITS: Record<string, number> = { create: 12, catch: 40, release: 40 };
const windows = new Map<string, { start: number; count: number }>();
function overLimit(visitor: string, op: string): boolean {
  const now = Date.now();
  const k = `${op}:${visitor}`;
  const w = windows.get(k);
  if (!w || now - w.start > 60_000) {
    windows.set(k, { start: now, count: 1 });
    return false;
  }
  w.count++;
  return w.count > (LIMITS[op] ?? 30);
}
setInterval(() => {
  const now = Date.now();
  for (const [k, w] of windows) if (now - w.start > 60_000) windows.delete(k);
}, 60_000).unref();

function visitorCookie(id: string): string {
  // Persistent identity, not a login: this is what lets a returning stranger
  // find their own planes again without an account.
  return `${VISITOR_COOKIE}=${id}; Max-Age=${FIVE_YEARS}; Path=/; HttpOnly; SameSite=Lax`;
}

// Expired holds go back into the sky even if nobody is asking.
setInterval(() => {
  if (expireHolds().length) broadcast();
}, 5_000).unref();

interface Ctx {
  req: string;
  visitor: string;
  actor: string;
  json: boolean;
  headers: Record<string, string>;
}

function sendJson(res: ServerResponse, ctx: Ctx, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...ctx.headers });
  res.end(JSON.stringify(body));
}

// A form post (no JavaScript) goes back to the page with a short note; a
// fetch() gets JSON.
function respond(res: ServerResponse, ctx: Ctx, status: number, body: object, note?: string): void {
  if (ctx.json) return sendJson(res, ctx, status, body);
  res.writeHead(303, { location: note ? `/?note=${encodeURIComponent(note)}` : "/", ...ctx.headers });
  res.end();
}

function refused(res: ServerResponse, ctx: Ctx, action: string, r: Extract<Result<unknown>, { ok: false }>, plane?: number) {
  log({ req: ctx.req, action, outcome: "refused", actor: ctx.actor, plane, reason: r.reason });
  respond(res, ctx, r.status, { error: r.reason, message: r.message }, r.message);
}

const PLANE_PATH = /^\/api\/planes\/(\d+)(?:\/(renew|release))?$/;

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
  const cookies = parseCookies(req.headers.cookie);
  const given = cookies[VISITOR_COOKIE];
  const known = given !== undefined && VISITOR_SHAPE.test(given);
  const visitor = known ? given : randomUUID();
  const ctx: Ctx = {
    req: requestId(),
    visitor,
    actor: handleFor(visitor),
    json: (req.headers["content-type"] ?? "").startsWith("application/json") || url.pathname.startsWith("/api/"),
    headers: known ? {} : { "set-cookie": visitorCookie(visitor) },
  };
  const isWrite = req.method === "POST";
  // Only pages and writes hand out an identity worth logging; a script or
  // asset fetch without a cookie doesn't.
  if (!known && (url.pathname === "/" || isWrite)) {
    log({ req: ctx.req, action: "visitor_issue", outcome: "ok", actor: ctx.actor, replaced: given !== undefined });
  }

  try {
    if (isWrite && crossSite(req)) {
      log({ req: ctx.req, action: "write", outcome: "refused", actor: ctx.actor, reason: "cross_site", path: url.pathname });
      return sendJson(res, ctx, 403, { error: "cross_site", message: "Writes have to come from this site." });
    }

    if (url.pathname === "/" && req.method === "GET") {
      const hold = currentHold(visitor);
      const held = hold ? publicPlane(hold.planeId, visitor) : undefined;
      const mine = publicPlanes(myPlanes(visitor, Number.MAX_SAFE_INTEGER, 20), visitor);
      const html = renderSky({
        handle: ctx.actor,
        hold: hold && held ? { ...hold, plane: held } : undefined,
        mine,
        cursor: newestEventId(),
        note: url.searchParams.get("note") ?? undefined,
        formKey: randomUUID(),
      });
      res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", ...ctx.headers });
      res.end(html);
      return;
    }

    if (url.pathname === "/api/sky" && req.method === "GET") {
      const hold = currentHold(visitor);
      return sendJson(res, ctx, 200, {
        cursor: newestEventId(),
        handle: ctx.actor,
        planes: publicPlanes(flyingSample(SKY_SAMPLE), visitor),
        hold: hold ? { planeId: hold.planeId, leaseId: hold.leaseId, expires: hold.expires, plane: publicPlane(hold.planeId, visitor) } : null,
      });
    }

    if (url.pathname === "/api/mine" && req.method === "GET") {
      const before = Number(url.searchParams.get("before")) || Number.MAX_SAFE_INTEGER;
      const planes = publicPlanes(myPlanes(visitor, before, 20), visitor);
      return sendJson(res, ctx, 200, { planes, more: planes.length === 20 });
    }

    if ((url.pathname === "/api/planes" || url.pathname === "/planes") && isWrite) {
      if (overLimit(visitor, "create")) {
        return refused(res, ctx, "plane_create", { ok: false, status: 429, reason: "rate_limited", message: "That's a lot of planes. Try again in a minute." });
      }
      const f = await readFields(req);
      const r = createPlane(visitor, { key: f.key, colour: f.colour, body: f.body, country: f.country, city: f.city });
      if (!r.ok) return refused(res, ctx, "plane_create", r);
      const plane = publicPlane(r.value.id, visitor)!;
      log({
        req: ctx.req,
        action: "plane_create",
        outcome: "ok",
        actor: ctx.actor,
        plane: plane.id,
        colour: plane.colour,
        origin: plane.stamps[0]?.country,
        chars: [...plane.body].length,
        replayed: r.value.replayed,
      });
      if (!r.value.replayed) broadcast();
      return respond(res, ctx, r.value.replayed ? 200 : 201, { plane }, "Your plane is in the sky.");
    }

    if ((url.pathname === "/api/catch" || url.pathname === "/catch") && isWrite) {
      if (overLimit(visitor, "catch")) {
        return refused(res, ctx, "plane_catch", { ok: false, status: 429, reason: "rate_limited", message: "Slow down a little and try again." });
      }
      const f = await readFields(req);
      const r = catchPlane(visitor, f.plane);
      if (!r.ok) return refused(res, ctx, "plane_catch", r, Number(f.plane) || undefined);
      const plane = publicPlane(r.value.planeId, visitor)!;
      log({ req: ctx.req, action: "plane_catch", outcome: "ok", actor: ctx.actor, plane: plane.id, creator: plane.author, self: r.value.self, asked: f.plane ? "this" : "any" });
      broadcast();
      return respond(res, ctx, 200, {
        plane,
        lease: { id: r.value.leaseId, expires: r.value.expires },
        self: r.value.self,
      });
    }

    const m = url.pathname.match(PLANE_PATH) ?? url.pathname.match(/^\/planes\/(\d+)\/(release)$/);
    if (m) {
      const id = Number(m[1]);
      if (!m[2] && req.method === "GET") {
        const plane = publicPlane(id, visitor);
        return plane ? sendJson(res, ctx, 200, { plane }) : sendJson(res, ctx, 404, { error: "no_such_plane" });
      }
      if (m[2] === "renew" && isWrite) {
        const f = await readFields(req);
        const r = renewHold(visitor, id, f.lease);
        if (!r.ok) return refused(res, ctx, "lease_renew", r, id);
        return sendJson(res, ctx, 200, { lease: { id: r.value.leaseId, expires: r.value.expires } });
      }
      if (m[2] === "release" && isWrite) {
        if (overLimit(visitor, "release")) {
          return refused(res, ctx, "plane_release", { ok: false, status: 429, reason: "rate_limited", message: "Slow down a little and try again." }, id);
        }
        const f = await readFields(req);
        const r = releasePlane(visitor, id, { key: f.key, leaseId: f.lease, country: f.country, city: f.city });
        const action = f.country ? "plane_stamp" : "plane_release";
        if (!r.ok) return refused(res, ctx, action, r, id);
        const plane = publicPlane(id, visitor)!;
        const stamp = r.value.stamped ? plane.stamps.find((s) => s.seq === r.value.stamped) : undefined;
        log({ req: ctx.req, action, outcome: "ok", actor: ctx.actor, plane: id, creator: plane.author, seq: r.value.stamped, region: stamp?.country, replayed: r.value.replayed });
        if (!r.value.replayed) broadcast();
        return respond(res, ctx, 200, { plane }, stamp ? "Stamped and sent onward." : "Let go, unstamped.");
      }
    }

    if (url.pathname === "/events" && req.method === "GET") {
      // A reconnecting EventSource sends Last-Event-ID; a fresh page sends the
      // cursor it was rendered with, so nothing falls in between.
      const raw = req.headers["last-event-id"] ?? url.searchParams.get("since") ?? "";
      openStream(res, visitor, parseCursor(String(raw)), ctx.req);
      return;
    }

    if (url.pathname === "/archive" && req.method === "GET") {
      const asked = url.searchParams.get("kind") ?? "";
      const kind = isKind(asked) ? asked : undefined;
      const traces = recentTraces(500, kind);
      const html = renderArchive(traces, repliesFor(traces.map((t) => t.id)), visitor, kind);
      res.writeHead(200, { "content-type": "text/html; charset=utf-8", ...ctx.headers });
      res.end(html);
      return;
    }

    const file = STATIC[url.pathname];
    if (file && req.method === "GET") {
      res.writeHead(200, { "content-type": `${file.type}; charset=utf-8`, "cache-control": "no-cache" });
      res.end(file.body);
      return;
    }

    if (url.pathname === "/readme/" && req.method === "GET") {
      const md = readFileSync("README.md", "utf8");
      const html = renderReadme(await marked.parse(md));
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(html);
      return;
    }

    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("not found");
  } catch (err) {
    if (err instanceof TooLarge) {
      log({ req: ctx.req, action: "write", outcome: "refused", actor: ctx.actor, reason: "body_too_large", path: url.pathname });
      if (!res.headersSent) {
        ctx.headers.connection = "close";
        sendJson(res, ctx, 413, { error: "body_too_large", message: "That request is too large." });
      }
      return;
    }
    if (err instanceof SyntaxError) {
      log({ req: ctx.req, action: "write", outcome: "refused", actor: ctx.actor, reason: "bad_json", path: url.pathname });
      return sendJson(res, ctx, 400, { error: "bad_json", message: "That request wasn't valid JSON." });
    }
    log({ req: ctx.req, action: "request", outcome: "error", actor: ctx.actor, path: url.pathname, reason: String(err) });
    console.error(err);
    if (!res.headersSent) {
      res.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
      res.end("internal error");
    }
  }
});

server.listen(PORT, "0.0.0.0", () => {
  log({ action: "server_start", outcome: "ok", port: PORT });
});
