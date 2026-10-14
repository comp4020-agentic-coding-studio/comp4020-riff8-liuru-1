import { JSDOM } from "jsdom";
import { expect, inject, it } from "vitest";
import { api, newKey, randomText, throwPlane, visitor } from "./sse.ts";

// A plane: a message on one of six colours, from a place its writer chose.
// The server is the only judge of what's a valid plane, and the message comes
// back exactly as written.
const baseUrl = inject("baseUrl");

it("a thrown plane comes back with its exact message, colour, author handle and origin stamp", async () => {
  const a = visitor("a");
  const body = "从堪培拉寄来的一句话。\nHope this finds you well ✈️";
  const res = await throwPlane(a, { body, colour: "blue", country: "AU", city: "AU-canberra" });
  expect(res.status).toBe(201);
  const plane = res.data.plane;
  expect(plane.body).toBe(body);
  expect(plane.colour).toBe("blue");
  expect(plane.mine).toBe(true);
  expect(plane.flying).toBe(true);
  expect(plane.stamps).toHaveLength(1);
  expect(plane.stamps[0]).toMatchObject({ seq: 1, country: "AU", city: "AU-canberra", label: "Canberra, Australia" });

  // the same plane, read by someone else
  const seen = await api(visitor("b"), `/api/planes/${plane.id}`);
  expect(seen.data.plane.body).toBe(body);
  expect(seen.data.plane.author).toBe(plane.author);
  expect(seen.data.plane.mine).toBe(false);
});

it("counts code points: 240 emoji fit, 241 characters don't, and nothing is truncated", async () => {
  const ok = await throwPlane(visitor("len"), { body: "✈".repeat(239) + "\n" });
  expect(ok.status).toBe(201);
  expect([...ok.data.plane.body]).toHaveLength(240);
  const over = await throwPlane(visitor("len"), { body: "x".repeat(241) });
  expect(over.status).toBe(400);
  expect(over.data.error).toBe("too_long");
});

it("keeps leading and trailing whitespace, normalises line endings, and refuses whitespace-only", async () => {
  const kept = await throwPlane(visitor("ws"), { body: "  two spaces\r\nthen a line  " });
  expect(kept.data.plane.body).toBe("  two spaces\nthen a line  ");
  const empty = await throwPlane(visitor("ws"), { body: " \n\t " });
  expect(empty.status).toBe(400);
  expect(empty.data.error).toBe("empty");
});

it("refuses a colour outside the six, a made-up region, and a city from another country", async () => {
  const v = visitor("bad");
  expect((await throwPlane(v, { colour: "dream" })).data.error).toBe("bad_colour");
  expect((await throwPlane(v, { colour: "#ff0000" })).data.error).toBe("bad_colour");
  expect((await throwPlane(v, { country: "ZZ", city: "" })).data.error).toBe("bad_region");
  expect((await throwPlane(v, { country: "JP", city: "AU-canberra" })).data.error).toBe("bad_region");
  // a country alone is fine
  expect((await throwPlane(v, { country: "JP", city: "" })).status).toBe(201);
});

it("the same request key makes one plane, however often it's sent; reusing it for a different plane is refused", async () => {
  const v = visitor("dup");
  const key = newKey();
  const body = randomText();
  const results = await Promise.all(
    Array.from({ length: 5 }, () => throwPlane(v, { key, body })),
  );
  const ids = new Set(results.map((r) => r.data.plane?.id));
  expect(ids.size).toBe(1);
  expect(results.filter((r) => r.status === 201)).toHaveLength(1);
  const mine = await api(v, "/api/mine");
  expect(mine.data.planes.filter((p: { body: string }) => p.body === body)).toHaveLength(1);

  const reused = await throwPlane(v, { key, body: "something else" });
  expect(reused.status).toBe(409);
  expect(reused.data.error).toBe("key_reused");
});

it("ignores an author or owner the client claims", async () => {
  const v = visitor("forger");
  const res = await api(v, "/api/planes", {
    key: newKey(),
    colour: "mint",
    body: randomText(),
    country: "NZ",
    author: "crane-000000",
    creatorId: "someone-else",
    mine: false,
  });
  expect(res.status).toBe(201);
  expect(res.data.plane.mine).toBe(true);
  expect(res.data.plane.author).not.toBe("crane-000000");
});

it("renders every message as text, never markup", async () => {
  const v = visitor("html");
  const body = `<img src=x onerror=alert(1)> <b>bold</b> ${randomText()}`;
  await throwPlane(v, { body });
  const html = await (await fetch(new URL("/", baseUrl), { headers: { cookie: `visitor=${v}` } })).text();
  const doc = new JSDOM(html).window.document;
  // the no-JavaScript view renders the message server-side: as text, no element
  const shown = [...doc.querySelectorAll(".nojs-body")].map((el) => el.textContent);
  expect(shown).toContain(body);
  expect(doc.querySelector("noscript img, noscript b")).toBeNull();
  expect(html).not.toContain("<img src=x");
});

it("Your planes lists only this browser's planes, newest first", async () => {
  const v = visitor("mine");
  const first = await throwPlane(v, { colour: "coral" });
  const second = await throwPlane(v, { colour: "yellow" });
  await throwPlane(visitor("other"));
  const mine = await api(v, "/api/mine");
  expect(mine.data.planes.map((p: { id: number }) => p.id)).toEqual([second.data.plane.id, first.data.plane.id]);
  expect(mine.data.planes.every((p: { mine: boolean }) => p.mine)).toBe(true);
});

it("a no-JavaScript form post throws a plane too", async () => {
  const v = visitor("nojs");
  const body = randomText();
  const res = await fetch(new URL("/planes", baseUrl), {
    method: "POST",
    headers: { cookie: `visitor=${v}` },
    body: new URLSearchParams({ key: newKey(), body, colour: "lavender", place: "JP-tokyo" }),
    redirect: "manual",
  });
  expect(res.status).toBe(303);
  const mine = await api(v, "/api/mine");
  expect(mine.data.planes[0]).toMatchObject({ body, colour: "lavender" });
  expect(mine.data.planes[0].stamps[0].label).toBe("Tokyo, Japan");
});
