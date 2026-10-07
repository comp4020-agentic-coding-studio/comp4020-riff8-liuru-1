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
