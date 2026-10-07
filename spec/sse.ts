import { expect, inject } from "vitest";

// Shared by the live specs: a visitor is a cookie, and listen() is one open
// page's /events stream, read the way EventSource reads it.
const baseUrl = inject("baseUrl");

export function randomText(): string {
  return `spec-${Math.random().toString(36).slice(2)}`;
}

export interface Event {
  event: string;
  id: string;
  data: string;
}

// Opens /events as `visitor` and collects parsed events until stopped.
export async function listen(visitor: string, headers: Record<string, string> = {}, query = "") {
  const controller = new AbortController();
  const res = await fetch(new URL(`/events${query}`, baseUrl), {
    headers: { cookie: `visitor=${visitor}`, ...headers },
    signal: controller.signal,
  });
  expect(res.headers.get("content-type")).toMatch(/^text\/event-stream/);
  const events: Event[] = [];
  const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  const pump = (async () => {
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) return;
        buffer += value;
        let end: number;
        while ((end = buffer.indexOf("\n\n")) !== -1) {
          const block = buffer.slice(0, end);
          buffer = buffer.slice(end + 2);
          const e: Event = { event: "message", id: "", data: "" };
          for (const line of block.split("\n")) {
            const [field, ...rest] = line.split(": ");
            const value = rest.join(": ");
            if (field === "event") e.event = value;
            if (field === "id") e.id = value;
            if (field === "data") e.data += value;
          }
          if (e.data) events.push(e);
        }
      }
    } catch {
      // aborted
    }
  })();
  return {
    events,
    async waitFor(pred: (e: Event) => boolean, ms = 1000): Promise<Event> {
      const start = Date.now();
      for (;;) {
        const hit = events.find(pred);
        if (hit) return hit;
        if (Date.now() - start > ms) throw new Error(`no matching event within ${ms}ms`);
        await new Promise((r) => setTimeout(r, 20));
      }
    },
    async close() {
      controller.abort();
      await pump;
    },
  };
}

export async function post(visitor: string, fields: Record<string, string>, path = "/trace") {
  return fetch(new URL(path, baseUrl), {
    method: "POST",
    headers: { cookie: `visitor=${visitor}` },
    body: new URLSearchParams(fields),
    redirect: "manual",
  });
}

