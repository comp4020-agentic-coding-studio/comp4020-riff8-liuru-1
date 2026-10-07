import type { ServerResponse } from "node:http";
import type { Reply, Trace } from "./db.ts";
import { renderReply, renderTrace } from "./templates.ts";

// Every open page holds one server-sent-events stream. One process on one Fly
// machine (`--ha=false`), so an in-memory set is the whole fan-out: there's no
// second machine whose visitors would miss a broadcast.
interface Listener {
  res: ServerResponse;
  visitorId: string;
  cursor: Cursor;
}

// The newest trace and reply a stream has delivered, sent as each event's id
// ("<trace>.<reply>") so a reconnect can say exactly where it left off.
export interface Cursor {
  trace: number;
  reply: number;
}

export function parseCursor(raw: string): Cursor | undefined {
  const m = raw.match(/^(\d+)\.(\d+)$/);
  return m ? { trace: Number(m[1]), reply: Number(m[2]) } : undefined;
}

const listeners = new Set<Listener>();

// SSE comments keep Fly's proxy (and any idle-timeout in between) from
// dropping a quiet stream.
const KEEPALIVE_MS = 25_000;

export function openStream(
  res: ServerResponse,
  visitorId: string,
  cursor: Cursor,
  missed: { traces: Trace[]; replies: Reply[] },
): void {
  res.writeHead(200, {
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-cache, no-transform",
    connection: "keep-alive",
    "x-accel-buffering": "no",
  });
  // ask a dropped stream to come back quickly; the browser does the rest
  res.write("retry: 1000\n\n");
  const listener = { res, visitorId, cursor: { ...cursor } };
  // traces before replies, so an answer to a missed trace has somewhere to go
  for (const t of missed.traces) sendTrace(listener, t);
  for (const r of missed.replies) sendReply(listener, r);
  listeners.add(listener);
  const keepalive = setInterval(() => res.write(": still here\n\n"), KEEPALIVE_MS);
  res.on("close", () => {
    clearInterval(keepalive);
    listeners.delete(listener);
  });
}

function write(listener: Listener, event: string, payload: object): void {
  const { trace, reply } = listener.cursor;
  listener.res.write(`event: ${event}\nid: ${trace}.${reply}\ndata: ${JSON.stringify(payload)}\n\n`);
}

// Each listener gets HTML rendered for its own visitor, so "yours" is marked
// the same way live as it is on a fresh load.
function sendTrace(listener: Listener, t: Trace): void {
  listener.cursor.trace = Math.max(listener.cursor.trace, t.id);
  write(listener, "trace", { id: t.id, kind: t.kind, html: renderTrace(t, listener.visitorId, []) });
}

function sendReply(listener: Listener, r: Reply): void {
  listener.cursor.reply = Math.max(listener.cursor.reply, r.id);
  write(listener, "reply", { id: r.id, traceId: r.traceId, html: renderReply(r, listener.visitorId) });
}

export function broadcastTrace(t: Trace): void {
  for (const listener of listeners) sendTrace(listener, t);
}

export function broadcastReply(r: Reply): void {
  for (const listener of listeners) sendReply(listener, r);
}
