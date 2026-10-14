// Rules the browser and the server both apply, so a draft the page accepts is
// one the server accepts. Plain JS because the browser loads this file as-is.

export const MAX_BODY = 240;

// Six equal papers. Order is the order the swatches appear in.
export const COLOURS = [
  { id: "coral", name: "Coral", hex: "#F27D8A" },
  { id: "orange", name: "Orange", hex: "#F6A66B" },
  { id: "yellow", name: "Yellow", hex: "#F2D46B" },
  { id: "mint", name: "Mint", hex: "#81C8AB" },
  { id: "blue", name: "Blue", hex: "#7CAFE5" },
  { id: "lavender", name: "Lavender", hex: "#AE94D8" },
];

/** @param {unknown} id */
export function isColour(id) {
  return COLOURS.some((c) => c.id === id);
}

/** Line endings normalised to \n; nothing else changes, leading and trailing whitespace included. */
export function normaliseBody(/** @type {string} */ text) {
  return text.replace(/\r\n?/g, "\n");
}

/** Length in Unicode code points, so an emoji or a CJK character counts once. */
export function codePoints(/** @type {string} */ text) {
  let n = 0;
  for (const _ of text) n++;
  return n;
}

/** Why a (normalised) body can't be sent, or null when it can. */
export function bodyProblem(/** @type {string} */ text) {
  if (text.trim().length === 0) return "Write something first.";
  const n = codePoints(text);
  if (n > MAX_BODY) return `That's ${n} characters; the paper holds ${MAX_BODY}.`;
  return null;
}

/** First line of a body, cut to fit a wing; never changes the stored body. */
export function wingPreview(/** @type {string} */ text, max = 28) {
  const first = text.split("\n").find((l) => l.trim()) ?? "";
  const chars = [...first.trim()];
  return chars.length > max ? chars.slice(0, max - 1).join("") + "…" : chars.join("");
}

// Approximate great-circle distance between two catalogue centres, in km.
export function distanceKm(
  /** @type {number} */ lat1,
  /** @type {number} */ lng1,
  /** @type {number} */ lat2,
  /** @type {number} */ lng2,
) {
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLng = (lng2 - lng1) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(a)));
}
