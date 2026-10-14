import { expect, inject } from "vitest";

// Shared by the plane specs: a visitor is a cookie, and listen() is one open
// page's /events stream, read the way EventSource reads it.
const baseUrl = inject("baseUrl");

export function randomText(): string {
  return `spec-${Math.random().toString(36).slice(2)}`;
}

export const visitor = (name: string): string => `spec-${name}-${Math.random().toString(36).slice(2, 10)}`;
export const newKey = (): string => `k${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;

export interface Event {
  event: string;
  id: string;
  data: string;
}

// Opens /events as `who` and collects parsed events until stopped.
export async function listen(who: string, headers: Record<string, string> = {}, query = "") {
  const controller = new AbortController();
  const res = await fetch(new URL(`/events${query}`, baseUrl), {
    headers: { cookie: `visitor=${who}`, ...headers },
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

export interface ApiResult {
  status: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any;
}

// A JSON write as `who`, the way the page's own script sends it.
export async function api(who: string, path: string, body?: unknown, headers: Record<string, string> = {}): Promise<ApiResult> {
  const res = await fetch(new URL(path, baseUrl), {
    method: body === undefined ? "GET" : "POST",
    headers: { cookie: `visitor=${who}`, ...(body === undefined ? {} : { "content-type": "application/json" }), ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, data: await res.json().catch(() => ({})) };
}

export async function throwPlane(
  who: string,
  fields: Partial<{ colour: string; body: string; country: string; city: string; key: string }> = {},
): Promise<ApiResult> {
  return api(who, "/api/planes", {
    key: newKey(),
    colour: "blue",
    body: randomText(),
    country: "AU",
    city: "AU-canberra",
    ...fields,
  });
}

export async function catchPlane(who: string, plane?: number): Promise<ApiResult> {
  return api(who, "/api/catch", plane === undefined ? {} : { plane });
}
