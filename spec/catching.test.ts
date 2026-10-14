import { expect, inject, it } from "vitest";
import { api, catchPlane, newKey, throwPlane, visitor } from "./sse.ts";

// Who may change a plane: only whoever holds its current lease, and only by
// stamping it or letting it go. Nobody, holder included, can touch its
// message, colour, origin or earlier stamps.

async function fresh(who = visitor("author")) {
  const res = await throwPlane(who, { country: "AU", city: "AU-canberra" });
  return res.data.plane as { id: number; body: string; author: string };
}

const release = (who: string, id: number, lease: string, extra: Record<string, string> = {}, key = newKey()) =>
  api(who, `/api/planes/${id}/release`, { key, lease, ...extra });

it("two visitors catching the same plane at once: exactly one gets it", async () => {
  const plane = await fresh();
  const catchers = Array.from({ length: 6 }, (_, i) => visitor(`racer${i}`));
  const results = await Promise.all(catchers.map((c) => catchPlane(c, plane.id)));
  const won = results.filter((r) => r.status === 200);
  expect(won).toHaveLength(1);
  for (const r of results.filter((r) => r.status !== 200)) {
    expect(r.status).toBe(409);
    expect(r.data.error).toBe("already_caught");
    expect(r.data.message).toBe("That plane has already been caught. Try another.");
  }
  // and it's no longer flying for anyone else
  const read = await api(visitor("reader"), `/api/planes/${plane.id}`);
  expect(read.data.plane.flying).toBe(false);
});

it("the catcher stamps it and sends it on: the same plane, one more stamp, everything else untouched", async () => {
  const a = visitor("a");
  const b = visitor("b");
  const plane = await fresh(a);
  const caught = await catchPlane(b, plane.id);
  expect(caught.data.plane.body).toBe(plane.body);
  const res = await release(b, plane.id, caught.data.lease.id, {
    country: "JP",
    city: "JP-tokyo",
    // none of these are anything the server reads
    body: "rewritten",
    colour: "coral",
  });
  expect(res.status).toBe(200);
  const after = (await api(a, "/api/mine")).data.planes.find((p: { id: number }) => p.id === plane.id);
  expect(after.body).toBe(plane.body);
  expect(after.colour).toBe("blue");
  expect(after.flying).toBe(true);
  expect(after.stamps.map((s: { label: string }) => s.label)).toEqual(["Canberra, Australia", "Tokyo, Japan"]);
  expect(after.stamps[0].by).toBe(plane.author);
  expect(after.stamps[1].by).not.toBe(plane.author);
});

it("releasing without a stamp adds nothing to the history", async () => {
  const plane = await fresh();
  const b = visitor("b");
  const caught = await catchPlane(b, plane.id);
  expect((await release(b, plane.id, caught.data.lease.id)).status).toBe(200);
  const after = await api(b, `/api/planes/${plane.id}`);
  expect(after.data.plane.stamps).toHaveLength(1);
  expect(after.data.plane.flying).toBe(true);
});

it("someone without the lease can't stamp or release a held plane, even with the lease id", async () => {
  const plane = await fresh();
  const holder = visitor("holder");
  const thief = visitor("thief");
  const caught = await catchPlane(holder, plane.id);
  const forged = await release(thief, plane.id, caught.data.lease.id, { country: "FR" });
  expect(forged.status).toBe(409);
  expect(forged.data.error).toBe("lease_lost");
  const guessed = await release(thief, plane.id, "not-a-lease", { country: "FR" });
  expect(guessed.status).toBe(409);
  // the holder still can
  expect((await release(holder, plane.id, caught.data.lease.id, { country: "FR" })).status).toBe(200);
});

it("an old lease can't act on a later catch of the same plane", async () => {
  const plane = await fresh();
  const b = visitor("b");
  const first = await catchPlane(b, plane.id);
  await release(b, plane.id, first.data.lease.id);
  const second = await catchPlane(b, plane.id);
  expect(second.data.lease.id).not.toBe(first.data.lease.id);
  const stale = await release(b, plane.id, first.data.lease.id, { country: "DE" });
  expect(stale.status).toBe(409);
  expect((await release(b, plane.id, second.data.lease.id)).status).toBe(200);
});

it("a repeated stamp request lands once; the same key with a different stamp is refused", async () => {
  const plane = await fresh();
  const b = visitor("b");
  const caught = await catchPlane(b, plane.id);
  const key = newKey();
  const results = await Promise.all(
    Array.from({ length: 4 }, () => release(b, plane.id, caught.data.lease.id, { country: "KR" }, key)),
  );
  expect(results.every((r) => r.status === 200)).toBe(true);
  const after = await api(b, `/api/planes/${plane.id}`);
  expect(after.data.plane.stamps).toHaveLength(2);
  const other = await release(b, plane.id, caught.data.lease.id, { country: "CN" }, key);
  expect(other.status).toBe(409);
  expect(other.data.error).toBe("key_reused");
});

it("one plane in hand at a time", async () => {
  const b = visitor("greedy");
  const p1 = await fresh();
  const p2 = await fresh();
  expect((await catchPlane(b, p1.id)).status).toBe(200);
  const second = await catchPlane(b, p2.id);
  expect(second.status).toBe(409);
  expect(second.data.error).toBe("already_holding");
});

it("a refreshed page gets its hold back; nobody else's page does", async () => {
  const plane = await fresh();
  const b = visitor("b");
  const caught = await catchPlane(b, plane.id);
  const sky = await api(b, "/api/sky");
  expect(sky.data.hold).toMatchObject({ planeId: plane.id, leaseId: caught.data.lease.id });
  const other = await api(visitor("c"), "/api/sky");
  expect(other.data.hold).toBeNull();
  // and the held plane isn't in anyone's flying sample
  expect(other.data.planes.some((p: { id: number }) => p.id === plane.id)).toBe(false);
});

it("renewing keeps the hold; only the holder can renew", async () => {
  const plane = await fresh();
  const b = visitor("b");
  const caught = await catchPlane(b, plane.id);
  const renewed = await api(b, `/api/planes/${plane.id}/renew`, { lease: caught.data.lease.id });
  expect(renewed.status).toBe(200);
  expect(renewed.data.lease.expires).toBeGreaterThanOrEqual(caught.data.lease.expires);
  const other = await api(visitor("c"), `/api/planes/${plane.id}/renew`, { lease: caught.data.lease.id });
  expect(other.status).toBe(409);
});

it("catching any plane prefers someone else's", async () => {
  const me = visitor("picky");
  await fresh(me);
  await fresh();
  const caught = await catchPlane(me);
  expect(caught.status).toBe(200);
  expect(caught.data.self).toBe(false);
  expect(caught.data.plane.mine).toBe(false);
});

it("refuses a write from another site, an oversized body, and broken JSON", async () => {
  const v = visitor("guard");
  const cross = await api(v, "/api/catch", {}, { origin: "https://evil.example" });
  expect(cross.status).toBe(403);
  expect(cross.data.error).toBe("cross_site");
  const big = await api(v, "/api/planes", { key: newKey(), colour: "blue", country: "AU", body: "x".repeat(20_000) });
  expect(big.status).toBe(413);
  const res = await fetch(new URL("/api/catch", inject("baseUrl")), {
    method: "POST",
    headers: { cookie: `visitor=${v}`, "content-type": "application/json" },
    body: "{not json",
  });
  expect(res.status).toBe(400);
});

it("a malformed cookie gets a fresh identity rather than an error", async () => {
  const res = await fetch(new URL("/", inject("baseUrl")), { headers: { cookie: "visitor=%E0%A4%A" } });
  expect(res.status).toBe(200);
  expect(res.headers.get("set-cookie")).toMatch(/^visitor=/);
});
