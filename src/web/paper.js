// One sheet of paper that folds into a dart and back, built from DOM panels
// hinged on their creases with CSS 3D transforms. Each panel carries its own
// clipped copy of the writing, so the ink stays on the paper as it folds; the
// accessible, editable layer (`.face` in the page) sits over the flat sheet
// and hides while the paper is anything but flat.
//
// Sheet coordinates: x across 0..1, y down 0..H (H = 1.414, A-series), in
// sheet widths. The writing face is the front; the stronger colour is the back.

import { wingPreview } from "./rules.js";

const H = 1.414;
const TAIL_KEEL = 0.36; // where each wing crease meets the tail

const pct = ([x, y]) => `${x * 100}% ${(y / H) * 100}%`;
const poly = (pts) => `polygon(${pts.map(pct).join(", ")})`;
const mirror = (pts) => pts.map(([x, y]) => [1 - x, y]);

// Panels, left side; the right side is their mirror. Each hinge is a crease
// [p1, p2] plus a sample point on the moving side, so "positive" always means
// "towards the viewer" whichever way the crease runs.
//
// The left half fans out from the nose: keel, wing, the outer strip that
// tucks under (so the wing ends up a true dart triangle), and the top corner,
// split where the tucked strip's crease lands on it once the corner is folded.
const NOSE = [0.5, 0];
const SPLIT = 0.1768; // the tuck crease reflected through the corner crease
const LEFT = {
  half: { hinge: [NOSE, [0.5, H]], sample: [0, 0.7] },
  keel: [NOSE, [0.5, H], [TAIL_KEEL, H]],
  wing: { hinge: [NOSE, [TAIL_KEEL, H]], sample: [0, 1], shape: [NOSE, [TAIL_KEEL, H], [0, H]] },
  tuck: { hinge: [NOSE, [0, H]], sample: [0, 0.8], shape: [NOSE, [0, H], [0, 0.5]] },
  cornerIn: { hinge: [NOSE, [0, 0.5]], sample: [0, 0], shape: [[0, 0], NOSE, [0, SPLIT]] },
  cornerOut: { hinge: [NOSE, [0, 0.5]], sample: [0, 0], shape: [NOSE, [0, 0.5], [0, SPLIT]] },
};

function hingeOf([[x1, y1], [x2, y2]], [sx, sy], flip) {
  if (flip) {
    [x1, x2, sx] = [1 - x1, 1 - x2, 1 - sx];
  }
  const ax = x2 - x1;
  const ay = y2 - y1;
  // z of (axis x r): which way a positive rotate3d swings the sample point
  const z = ax * (sy - y1) - ay * (sx - x1);
  return { origin: pct([x1, y1]), axis: `${ax}, ${ay}, 0`, sign: Math.sign(z) || 1 };
}

const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const stage = (p, a, b) => ease(Math.min(1, Math.max(0, (p - a) / (b - a))));

// Folded close-up: nose up and away, a shallow three-quarter view.
const POSE = { rx: 52, rz: 14, s: 0.82 };

export class Paper {
  /** @param {HTMLElement} slot  @param {{ reducedMotion: () => boolean }} opts */
  constructor(slot, opts) {
    this.slot = slot;
    this.opts = opts;
    this.progress = 0; // 0 flat, 1 folded
    this.root = document.createElement("div");
    this.root.className = "paper3d";
    this.root.setAttribute("aria-hidden", "true");
    this.pose = document.createElement("div");
    this.pose.className = "pose";
    this.sheet = document.createElement("div");
    this.sheet.className = "sheet";
    this.shadow = document.createElement("div");
    this.shadow.className = "contact-shadow";
    this.root.append(this.shadow, this.pose);
    this.pose.append(this.sheet);
    this.ink = document.createElement("div");
    this.ink.className = "ink";
    this.hinges = [];
    for (const flip of [false, true]) this.buildHalf(flip);
    slot.prepend(this.root);
    this.apply();
  }

  // Each face box covers only its own half of the sheet. Chrome sorts 3D
  // layers by their boxes, not their clip paths, so a full-sheet box on the
  // left would hide the right half the moment it rotated behind it.
  panel(parent, shape, flip, hinge, name) {
    const el = document.createElement("div");
    el.className = `fold ${name}`;
    if (shape.length) {
      const x0 = flip ? 0.5 : 0;
      const local = (flip ? mirror(shape) : shape).map(([x, y]) => [(x - x0) * 2, y]);
      const front = document.createElement("div");
      front.className = `f ${flip ? "right" : "left"}`;
      front.style.clipPath = poly(local);
      const ink = this.ink.cloneNode(true);
      ink.style.left = flip ? "-100%" : "0";
      front.append(ink);
      const back = document.createElement("div");
      back.className = `b ${flip ? "right" : "left"}`;
      // the back is seen mirrored, so its clip is the mirror of the front's
      back.style.clipPath = poly(local.map(([x, y]) => [1 - x, y]));
      el.append(front, back);
    }
    if (hinge) {
      const h = hingeOf(hinge.hinge, hinge.sample, flip);
      el.style.transformOrigin = h.origin;
      this.hinges.push({ el, name, axis: h.axis, sign: h.sign });
    }
    parent.append(el);
    return el;
  }

  buildHalf(flip) {
    const side = flip ? "right" : "left";
    const half = this.panel(this.sheet, [], flip, LEFT.half, `half ${side}`);
    this.panel(half, LEFT.keel, flip, null, `keel ${side}`);
    const wing = this.panel(half, LEFT.wing.shape, flip, LEFT.wing, `wing ${side}`);
    // what the folded plane shows on its wings: a first-line preview on one,
    // the origin mark on the other
    const label = document.createElement("div");
    label.className = flip ? "wing-label wing-origin" : "wing-label wing-preview";
    wing.querySelector(".b")?.append(label);
    this.panel(wing, LEFT.cornerIn.shape, flip, LEFT.cornerIn, `corner ${side}`);
    const tuck = this.panel(wing, LEFT.tuck.shape, flip, LEFT.tuck, `tuck ${side}`);
    this.panel(tuck, LEFT.cornerOut.shape, flip, LEFT.cornerOut, `corner ${side}`);
  }

  setColour(hex, tint) {
    this.root.style.setProperty("--paper", hex);
    this.root.style.setProperty("--paper-tint", tint);
  }

  /** @param {{ body: string, origin: string, stamps: HTMLElement | null, mark: string }} c */
  setContent(c) {
    for (const ink of this.root.querySelectorAll(".ink")) {
      const o = ink.querySelector(".ink-origin") ?? ink.appendChild(Object.assign(document.createElement("p"), { className: "ink-origin" }));
      o.textContent = c.origin;
      const b = ink.querySelector(".ink-body") ?? ink.appendChild(Object.assign(document.createElement("p"), { className: "ink-body" }));
      b.textContent = c.body;
      ink.querySelector(".ink-stamps")?.remove();
      if (c.stamps) {
        const s = c.stamps.cloneNode(true);
        s.className = "ink-stamps";
        s.removeAttribute("aria-label");
        ink.append(s);
      }
    }
    const preview = this.root.querySelector(".wing-preview");
    if (preview) preview.textContent = wingPreview(c.body, 24);
    const mark = this.root.querySelector(".wing-origin");
    if (mark) mark.textContent = c.mark;
  }

  apply() {
    const p = this.progress;
    // corners to the centre, edges tucked under, the centre fold, the wings
    const corners = stage(p, 0, 0.3) * 178;
    const tucks = stage(p, 0.22, 0.5) * 176;
    const centre = stage(p, 0.45, 0.75) * 86;
    const wings = stage(p, 0.7, 1) * -80;
    const angle = { corner: corners, tuck: tucks, half: centre, wing: wings };
    for (const h of this.hinges) {
      const deg = angle[h.name.split(" ")[0]];
      h.el.style.transform = `rotate3d(${h.axis}, ${deg * h.sign}deg)`;
    }
    // turned over as it folds: the coloured outside ends up on top, the
    // writing inside the keel, and the nose tips up and away
    const turn = stage(p, 0.42, 0.85);
    const k = stage(p, 0.6, 1);
    this.pose.style.transform = `rotateZ(${POSE.rz * k}deg) rotateX(${POSE.rx * k}deg) rotateY(${180 * turn}deg) scale(${1 + (POSE.s - 1) * k})`;
    // the whole message fades from the panels as the wings set, and the
    // wing labels take over: a folded plane shows its preview, not fragments
    this.root.style.setProperty("--body-ink", String(1 - stage(p, 0.6, 0.85)));
    this.root.style.setProperty("--wing-ink", String(stage(p, 0.8, 1)));
    this.root.dataset.flat = p === 0 ? "true" : "false";
    this.slot.dataset.paper = p === 0 ? "flat" : p === 1 ? "folded" : "folding";
  }

  set(p) {
    this.progress = p;
    this.apply();
  }

  /** Animate to flat (0) or folded (1). Resolves when it's there. */
  animate(to, ms) {
    cancelAnimationFrame(this.raf);
    const from = this.progress;
    if (this.opts.reducedMotion() || from === to) {
      this.set(to);
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      const start = performance.now();
      const step = (now) => {
        const t = Math.min(1, (now - start) / ms);
        this.set(from + (to - from) * t);
        if (t < 1) this.raf = requestAnimationFrame(step);
        else resolve();
      };
      this.raf = requestAnimationFrame(step);
    });
  }

  fold() {
    return this.animate(1, 1200);
  }

  unfold(ms = 1000) {
    return this.animate(0, ms);
  }

  /** Small drag offset for the throw gesture; 0,0 restores the ready pose. */
  nudge(dx, dy) {
    this.root.style.translate = dx || dy ? `${dx}px ${dy}px` : "";
  }

  // The committed throw: lift the nose, curve away toward the globe, gone.
  async throwTo(target) {
    const r = this.root.getBoundingClientRect();
    const dx = target.x - (r.left + r.width / 2);
    const dy = target.y - (r.top + r.height / 2);
    if (this.opts.reducedMotion()) return;
    await this.root.animate(
      [
        { transform: "translate(0, 0) scale(1)", opacity: 1 },
        { transform: `translate(${dx * 0.15}px, ${dy * 0.1 - 60}px) rotate(-6deg) scale(0.85)`, opacity: 1, offset: 0.25 },
        { transform: `translate(${dx * 0.75}px, ${dy * 0.6}px) rotate(14deg) scale(0.22)`, opacity: 0.9, offset: 0.75 },
        { transform: `translate(${dx}px, ${dy}px) rotate(24deg) scale(0.06)`, opacity: 0 },
      ],
      { duration: 1100, easing: "cubic-bezier(.45,.05,.4,1)" },
    ).finished;
  }

  // A catch: the plane comes in from where it was flying and settles.
  async arriveFrom(source) {
    this.nudge(0, 0);
    if (this.opts.reducedMotion() || !source) return;
    const r = this.root.getBoundingClientRect();
    const dx = source.x - (r.left + r.width / 2);
    const dy = source.y - (r.top + r.height / 2);
    await this.root.animate(
      [
        { transform: `translate(${dx}px, ${dy}px) rotate(-30deg) scale(0.07)`, opacity: 0.4 },
        { transform: `translate(${dx * 0.35}px, ${dy * 0.2 + 40}px) rotate(8deg) scale(0.6)`, opacity: 1, offset: 0.6 },
        { transform: "translate(0, 0) rotate(0) scale(1)", opacity: 1 },
      ],
      { duration: 800, easing: "cubic-bezier(.2,.7,.25,1)" },
    ).finished;
  }

  // Come up from the lower foreground into reading position.
  async enter() {
    if (this.opts.reducedMotion()) return;
    await this.root.animate(
      [
        { transform: "translateY(45vh) rotateX(35deg) scale(0.8)", opacity: 0 },
        { transform: "none", opacity: 1 },
      ],
      { duration: 550, easing: "cubic-bezier(.2,.7,.25,1)" },
    ).finished;
  }
}
