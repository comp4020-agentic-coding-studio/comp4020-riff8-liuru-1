import { JSDOM } from "jsdom";
import { expect, inject, it } from "vitest";

// The old wall (六如) is kept, read-only, behind a quiet link: its traces and
// answers are still there to read, and nothing new can be added to it.
const baseUrl = inject("baseUrl");

it("the archive says what the six as-ifs were, and has no form to add to it", async () => {
  const html = await (await fetch(new URL("/archive", baseUrl))).text();
  const doc = new JSDOM(html).window.document;
  expect(doc.querySelector("section.as-ifs")?.textContent).toContain("一切有為法，如夢幻泡影，如露亦如電，應作如是觀");
  expect(doc.querySelector("ul.wall")).not.toBeNull();
  expect(doc.querySelector("form")).toBeNull();
  expect(doc.querySelectorAll("nav.filters a")).toHaveLength(7);
});

it("the sky links to the archive, and writing to the old wall is gone", async () => {
  const sky = await (await fetch(new URL("/", baseUrl))).text();
  expect(sky).toContain('href="/archive"');
  const res = await fetch(new URL("/trace", baseUrl), {
    method: "POST",
    body: new URLSearchParams({ kind: "dew", text: "hello" }),
    redirect: "manual",
  });
  expect(res.status).toBe(404);
});
