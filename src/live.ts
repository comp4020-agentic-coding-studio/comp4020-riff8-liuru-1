import type { ServerResponse } from "node:http";
import type { Trace } from "./db.ts";
import { renderTrace } from "./templates.ts";

// Every open page holds one server-sent-events stream. One process on one Fly
// machine (`--ha=false`), so an in-memory set is the whole fan-out: there's no
// second machine whose visitors would miss a broadcast.
interface Listener {
  res: ServerResponse;
  visitorId: string;
}

const listeners = new Set<Listener>();

// SSE comments keep Fly's proxy (and any idle-timeout in between) from
// dropping a quiet stream.
const KEEPALIVE_MS = 25_000;

export function openStream(res: ServerResponse, visitorId: string, missed: Trace[]): void {
  res.writeHead(200, {
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-cache, no-transform",
    connection: "keep-alive",
    "x-accel-buffering": "no",
  });
  // ask a dropped stream to come back quickly; the browser does the rest
  res.write("retry: 1000\n\n");
  const listener = { res, visitorId };
  for (const t of missed) send(listener, t);
  listeners.add(listener);
  const keepalive = setInterval(() => res.write(": still here\n\n"), KEEPALIVE_MS);
  res.on("close", () => {
    clearInterval(keepalive);
    listeners.delete(listener);
  });
}

// Each listener gets HTML rendered for its own visitor, so "yours" is marked
// the same way live as it is on a fresh load.
function send(listener: Listener, t: Trace): void {
  const data = JSON.stringify({ id: t.id, kind: t.kind, html: renderTrace(t, listener.visitorId) });
  listener.res.write(`event: trace\nid: ${t.id}\ndata: ${data}\n\n`);
}

export function broadcast(t: Trace): void {
  for (const listener of listeners) send(listener, t);
}
