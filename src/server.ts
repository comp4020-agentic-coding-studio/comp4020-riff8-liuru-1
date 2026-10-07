import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createServer, type IncomingMessage } from "node:http";
import { marked } from "marked";
import {
  addReply,
  addTrace,
  isKind,
  newestReplyId,
  newestTraceId,
  recentTraces,
  repliesFor,
  repliesSince,
  traceById,
  tracesSince,
} from "./db.ts";
import { broadcastReply, broadcastTrace, openStream, parseCursor } from "./live.ts";
import { renderReadme, renderWall } from "./templates.ts";

const PORT = Number(process.env.PORT ?? 8080);
const VISITOR_COOKIE = "visitor";
const FIVE_YEARS = 60 * 60 * 24 * 365 * 5;
// The browser scripts, read once: progressive enhancement over plain forms.
const SCRIPTS: Record<string, string> = Object.fromEntries(
  ["client.js", "sound.js"].map((f) => [`/${f}`, readFileSync(new URL(`./${f}`, import.meta.url), "utf8")]),
);

function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    out[part.slice(0, eq).trim()] = decodeURIComponent(part.slice(eq + 1).trim());
  }
  return out;
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function visitorCookie(id: string): string {
  // Persistent identity, not a login: this is what lets a returning stranger
  // find their own trace again without an account.
  return `${VISITOR_COOKIE}=${id}; Max-Age=${FIVE_YEARS}; Path=/; HttpOnly; SameSite=Lax`;
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
  const cookies = parseCookies(req.headers.cookie);
  const existingVisitor = cookies[VISITOR_COOKIE];
  const visitorId = existingVisitor ?? randomUUID();
  const setCookie = existingVisitor ? undefined : visitorCookie(visitorId);

  try {
    if (url.pathname === "/" && req.method === "GET") {
      const asked = url.searchParams.get("kind") ?? "";
      const kind = isKind(asked) ? asked : undefined;
      const traces = recentTraces(200, kind);
      const replies = repliesFor(traces.map((t) => t.id));
      const since = `${newestTraceId()}.${newestReplyId()}`;
      const html = renderWall(traces, replies, visitorId, kind, since);
      res.writeHead(200, {
        "content-type": "text/html; charset=utf-8",
        ...(setCookie ? { "set-cookie": setCookie } : {}),
      });
      res.end(html);
      return;
    }

    if (url.pathname === "/trace" && req.method === "POST") {
      const raw = await readBody(req);
      const params = new URLSearchParams(raw);
      const kind = params.get("kind") ?? "";
      const text = (params.get("text") ?? "").trim().slice(0, 240);
      if (isKind(kind) && text.length > 0) {
        const trace = traceById(addTrace(visitorId, kind, text));
        if (trace) broadcastTrace(trace);
      }
      res.writeHead(303, {
        location: "/",
        ...(setCookie ? { "set-cookie": setCookie } : {}),
      });
      res.end();
      return;
    }

    if (url.pathname === "/events" && req.method === "GET") {
      // A reconnecting EventSource sends Last-Event-ID; a fresh one carries
      // the newest id its page was rendered with, so a trace posted between
      // render and connect isn't lost either way.
      // A stream with neither starts from now.
      const raw = req.headers["last-event-id"] ?? url.searchParams.get("since") ?? "";
      const since = parseCursor(String(raw));
      if (since) {
        const missed = { traces: tracesSince(since.trace), replies: repliesSince(since.reply) };
        openStream(res, visitorId, since, missed);
      } else {
        const now = { trace: newestTraceId(), reply: newestReplyId() };
        openStream(res, visitorId, now, { traces: [], replies: [] });
      }
      return;
    }

    if (url.pathname === "/reply" && req.method === "POST") {
      const raw = await readBody(req);
      const params = new URLSearchParams(raw);
      const traceId = Number(params.get("trace"));
      const text = (params.get("text") ?? "").trim().slice(0, 140);
      if (Number.isInteger(traceId) && text.length > 0) {
        const reply = addReply(traceId, visitorId, text);
        if (reply) broadcastReply(reply);
      }
      // back to the view the answer was written from, at the trace it answers
      const view = params.get("view") ?? "";
      const back = isKind(view) ? `/?kind=${view}` : "/";
      res.writeHead(303, {
        location: Number.isInteger(traceId) ? `${back}#trace-${traceId}` : back,
        ...(setCookie ? { "set-cookie": setCookie } : {}),
      });
      res.end();
      return;
    }

    const script = SCRIPTS[url.pathname];
    if (script !== undefined && req.method === "GET") {
      res.writeHead(200, { "content-type": "text/javascript; charset=utf-8" });
      res.end(script);
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
    console.error(err);
    res.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
    res.end("internal error");
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`listening on ${PORT}`);
});
