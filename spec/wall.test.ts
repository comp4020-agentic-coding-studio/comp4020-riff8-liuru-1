import { JSDOM } from "jsdom";
import { expect, inject, it } from "vitest";

// What the wall page itself has to say and do, read from the served HTML with
// no script running.
const baseUrl = inject("baseUrl");

async function page(path = "/"): Promise<Document> {
  const html = await (await fetch(new URL(path, baseUrl))).text();
  return new JSDOM(html).window.document;
}

it("says what the six as-ifs are, on the wall itself", async () => {
  const doc = await page();
  const section = doc.querySelector("section.as-ifs");
  expect(section, "no section.as-ifs on the wall").not.toBeNull();
  const text = section!.textContent ?? "";
  expect(text).toContain("一切有為法，如夢幻泡影，如露亦如電，應作如是觀");
  expect(text).toContain("Diamond Sūtra");
  for (const simile of ["dream", "illusion", "bubble", "shadow", "dew", "lightning"]) {
    expect(text, `the gloss doesn't name ${simile}`).toContain(simile);
  }
});

const KINDS = ["dream", "illusion", "bubble", "shadow", "dew", "lightning"];

it("each of the six filters shows only its own kind, and they add up to the whole wall", async () => {
  const marker = `spec-filter-${Math.random().toString(36).slice(2)}`;
  // uneven on purpose, so a filter that ignores its kind can't tie by luck
  const posted = KINDS.flatMap((kind, i) => Array.from({ length: i + 1 }, () => kind));
  await Promise.all(
    posted.map((kind, n) =>
      fetch(new URL("/trace", baseUrl), {
        method: "POST",
        headers: { cookie: `visitor=spec-filter-${n % 4}` },
        body: new URLSearchParams({ kind, text: `${marker} ${n}` }),
        redirect: "manual",
      }),
    ),
  );

  const marked = (doc: Document) =>
    [...doc.querySelectorAll("li.trace")].filter((li) => li.textContent?.includes(marker));

  const whole = marked(await page("/"));
  expect(whole).toHaveLength(posted.length);

  let sum = 0;
  for (const kind of KINDS) {
    const doc = await page(`/?kind=${kind}`);
    for (const li of doc.querySelectorAll("li.trace")) {
      expect(li.getAttribute("data-kind"), `?kind=${kind} showed another kind`).toBe(kind);
    }
    const mine = marked(doc);
    expect(mine).toHaveLength(posted.filter((k) => k === kind).length);
    // still newest first inside a filter
    const ids = mine.map((li) => Number(li.id.replace("trace-", "")));
    expect(ids).toEqual([...ids].sort((a, b) => b - a));
    expect(doc.querySelector(`nav.filters a[aria-current="page"]`)?.getAttribute("href")).toBe(
      `/?kind=${kind}`,
    );
    sum += mine.length;
  }
  expect(sum).toBe(whole.length);
});

it("an unknown filter shows the whole wall rather than an empty one", async () => {
  const doc = await page("/?kind=custom");
  expect(doc.querySelector("ul.wall")?.hasAttribute("data-kind")).toBe(false);
  expect(doc.querySelector(`nav.filters a[aria-current="page"]`)?.getAttribute("href")).toBe("/");
});

it("sound starts off, behind a control that only appears once its script runs", async () => {
  const toggle = (await page()).querySelector("form.trace-form button.sound-toggle");
  expect(toggle, "no sound toggle in the form").not.toBeNull();
  expect(toggle!.getAttribute("aria-pressed")).toBe("false");
  expect(toggle!.hasAttribute("hidden")).toBe(true);

  const res = await fetch(new URL("/sound.js", baseUrl));
  expect(res.headers.get("content-type")).toMatch(/javascript/);
  // the script itself has to honour reduced motion, not just the CSS
  expect(await res.text()).toContain("prefers-reduced-motion: reduce");
});
