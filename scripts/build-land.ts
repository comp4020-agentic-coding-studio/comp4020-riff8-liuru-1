#!/usr/bin/env node
// Regenerates src/web/land.json, the land/sea mask the globe's facets are
// coloured and raised from: Natural Earth's 1:110m land (public domain) via
// world-atlas (ISC, Mike Bostock), rasterised to half-degree cells. Committed
// rather than built at deploy, so the runtime image needs neither package:
//   node scripts/build-land.ts
import { readFileSync, writeFileSync } from "node:fs";
import { feature } from "topojson-client";
import type { GeometryCollection, Topology } from "topojson-specification";

const W = 720;
const H = 360;
const topo = JSON.parse(readFileSync("node_modules/world-atlas/land-110m.json", "utf8")) as Topology;
const land = feature(topo, topo.objects.land as GeometryCollection) as GeoJSON.FeatureCollection;
const rings: [number, number][][] = [];
for (const f of land.features) {
  const g = f.geometry;
  const polys = g.type === "Polygon" ? [g.coordinates] : g.type === "MultiPolygon" ? g.coordinates : [];
  for (const poly of polys) for (const ring of poly) rings.push(ring as [number, number][]);
}

// Even-odd scanline fill at each row's centre latitude.
const bits = new Uint8Array((W * H) / 8);
for (let row = 0; row < H; row++) {
  const lat = 90 - (row + 0.5) * (180 / H);
  const xs: number[] = [];
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [x1, y1] = ring[j];
      const [x2, y2] = ring[i];
      if (y1 > lat !== y2 > lat) xs.push(x1 + ((lat - y1) / (y2 - y1)) * (x2 - x1));
    }
  }
  xs.sort((a, b) => a - b);
  for (let k = 0; k + 1 < xs.length; k += 2) {
    for (let col = 0; col < W; col++) {
      const lng = -180 + (col + 0.5) * (360 / W);
      if (lng >= xs[k] && lng < xs[k + 1]) {
        const n = row * W + col;
        bits[n >> 3] |= 1 << (n & 7);
      }
    }
  }
}

writeFileSync(
  "src/web/land.json",
  JSON.stringify({
    source: "Natural Earth 1:110m land (public domain) via world-atlas 2.0.2 (ISC)",
    width: W,
    height: H,
    bits: Buffer.from(bits).toString("base64"),
  }),
);
let n = 0;
for (const b of bits) for (let i = 0; i < 8; i++) n += (b >> i) & 1;
console.log(`land cells: ${n} of ${W * H} (${((100 * n) / (W * H)).toFixed(1)}%)`);
// a quick ASCII look at the map, every 8th cell
for (let row = 0; row < H; row += 12) {
  let line = "";
  for (let col = 0; col < W; col += 6) {
    const k = row * W + col;
    line += (bits[k >> 3] >> (k & 7)) & 1 ? "#" : ".";
  }
  console.log(line);
}
