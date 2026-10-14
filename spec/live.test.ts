import { expect, it } from "vitest";
import { api, catchPlane, listen, newKey, throwPlane, visitor } from "./sse.ts";

// Every open page hears about every change to the sky within a second, over
// /events, and a reconnecting page is sent exactly what it missed.

it("a thrown plane reaches three other open sessions within a second, the same everywhere", async () => {
  const watchers = await Promise.all(["w1", "w2", "w3"].map((w) => listen(visitor(w))));
  const a = visitor("thrower");
  try {
    const { data } = await throwPlane(a, { colour: "orange", body: "same\neverywhere 🌏" });
    for (const w of watchers) {
      const e = await w.waitFor((e) => e.event === "sky" && JSON.parse(e.data).plane.id === data.plane.id);
      const { kind, plane } = JSON.parse(e.data);
      expect(kind).toBe("created");
      expect(plane).toMatchObject({ colour: "orange", body: "same\neverywhere 🌏", author: data.plane.author, mine: false });
      expect(plane.stamps[0].label).toBe(data.plane.stamps[0].label);
    }
  } finally {
    await Promise.all(watchers.map((w) => w.close()));
  }
});

it("marks a plane as yours on your own stream only", async () => {
  const me = visitor("self");
  const mine = await listen(me);
  const theirs = await listen(visitor("other"));
  try {
    const { data } = await throwPlane(me);
    const match = (e: { data: string }) => JSON.parse(e.data).plane.id === data.plane.id;
    expect(JSON.parse((await mine.waitFor(match)).data).plane.mine).toBe(true);
    expect(JSON.parse((await theirs.waitFor(match)).data).plane.mine).toBe(false);
  } finally {
    await mine.close();
    await theirs.close();
  }
});

it("a catch, then a stamp, reach other pages in order", async () => {
  const watcher = await listen(visitor("watch"));
  try {
    const { data } = await throwPlane(visitor("a"));
    const b = visitor("b");
    const caught = await catchPlane(b, data.plane.id);
    await api(b, `/api/planes/${data.plane.id}/release`, { key: newKey(), lease: caught.data.lease.id, country: "JP", city: "JP-tokyo" });
    await watcher.waitFor((e) => {
      const d = JSON.parse(e.data);
      return d.plane.id === data.plane.id && d.kind === "stamped";
    });
    const kinds = watcher.events
      .map((e) => JSON.parse(e.data))
      .filter((d) => d.plane.id === data.plane.id)
      .map((d) => [d.kind, d.plane.flying, d.plane.stamps.length]);
    expect(kinds).toEqual([
      ["created", true, 1],
      ["caught", false, 1],
      ["stamped", true, 2],
    ]);
  } finally {
    await watcher.close();
  }
});

it("a reconnecting stream gets exactly what it missed, nothing doubled", async () => {
  const v = visitor("reconnect");
  const first = await listen(v);
  const { data: before } = await throwPlane(visitor("x"));
  const seen = await first.waitFor((e) => JSON.parse(e.data).plane.id === before.plane.id);
  await first.close();

  const missed = [await throwPlane(visitor("y")), await throwPlane(visitor("z"))].map((r) => r.data.plane.id);
  const again = await listen(v, { "last-event-id": seen.id });
  try {
    await again.waitFor((e) => JSON.parse(e.data).plane.id === missed[1]);
    const ids = again.events.map((e) => JSON.parse(e.data).plane.id);
    expect(ids.filter((id) => missed.includes(id))).toEqual(missed);
    expect(ids).not.toContain(before.plane.id);
  } finally {
    await again.close();
  }
});
