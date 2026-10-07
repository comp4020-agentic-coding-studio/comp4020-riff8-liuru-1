import { expect, inject, it } from "vitest";

// The crit-9 promise: what one visitor leaves reaches every other open page
// in about a second, over /events, without a reload. Each "visitor" here is
// its own cookie, so these are separate sessions, not tabs sharing one.
const baseUrl = inject("baseUrl");

function randomText(): string {
  return `spec-live-${Math.random().toString(36).slice(2)}`;
}

interface Event {
  event: string;
  id: string;
  data: string;
}

// Opens /events as `visitor` and collects parsed events until stopped.
async function listen(visitor: string, headers: Record<string, string> = {}, query = "") {
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

async function post(visitor: string, fields: Record<string, string>, path = "/trace") {
  return fetch(new URL(path, baseUrl), {
    method: "POST",
    headers: { cookie: `visitor=${visitor}` },
    body: new URLSearchParams(fields),
    redirect: "manual",
  });
}

it("a trace one visitor leaves reaches three other open sessions within a second", async () => {
  const watchers = await Promise.all(["w1", "w2", "w3"].map((v) => listen(`spec-${v}`)));
  const text = randomText();
  await post("spec-poster", { kind: "lightning", text });
  try {
    for (const w of watchers) {
      const e = await w.waitFor((e) => e.event === "trace" && e.data.includes(text));
      const { kind, html } = JSON.parse(e.data);
      expect(kind).toBe("lightning");
      // someone else's trace, so it isn't marked as theirs
      expect(html).not.toContain("yours");
    }
  } finally {
    await Promise.all(watchers.map((w) => w.close()));
  }
});

it("marks a trace as yours on your own stream, and only there", async () => {
  const mine = await listen("spec-self");
  const theirs = await listen("spec-other");
  const text = randomText();
  await post("spec-self", { kind: "dew", text });
  try {
    const own = await mine.waitFor((e) => e.data.includes(text));
    const other = await theirs.waitFor((e) => e.data.includes(text));
    expect(JSON.parse(own.data).html).toContain("yours: ");
    expect(JSON.parse(other.data).html).not.toContain("yours: ");
  } finally {
    await Promise.all([mine.close(), theirs.close()]);
  }
});

it("does not broadcast a trace the server dropped", async () => {
  const w = await listen("spec-dropwatch");
  const text = randomText();
  await post("spec-poster", { kind: "not-a-kind", text });
  const good = randomText();
  await post("spec-poster", { kind: "dew", text: good });
  try {
    await w.waitFor((e) => e.data.includes(good));
    expect(w.events.some((e) => e.data.includes(text))).toBe(false);
  } finally {
    await w.close();
  }
});

it("replays what a dropped stream missed when it reconnects with Last-Event-ID", async () => {
  const first = await listen("spec-reconnect");
  const before = randomText();
  await post("spec-poster", { kind: "bubble", text: before });
  const seen = await first.waitFor((e) => e.data.includes(before));
  await first.close();

  const missed = randomText();
  await post("spec-poster", { kind: "shadow", text: missed });

  const again = await listen("spec-reconnect", { "last-event-id": seen.id });
  try {
    await again.waitFor((e) => e.data.includes(missed));
    // nothing from before the drop comes twice
    expect(again.events.some((e) => e.data.includes(before))).toBe(false);
  } finally {
    await again.close();
  }
});

it("a page's first stream picks up a trace posted between render and connect", async () => {
  const page = await (await fetch(new URL("/", baseUrl))).text();
  const since = page.match(/data-since="([^"]+)"/)?.[1];
  expect(since).toBeDefined();

  const between = randomText();
  await post("spec-poster", { kind: "dream", text: between });

  const w = await listen("spec-late", {}, `?since=${since}`);
  try {
    await w.waitFor((e) => e.data.includes(between));
  } finally {
    await w.close();
  }
});
