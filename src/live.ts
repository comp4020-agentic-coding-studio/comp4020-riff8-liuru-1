import type { ServerResponse } from "node:http";
import { eventsSince, newestEventId, type SkyEvent } from "./db.ts";
import { handleFor, log } from "./log.ts";
import { publicPlane } from "./planes.ts";

// Every open page holds one server-sent-events stream of changes to the sky.
// One process on one Fly machine (`--ha=false`), so an in-memory set is the
// whole fan-out: there's no second machine whose visitors would miss one.
interface Listener {
  res: ServerResponse;
  visitorId: string;
  cursor: number;
}

const listeners = new Set<Listener>();
const KEEPALIVE_MS = 20_000;
// A page that missed more than this refetches the sky instead of replaying.
const REPLAY_LIMIT = 500;

export function parseCursor(raw: string): number | undefined {
  return /^\d+$/.test(raw) ? Number(raw) : undefined;
}

export function openStream(res: ServerResponse, visitorId: string, since: number | undefined, req: string): void {
  res.writeHead(200, {
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-cache, no-transform",
    connection: "keep-alive",
    "x-accel-buffering": "no",
  });
  res.write("retry: 1000\n\n");
  const listener: Listener = { res, visitorId, cursor: since ?? newestEventId() };
  if (since !== undefined) {
    const missed = eventsSince(since, REPLAY_LIMIT + 1);
    if (missed.length > REPLAY_LIMIT) {
      listener.cursor = newestEventId();
      write(listener, "reset", {});
    } else {
      for (const e of missed) send(listener, e, true);
    }
  }
  listeners.add(listener);
  const actor = handleFor(visitorId);
  log({ req, action: "stream_open", outcome: "ok", actor, since: since ?? null });
  const keepalive = setInterval(() => res.write(": still here\n\n"), KEEPALIVE_MS);
  res.on("close", () => {
    clearInterval(keepalive);
    listeners.delete(listener);
    log({ req, action: "stream_close", outcome: "ok", actor });
  });
}

function write(listener: Listener, event: string, payload: object): void {
  listener.res.write(`event: ${event}\nid: ${listener.cursor}\ndata: ${JSON.stringify(payload)}\n\n`);
}

// Each event carries the plane as it is now, rendered for this listener (so
// `mine` is right), which makes a replayed event safe to apply twice.
function send(listener: Listener, e: SkyEvent, replay: boolean): void {
  listener.cursor = Math.max(listener.cursor, e.id);
  const plane = publicPlane(e.planeId, listener.visitorId);
  if (!plane) return;
  write(listener, "sky", { kind: e.kind, replay, plane });
}

export function broadcast(): void {
  for (const listener of listeners) {
    for (const e of eventsSince(listener.cursor, REPLAY_LIMIT)) send(listener, e, false);
  }
}
