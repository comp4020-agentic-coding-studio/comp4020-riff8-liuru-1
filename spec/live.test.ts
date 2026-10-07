import { expect, inject, it } from "vitest";
import { listen, post, randomText } from "./sse.ts";

// The crit-9 promise: what one visitor leaves reaches every other open page
// in about a second, over /events, without a reload. Each "visitor" here is
// its own cookie, so these are separate sessions, not tabs sharing one.
const baseUrl = inject("baseUrl");

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
