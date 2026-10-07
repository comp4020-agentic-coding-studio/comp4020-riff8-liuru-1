import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createServer, type IncomingMessage } from "node:http";
import { marked } from "marked";
import { addTrace, isKind, recentTraces, traceById, tracesSince } from "./db.ts";
import { broadcast, openStream } from "./live.ts";
import { renderReadme, renderWall } from "./templates.ts";

const PORT = Number(process.env.PORT ?? 8080);
const VISITOR_COOKIE = "visitor";
const FIVE_YEARS = 60 * 60 * 24 * 365 * 5;
const CLIENT_JS = readFileSync(new URL("./client.js", import.meta.url), "utf8");

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
      const html = renderWall(recentTraces(), visitorId);
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
        if (trace) broadcast(trace);
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
      const since = Number(req.headers["last-event-id"] ?? url.searchParams.get("since") ?? 0);
      const missed = Number.isFinite(since) && since > 0 ? tracesSince(since) : [];
      openStream(res, visitorId, missed);
      return;
    }

    if (url.pathname === "/client.js" && req.method === "GET") {
      res.writeHead(200, { "content-type": "text/javascript; charset=utf-8" });
      res.end(CLIENT_JS);
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
