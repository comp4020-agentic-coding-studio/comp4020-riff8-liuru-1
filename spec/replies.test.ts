import { JSDOM } from "jsdom";
import { expect, inject, it } from "vitest";
import { listen, post, randomText } from "./sse.ts";

// Answers: a second voice under someone's trace. Small (140 characters),
// oldest first under the trace they answer, live like traces, and they never
// move their trace on the wall.
const baseUrl = inject("baseUrl");

async function page(path = "/", visitor = "spec-reader"): Promise<Document> {
  const res = await fetch(new URL(path, baseUrl), { headers: { cookie: `visitor=${visitor}` } });
  return new JSDOM(await res.text()).window.document;
}

// Posts a trace and returns its id, read back off the wall.
async function newTrace(visitor = "spec-author"): Promise<{ id: number; text: string }> {
  const text = randomText();
  await post(visitor, { kind: "bubble", text });
  const li = [...(await page()).querySelectorAll("li.trace")].find((li) => li.textContent?.includes(text));
  expect(li, "the trace didn't reach the wall").toBeDefined();
  return { id: Number(li!.id.replace("trace-", "")), text };
}

function answers(doc: Document, traceId: number): string[] {
  return [...doc.querySelectorAll(`#trace-${traceId} ol.replies li.reply .text`)].map((el) => el.textContent ?? "");
}

it("an answer appears under the trace it answers, oldest first, marked yours only for its writer", async () => {
  const trace = await newTrace();
  const first = randomText();
  const second = randomText();
  const res = await post("spec-answerer", { trace: String(trace.id), text: first }, "/reply");
  expect(res.status).toBe(303);
  expect(res.headers.get("location")).toBe(`/#trace-${trace.id}`);
  await post("spec-someone", { trace: String(trace.id), text: second }, "/reply");

  const asAnswerer = answers(await page("/", "spec-answerer"), trace.id);
  expect(asAnswerer).toEqual([`yours: ${first}`, second]);
  const asReader = answers(await page("/", "spec-reader"), trace.id);
  expect(asReader).toEqual([first, second]);
});

it("drops an answer to a trace that doesn't exist, and an empty one", async () => {
  const trace = await newTrace();
  const w = await listen("spec-dropwatch-replies");
  // a real answer first, so a dropped one straight after it has something to
  // be confused with
  const real = randomText();
  await post("spec-answerer", { trace: String(trace.id), text: real }, "/reply");
  const ghost = randomText();
  const res = await post("spec-answerer", { trace: "999999999", text: ghost }, "/reply");
  expect(res.status).toBe(303);
  await post("spec-answerer", { trace: "not-a-number", text: ghost }, "/reply");
  await post("spec-answerer", { trace: String(trace.id), text: "   " }, "/reply");
  const last = randomText();
  await post("spec-answerer", { trace: String(trace.id), text: last }, "/reply");
  try {
    await w.waitFor((e) => e.event === "reply" && e.data.includes(last));
    expect(w.events.filter((e) => e.event === "reply" && e.data.includes(`"traceId":${trace.id}`))).toHaveLength(2);
    expect(w.events.some((e) => e.data.includes(ghost))).toBe(false);
    // a dropped answer mustn't trigger a re-send of an older one either:
    // every answer on a stream is new, so their ids only ever go up
    const ids = w.events.filter((e) => e.event === "reply").map((e) => JSON.parse(e.data).id as number);
    for (let i = 1; i < ids.length; i++) expect(ids[i]).toBeGreaterThan(ids[i - 1]);
  } finally {
    await w.close();
  }
  expect(answers(await page(), trace.id)).toEqual([real, last]);
  expect((await (await fetch(new URL("/", baseUrl))).text()).includes(ghost)).toBe(false);
});

it("caps an answer at 140 characters", async () => {
  const trace = await newTrace();
  const marker = randomText();
  const over = marker + "y".repeat(200 - marker.length);
  await post("spec-answerer", { trace: String(trace.id), text: over }, "/reply");
  expect(answers(await page(), trace.id)).toEqual([over.slice(0, 140)]);
});

it("an answer reaches three other open sessions within a second", async () => {
  const trace = await newTrace();
  const watchers = await Promise.all(["r1", "r2", "r3"].map((v) => listen(`spec-${v}`)));
  const text = randomText();
  await post("spec-answerer", { trace: String(trace.id), text }, "/reply");
  try {
    for (const w of watchers) {
      const e = await w.waitFor((e) => e.event === "reply" && e.data.includes(text));
      expect(JSON.parse(e.data).traceId).toBe(trace.id);
    }
  } finally {
    await Promise.all(watchers.map((w) => w.close()));
  }
});

it("two people answering the same trace at once both land, in the same order for everyone", async () => {
  const trace = await newTrace();
  const watchers = await Promise.all(["c1", "c2", "c3"].map((v) => listen(`spec-${v}`)));
  const texts = [randomText(), randomText(), randomText(), randomText()];
  await Promise.all(texts.map((text, i) => post(`spec-crowd-${i}`, { trace: String(trace.id), text }, "/reply")));
  try {
    const orders: string[][] = [];
    for (const w of watchers) {
      for (const t of texts) await w.waitFor((e) => e.event === "reply" && e.data.includes(t));
      orders.push(
        w.events
          .filter((e) => e.event === "reply" && e.data.includes(`"traceId":${trace.id}`))
          .map((e) => texts.find((t) => e.data.includes(t))!),
      );
    }
    // nobody's answer is lost or doubled, every stream agrees on the order,
    // and a fresh load shows that same order
    for (const order of orders) expect(order).toEqual(orders[0]);
    expect([...orders[0]].sort()).toEqual([...texts].sort());
    expect(answers(await page(), trace.id)).toEqual(orders[0]);
  } finally {
    await Promise.all(watchers.map((w) => w.close()));
  }
});

it("answering an older trace doesn't move it up the wall", async () => {
  const older = await newTrace();
  const newer = await newTrace();
  await post("spec-answerer", { trace: String(older.id), text: randomText() }, "/reply");
  const ids = [...(await page()).querySelectorAll("li.trace")].map((li) => li.id);
  expect(ids.indexOf(`trace-${newer.id}`)).toBeLessThan(ids.indexOf(`trace-${older.id}`));
});

it("replays answers a dropped stream missed when it reconnects", async () => {
  const trace = await newTrace();
  const first = await listen("spec-reconnect-replies");
  const before = randomText();
  await post("spec-answerer", { trace: String(trace.id), text: before }, "/reply");
  const seen = await first.waitFor((e) => e.data.includes(before));
  await first.close();

  const missed = randomText();
  await post("spec-answerer", { trace: String(trace.id), text: missed }, "/reply");
  const again = await listen("spec-reconnect-replies", { "last-event-id": seen.id });
  try {
    await again.waitFor((e) => e.event === "reply" && e.data.includes(missed));
    expect(again.events.some((e) => e.data.includes(before))).toBe(false);
  } finally {
    await again.close();
  }
});

it("answering from a filtered view goes back to that view", async () => {
  const trace = await newTrace();
  const doc = await page("/?kind=bubble");
  const form = doc.querySelector(`#trace-${trace.id} form.reply-form`);
  expect(form?.querySelector("input[name=view]")?.getAttribute("value")).toBe("bubble");
  const res = await post("spec-answerer", { trace: String(trace.id), view: "bubble", text: randomText() }, "/reply");
  expect(res.headers.get("location")).toBe(`/?kind=bubble#trace-${trace.id}`);
});
