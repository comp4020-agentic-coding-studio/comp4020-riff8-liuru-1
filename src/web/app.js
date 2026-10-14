// The page's one state machine. `state` is the single foreground state (see
// README.md, "States"); connection is tracked separately and never replaces
// the screen. Everything a visitor can change goes through the server, which
// decides whether they may: this file only asks and then shows the answer.
import { Paper } from "./paper.js";
import { COLOURS, MAX_BODY, bodyProblem, codePoints, distanceKm, normaliseBody } from "./rules.js";

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const app = $("#app");
const reducedQuery = matchMedia("(prefers-reduced-motion: reduce)");
const reduced = () => reducedQuery.matches;
const coarse = matchMedia("(pointer: coarse)");

let state = "world";
let previous = "world"; // where Back from the journey view returns to
let opener = null; // the control that opened the current panel, for focus restore
let regions = [];
let sky = null; // the scene: Sky (WebGL) or FlatSky
const flying = new Map(); // id -> public plane, everything currently drawn
const mineById = new Map(); // id -> public plane, rows in Your planes
let hold = null; // { planeId, leaseId, expires, plane, lost }
let draftKey = null; // { key, fp } for the pending create
let releaseKey = null; // { key, fp } for the pending stamp/release
let journeyPlane = null;
let mineCursor = null;
let soundOn = false;

// ---------------------------------------------------------------- helpers

const colourOf = (id) => COLOURS.find((c) => c.id === id) ?? COLOURS[4];

function mix(hex, other, t) {
  const p = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [a, b] = [p(hex), p(other)];
  return `#${a.map((v, i) => Math.round(v + (b[i] - v) * t).toString(16).padStart(2, "0")).join("")}`;
}
const tintOf = (hex) => mix(hex, "#ffffff", 0.84);
const inkOf = (hex) => mix(hex, "#27364B", 0.7);

const dateFmt = new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "short", year: "numeric" });
const shortDate = (ms) => dateFmt.format(new Date(ms));

function newKey() {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

async function api(path, body, { timeout = 10000 } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(path, {
      method: body === undefined ? "GET" : "POST",
      headers: body === undefined ? {} : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: ctrl.signal,
      credentials: "same-origin",
    });
    const data = await res.json().catch(() => ({}));
    return { status: res.status, ok: res.ok, data };
  } catch {
    // a timeout or a dropped connection: the outcome is unknown, never success
    return { status: 0, ok: false, data: { error: "network", message: "Couldn't reach the server." } };
  } finally {
    clearTimeout(timer);
  }
}

const storage = {
  get(k) {
    try {
      return JSON.parse(sessionStorage.getItem(k) ?? "null");
    } catch {
      return null;
    }
  },
  set(k, v) {
    try {
      if (v === null) sessionStorage.removeItem(k);
      else sessionStorage.setItem(k, JSON.stringify(v));
    } catch {
      // storage unavailable: drafts just don't survive a reload
    }
  },
};

let toastTimer;
function toast(msg, ms = 3200) {
  const el = $(".toast");
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), ms);
}

// ---------------------------------------------------------------- sound

let actx;
function cue(kind) {
  if (!soundOn || reduced()) return;
  actx ??= new AudioContext();
  const t = actx.currentTime;
  const len = kind === "throw" ? 0.6 : 0.25;
  const buf = actx.createBuffer(1, Math.ceil(actx.sampleRate * len), actx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  const src = actx.createBufferSource();
  src.buffer = buf;
  const f = actx.createBiquadFilter();
  f.type = "bandpass";
  f.frequency.setValueAtTime(kind === "catch" ? 900 : 1600, t);
  f.frequency.exponentialRampToValueAtTime(kind === "throw" ? 400 : 2400, t + len);
  const g = actx.createGain();
  g.gain.setValueAtTime(kind === "fold" ? 0.12 : 0.2, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + len);
  src.connect(f).connect(g).connect(actx.destination);
  src.start();
}

// ---------------------------------------------------------------- states

const FOCUS = {
  editing: "#message",
  folded_ready: "[data-action=throw]",
  catching: "[data-action=catch-any]",
  caught_folded: "[data-action=open]",
  reading_held: ".held .face-body",
  journey_readonly: "[data-action=close-journey]",
};

function setState(next, { focus = true } = {}) {
  state = next;
  app.dataset.state = next;
  document.body.dataset.state = next;
  const sceneBusy = !["world", "catching"].includes(next);
  sky?.setFocus(sceneBusy ? 1 : 0);
  if (sky) sky.dragEnabled = next === "world";
  $("#net").classList.toggle("on", next === "catching" && !coarse.matches);
  if (next !== "catching") $(".lock")?.remove();
  updateEmpty();
  updateProgress();
  // the target may only just have become visible this frame, so wait one
  if (focus && FOCUS[next]) requestAnimationFrame(() => requestAnimationFrame(() => $(FOCUS[next])?.focus({ preventScroll: true })));
  if (focus && next === "world") (opener?.isConnected ? opener : $("[data-action=catch]")).focus({ preventScroll: true });
}

function updateEmpty() {
  $(".empty-sky").hidden = !(state === "world" && flying.size === 0);
}

// ---------------------------------------------------------------- places

const fold = (s) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

function placeOf(countryId, cityId) {
  const c = regions.find((r) => r.id === countryId);
  if (!c) return null;
  const ct = cityId ? c.cities.find((x) => x.id === cityId) : null;
  if (cityId && !ct) return null;
  return ct
    ? { country: c.id, city: ct.id, label: `${ct.name}, ${c.name}`, region: c.name, place: ct.name, lat: ct.lat, lng: ct.lng }
    : { country: c.id, city: null, label: c.name, region: c.name, place: null, lat: c.lat, lng: c.lng };
}

// A searchable combobox for country/region, with an optional city select.
class Picker {
  constructor(root, onChange) {
    this.root = root;
    this.onChange = onChange;
    this.input = $("input[role=combobox]", root);
    this.list = $("[role=listbox]", root);
    this.city = $("select", root);
    this.error = $(".error", root);
    this.value = null;
    this.results = [];
    this.active = -1;
    this.input.addEventListener("input", () => this.search());
    this.input.addEventListener("focus", () => this.input.value && this.search());
    this.input.addEventListener("keydown", (e) => this.key(e));
    this.input.addEventListener("blur", () => setTimeout(() => this.close(), 120));
    this.list.addEventListener("mousedown", (e) => e.preventDefault());
    this.list.addEventListener("click", (e) => {
      const li = e.target.closest("li[data-i]");
      if (li) this.choose(this.results[Number(li.dataset.i)]);
    });
    this.city.addEventListener("change", () => this.set(this.value?.country ?? null, this.city.value || null));
  }

  search() {
    const q = fold(this.input.value.trim());
    if (!q) {
      this.results = [];
      this.render();
      return;
    }
    const hit = (name, aliases) => {
      const n = fold(name);
      if (n.startsWith(q)) return 0;
      if (aliases.some((a) => fold(a).startsWith(q))) return 1;
      if (n.includes(q) || aliases.some((a) => fold(a).includes(q))) return 2;
      return -1;
    };
    const out = [];
    for (const c of regions) {
      const s = hit(c.name, c.aliases);
      if (s >= 0) out.push({ score: s, country: c.id, city: null, label: c.name, sub: "Country / region" });
      for (const ct of c.cities) {
        const t = hit(ct.name, ct.aliases);
        if (t >= 0) out.push({ score: t + 0.5, country: c.id, city: ct.id, label: `${ct.name}, ${c.name}`, sub: "City" });
      }
    }
    out.sort((a, b) => a.score - b.score || a.label.localeCompare(b.label));
    this.results = out.slice(0, 60);
    this.active = this.results.length ? 0 : -1;
    this.render();
  }

  render() {
    const open = this.input.value.trim() !== "" && document.activeElement === this.input;
    this.list.hidden = !open;
    this.input.setAttribute("aria-expanded", String(open));
    this.list.replaceChildren(
      ...(this.results.length
        ? this.results.map((r, i) => {
            const li = document.createElement("li");
            li.id = `${this.list.id}-${i}`;
            li.role = "option";
            li.dataset.i = String(i);
            li.setAttribute("aria-selected", String(i === this.active));
            li.append(r.label);
            const sub = document.createElement("span");
            sub.className = "sub";
            sub.textContent = r.sub;
            li.append(sub);
            return li;
          })
        : [Object.assign(document.createElement("li"), { className: "none", textContent: "No matching places." })]),
    );
    if (this.active >= 0) {
      this.input.setAttribute("aria-activedescendant", `${this.list.id}-${this.active}`);
      $(`#${this.list.id}-${this.active}`)?.scrollIntoView({ block: "nearest" });
    } else this.input.removeAttribute("aria-activedescendant");
  }

  key(e) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (this.list.hidden) this.search();
      const n = this.results.length;
      if (!n) return;
      this.active = (this.active + (e.key === "ArrowDown" ? 1 : -1) + n) % n;
      this.render();
    } else if (e.key === "Enter") {
      if (!this.list.hidden && this.results[this.active]) {
        e.preventDefault();
        this.choose(this.results[this.active]);
      }
    } else if (e.key === "Escape" && !this.list.hidden) {
      e.preventDefault();
      e.stopPropagation();
      const c = this.value ? regions.find((r) => r.id === this.value.country) : null;
      if (c) this.input.value = c.name;
      this.close();
    }
  }

  close() {
    // leaving the search shows the chosen place again, not half a query
    const c = this.value ? regions.find((r) => r.id === this.value.country) : null;
    if (c && document.activeElement !== this.input) this.input.value = c.name;
    this.list.hidden = true;
    this.input.setAttribute("aria-expanded", "false");
    this.input.removeAttribute("aria-activedescendant");
  }

  choose(r) {
    this.set(r.country, r.city);
    this.close();
  }

  set(country, city) {
    const prev = this.value;
    let p = country ? placeOf(country, city) : null;
    // a city that doesn't belong to the newly chosen country is dropped
    if (country && !p) p = placeOf(country, null);
    this.value = p;
    const c = p ? regions.find((r) => r.id === p.country) : null;
    if (c) {
      this.input.value = c.name;
      this.city.disabled = false;
      const opts = [new Option(`Anywhere in ${c.name}`, "")];
      for (const ct of c.cities) opts.push(new Option(ct.name, ct.id));
      this.city.replaceChildren(...opts);
      this.city.value = p.city ?? "";
    } else {
      if (prev && !country) this.input.value = "";
      this.city.disabled = true;
      this.city.replaceChildren(new Option("Choose a country first", ""));
    }
    if (p) this.showError("");
    this.onChange(p);
  }

  showError(msg) {
    this.error.textContent = msg;
    this.input.setAttribute("aria-invalid", msg ? "true" : "false");
  }
}

// ---------------------------------------------------------------- stamps

function stampEl(s, hex, { preview = false } = {}) {
  const li = document.createElement("li");
  li.className = `stamp${preview ? " preview" : ""}${s.seq === 1 ? " origin" : ""}`;
  li.style.setProperty("--stamp-ink", inkOf(hex));
  const mark = document.createElement("span");
  mark.className = "stamp-mark";
  mark.setAttribute("aria-hidden", "true");
  mark.textContent = s.seq === 1 ? "✈" : "◎";
  const region = document.createElement("span");
  region.className = "stamp-region";
  region.textContent = s.region;
  li.append(mark, region);
  if (s.place) {
    const city = document.createElement("span");
    city.className = "stamp-city";
    city.textContent = s.place;
    li.append(city);
  }
  const date = document.createElement("span");
  date.className = "stamp-date";
  date.textContent = preview ? `${shortDate(Date.now())} · preview` : shortDate(s.at);
  li.append(date);
  li.setAttribute(
    "aria-label",
    `${preview ? "Stamp preview" : s.seq === 1 ? "Origin stamp" : `Stamp ${s.seq}`}: ${s.place ? `${s.place}, ` : ""}${s.region}${preview ? "" : `, ${shortDate(s.at)}`}`,
  );
  return li;
}

// Public stamps from the server carry a label like "Tokyo, Japan"; split it
// back into region and place for the artwork.
function stampView(s) {
  const p = placeOf(s.country, s.city);
  return { ...s, region: p?.region ?? s.label, place: p?.place ?? null };
}

const MAX_STAMPS_ON_PAPER = 4;

function renderStamps(ol, stamps, hex, preview, moreBtn) {
  const all = stamps.map((s) => stampEl(stampView(s), hex));
  const room = preview ? MAX_STAMPS_ON_PAPER - 1 : MAX_STAMPS_ON_PAPER;
  const shown = all.length > room ? all.slice(0, room - 1) : all;
  ol.replaceChildren(...shown);
  if (preview) ol.append(stampEl(preview, hex, { preview: true }));
  if (moreBtn) {
    moreBtn.hidden = all.length <= room;
    moreBtn.textContent = `View all ${all.length} stamps`;
  }
}

// ---------------------------------------------------------------- composer

const composer = {
  slot: $("[data-slot=composer]"),
  text: $("#message"),
  count: $("#message-count"),
  error: $("#message-error"),
  sendError: $("#send-error"),
  composing: false,
  colour: "blue",
  place: null,
};
let composerPaper;
let originPicker;

function draftBody() {
  return normaliseBody(composer.text.value);
}

function saveDraft() {
  storage.set("pp-draft", {
    body: composer.text.value,
    colour: composer.colour,
    country: composer.place?.country ?? null,
    city: composer.place?.city ?? null,
  });
  updateCreateLabel();
}

function hasDraft() {
  const d = storage.get("pp-draft");
  return !!d && (d.body?.trim() || d.country);
}

function updateCreateLabel() {
  $("[data-action=create]").textContent = hasDraft() ? "Continue your plane" : "Create a plane";
}

function updateCounter() {
  const n = codePoints(draftBody());
  composer.count.textContent = `${n} / ${MAX_BODY}`;
  composer.count.classList.toggle("over", n > MAX_BODY);
}

// Errors show once the draft is over the limit or Fold was pressed, and
// clear as soon as it's fixed; never mid-IME composition.
function bodyCheck(show) {
  const problem = bodyProblem(draftBody());
  const over = codePoints(draftBody()) > MAX_BODY;
  if (show || over || !problem || composer.error.textContent) composer.error.textContent = composer.composing ? "" : (problem ?? "");
  composer.text.setAttribute("aria-invalid", problem && composer.error.textContent ? "true" : "false");
  return problem;
}

function updateProgress() {
  const steps = $$(".progress li");
  const valid = !bodyProblem(draftBody());
  const step = state === "folded_ready" || state === "launch_pending" ? "throw" : !valid ? "write" : !composer.place ? "choose" : "fold";
  for (const li of steps) li.toggleAttribute("aria-current", li.dataset.step === step);
  $("[data-action=fold]").setAttribute("aria-disabled", String(!(valid && composer.place)));
}

function paintComposer() {
  const c = colourOf(composer.colour);
  composer.slot.style.setProperty("--paper", c.hex);
  composer.slot.style.setProperty("--paper-tint", tintOf(c.hex));
  composer.slot.style.setProperty("--stamp-ink", inkOf(c.hex));
  composerPaper.setColour(c.hex, tintOf(c.hex));
  for (const r of $$("input[name=colour]", $(".composer"))) {
    r.checked = r.value === composer.colour;
  }
  const origin = $(".face-origin", composer.slot);
  origin.textContent = composer.place ? `From ${composer.place.label}` : "From …";
  const ol = $(".face-stamps", composer.slot);
  const prev = ol.querySelector(".stamp")?.dataset.key;
  ol.replaceChildren();
  if (composer.place) {
    const s = stampEl({ seq: 1, ...composer.place }, c.hex, { preview: true });
    s.dataset.key = composer.place.label;
    if (prev !== composer.place.label && !reduced()) s.classList.add("press");
    ol.append(s);
  }
  composerPaper.setContent({
    body: draftBody(),
    origin: origin.textContent,
    stamps: ol,
    mark: composer.place ? `✈ ${composer.place.region}` : "",
  });
  updateProgress();
}

async function openComposer(e) {
  opener = e?.currentTarget ?? opener;
  const d = storage.get("pp-draft");
  if (d) {
    composer.text.value = d.body ?? "";
    composer.colour = COLOURS.some((c) => c.id === d.colour) ? d.colour : "blue";
    originPicker.set(d.country, d.city);
  }
  composer.sendError.textContent = "";
  app.dataset.surface = "composer";
  composerPaper.root.style.opacity = "";
  composerPaper.set(0);
  updateCounter();
  paintComposer();
  setState("editing");
  await composerPaper.enter();
}

function closeComposer() {
  saveDraft();
  setState("world");
}

async function foldDraft() {
  const problem = bodyCheck(true);
  if (!composer.place) originPicker.showError("Choose a country or region for your plane.");
  if (problem || !composer.place) {
    (problem ? composer.text : originPicker.input).focus();
    return;
  }
  saveDraft();
  paintComposer();
  cue("fold");
  setState("folding", { focus: false });
  await composerPaper.fold();
  setState("folded_ready");
  $(".ready-actions").scrollIntoView({ block: "nearest", behavior: reduced() ? "auto" : "smooth" });
}

async function unfoldDraft() {
  setState("folding", { focus: false });
  await composerPaper.unfold(950);
  setState("editing");
}

async function throwPlane() {
  if (state !== "folded_ready") return;
  const payload = {
    colour: composer.colour,
    body: draftBody(),
    country: composer.place.country,
    city: composer.place.city ?? "",
  };
  const fp = JSON.stringify(payload);
  // the same draft keeps its key, so a retry after an unknown outcome is the
  // same request, and the server answers it with the plane it already made
  if (!draftKey || draftKey.fp !== fp) draftKey = { key: newKey(), fp };
  storage.set("pp-draft-key", draftKey);
  composer.sendError.textContent = "";
  setState("launch_pending", { focus: false });
  $(".sending", composer.slot).hidden = false;
  const res = await api("/api/planes", { key: draftKey.key, ...payload });
  $(".sending", composer.slot).hidden = true;
  if (!res.ok) {
    setState("folded_ready");
    composer.sendError.textContent =
      res.status === 0
        ? "We couldn't confirm your plane was sent. Your draft is safe: try Throw plane again."
        : (res.data.message ?? "Something went wrong. Try again.");
    return;
  }
  // confirmed: the plane exists, whatever happens to the animation now
  const plane = res.data.plane;
  storage.set("pp-draft", null);
  storage.set("pp-draft-key", null);
  draftKey = null;
  composer.text.value = "";
  updateCreateLabel();
  setState("launching", { focus: false });
  cue("throw");
  await composerPaper.throwTo(sky.globeScreen());
  composerPaper.root.style.opacity = "0";
  addFlying(plane, true);
  if (plane.mine) upsertMine(plane, true);
  composer.place = null;
  originPicker.set(null, null);
  setState("world");
  toast("Your plane is in the sky.");
}

// The throw gesture: drag the ready plane upward and let go.
function bindThrowGesture() {
  let drag = null;
  composer.slot.addEventListener("pointerdown", (e) => {
    if (state !== "folded_ready") return;
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY, touch: e.pointerType !== "mouse" };
    composer.slot.setPointerCapture(e.pointerId);
  });
  composer.slot.addEventListener("pointermove", (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    composerPaper.nudge(Math.max(-60, Math.min(60, dx * 0.3)), Math.max(-140, Math.min(30, dy * 0.6)));
  });
  const end = (e, cancelled) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x;
    const up = drag.y - e.clientY;
    const threshold = drag.touch ? 60 : 80;
    drag = null;
    composerPaper.nudge(0, 0);
    if (!cancelled && up >= threshold && up > 1.2 * Math.abs(dx)) throwPlane();
  };
  composer.slot.addEventListener("pointerup", (e) => end(e, false));
  composer.slot.addEventListener("pointercancel", (e) => end(e, true));
}

// ---------------------------------------------------------------- the sky

function addFlying(plane, nearFront = false) {
  if (hold && hold.planeId === plane.id) return;
  flying.set(plane.id, plane);
  // keep the drawn flock bounded: the oldest drawn plane makes room
  if (flying.size > 60) {
    const oldest = flying.keys().next().value;
    flying.delete(oldest);
    sky.removePlane(oldest);
  }
  sky.addPlane({ id: plane.id, hex: colourOf(plane.colour).hex }, nearFront);
  updateEmpty();
}

function removeFlying(id) {
  flying.delete(id);
  sky.removePlane(id);
  updateEmpty();
}

let captionTimer;
let captionQueue = [];
function caption(plane) {
  if (!["world", "catching"].includes(state)) return;
  captionQueue.push(plane);
  if (captionTimer) return;
  const show = () => {
    const batch = captionQueue;
    captionQueue = [];
    if (!batch.length) {
      captionTimer = null;
      $(".caption").classList.remove("show");
      return;
    }
    const last = batch[batch.length - 1];
    const where = last.stamps[0]?.label ?? "somewhere";
    $(".caption").textContent =
      batch.length > 1 ? `${batch.length} planes just left, the last from ${where}` : `A plane just left ${where}`;
    $(".caption").classList.add("show");
    captionTimer = setTimeout(show, 2500);
  };
  show();
}

// ---------------------------------------------------------------- catching

const net = { el: $("#net"), x: innerWidth / 2, y: innerHeight / 2, tx: innerWidth / 2, ty: innerHeight / 2, locked: null };

function startCatching(e) {
  opener = e?.currentTarget ?? opener;
  setState("catching");
}

function trackNet() {
  requestAnimationFrame(trackNet);
  if (state !== "catching") return;
  const k = reduced() ? 1 : 0.25;
  net.x += (net.tx - net.x) * k;
  net.y += (net.ty - net.y) * k;
  net.el.style.translate = `${net.x}px ${net.y}px`;
  const hit = sky.nearest(net.x, net.y, coarse.matches ? 50 : 65);
  net.locked = hit?.id ?? null;
  let lock = $(".lock");
  if (hit) {
    if (!lock) {
      lock = document.createElement("div");
      lock.className = "lock";
      lock.setAttribute("aria-hidden", "true");
      document.body.append(lock);
    }
    lock.style.translate = `${hit.x}px ${hit.y}px`;
  } else lock?.remove();
}

async function requestCatch(planeId) {
  if (state !== "catching") return;
  const from = planeId ? sky.screenOf(planeId) : null;
  setState("catch_pending", { focus: false });
  const res = await api("/api/catch", planeId ? { plane: planeId } : {});
  if (!res.ok) {
    if (res.data.error === "already_holding") {
      await reconcile();
      return;
    }
    setState("catching", { focus: false });
    if (res.data.error === "already_caught") {
      removeFlying(planeId);
      toast("That plane has already been caught. Try another.");
    } else toast(res.data.message ?? "Couldn't catch a plane. Try again.");
    return;
  }
  cue("catch");
  const plane = res.data.plane;
  const source = from ?? (flying.has(plane.id) ? sky.screenOf(plane.id) : null) ?? sky.globeScreen();
  removeFlying(plane.id);
  hold = { planeId: plane.id, leaseId: res.data.lease.id, expires: res.data.lease.expires, plane, lost: false };
  showHeld(res.data.self ? "This is one of your own planes: nothing else is flying right now." : "");
  setState("caught_folded");
  await heldPaper.arriveFrom(source);
}

// ---------------------------------------------------------------- holding

const held = {
  slot: $("[data-slot=held]"),
  body: $(".held .face-body"),
  meta: $(".plane-meta"),
  error: $("#held-error"),
  warning: $(".lease-warning"),
  place: null,
};
let heldPaper;
let stampPicker;
let renewTimer;

function paintHeld() {
  if (!hold) return;
  const p = hold.plane;
  const c = colourOf(p.colour);
  held.slot.style.setProperty("--paper", c.hex);
  held.slot.style.setProperty("--paper-tint", tintOf(c.hex));
  heldPaper.setColour(c.hex, tintOf(c.hex));
  const origin = p.stamps[0];
  $(".face-origin", held.slot).textContent = `From ${origin?.label ?? "somewhere"}`;
  held.body.textContent = p.body;
  const preview = held.place ? { seq: p.stamps.length + 1, ...held.place } : null;
  const ol = $(".face-stamps", held.slot);
  renderStamps(ol, p.stamps, c.hex, preview, $(".all-stamps", held.slot));
  heldPaper.setContent({
    body: p.body,
    origin: `From ${origin?.label ?? "somewhere"}`,
    stamps: ol,
    mark: `✈ ${origin ? stampView(origin).region : ""}`,
  });
  held.meta.textContent = `${c.name} plane from ${p.author}${p.mine ? " (you)" : ""}, thrown ${shortDate(p.createdAt)}. ${p.stamps.length} stamp${p.stamps.length === 1 ? "" : "s"} so far.`;
}

function showHeld(note) {
  held.place = null;
  stampPicker.set(null, null);
  held.error.textContent = note;
  held.warning.hidden = true;
  releaseKey = null;
  app.dataset.surface = "held";
  heldPaper.root.style.opacity = "";
  heldPaper.set(1);
  heldPaper.nudge(0, 0);
  paintHeld();
  setMutable(true);
  clearInterval(renewTimer);
  renewTimer = setInterval(renewLease, 30_000);
}

function setMutable(on) {
  for (const b of $$(".held [data-action=stamp], .held [data-action=release]")) b.disabled = !on;
}

async function renewLease() {
  if (!hold || hold.lost) return clearInterval(renewTimer);
  if (!["caught_folded", "reading_held", "journey_readonly", "folding"].includes(state)) return;
  const res = await api(`/api/planes/${hold.planeId}/renew`, { lease: hold.leaseId });
  if (res.ok) {
    hold.expires = res.data.lease.expires;
    held.warning.hidden = true;
  } else if (res.status === 409) {
    loseHold();
  } else {
    const left = Math.round((hold.expires - Date.now()) / 1000);
    if (left <= 30) {
      held.warning.hidden = false;
      held.warning.textContent = `Can't reach the server. Your hold on this plane ends in about ${Math.max(0, left)} seconds.`;
    }
  }
}

function loseHold() {
  if (!hold) return;
  hold.lost = true;
  clearInterval(renewTimer);
  setMutable(false);
  held.warning.hidden = false;
  held.warning.textContent = "You're no longer holding this plane; it's back in the sky. You can still read it.";
}

async function openHeld() {
  cue("fold");
  setState("folding", { focus: false });
  await heldPaper.unfold(1050);
  setState("reading_held");
  held.slot.scrollIntoView({ block: "nearest" });
}

async function releaseHeld(stamp) {
  if (!hold) return setState("world");
  if (hold.lost) {
    hold = null;
    return setState("world");
  }
  if (stamp && !held.place) {
    stampPicker.showError("Choose a place for your stamp, or release without stamping.");
    stampPicker.input.focus();
    return;
  }
  const payload = {
    lease: hold.leaseId,
    country: stamp ? held.place.country : "",
    city: stamp ? (held.place.city ?? "") : "",
  };
  const fp = JSON.stringify(payload);
  if (!releaseKey || releaseKey.fp !== fp) releaseKey = { key: newKey(), fp };
  held.error.textContent = "";
  const back = state;
  setState("relaunch_pending", { focus: false });
  const res = await api(`/api/planes/${hold.planeId}/release`, { key: releaseKey.key, ...payload });
  if (!res.ok) {
    if (res.data.error === "lease_lost") {
      setState(back, { focus: false });
      loseHold();
      return;
    }
    setState(back);
    held.error.textContent =
      res.status === 0 ? "We couldn't confirm that. Your stamp is still here: try again." : (res.data.message ?? "Something went wrong.");
    return;
  }
  const plane = res.data.plane;
  clearInterval(renewTimer);
  hold = null;
  releaseKey = null;
  setState("launching", { focus: false });
  if (heldPaper.progress < 1) await heldPaper.fold();
  cue("throw");
  await heldPaper.throwTo(sky.globeScreen());
  heldPaper.root.style.opacity = "0";
  addFlying(plane, true);
  setState("world");
  toast(stamp ? "Stamped and sent onward." : "Let go, unstamped.");
}

// ---------------------------------------------------------------- journey

function showJourney(plane, from) {
  previous = from;
  journeyPlane = plane;
  const c = colourOf(plane.colour);
  $(".journey-body").textContent = plane.body;
  $(".journey-body").style.setProperty("--paper-tint", tintOf(c.hex));
  const list = $(".journey-list");
  list.replaceChildren(
    ...plane.stamps.map((s, i) => {
      const li = document.createElement("li");
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = `${s.label}`;
      const meta = document.createElement("span");
      meta.className = "sub";
      meta.textContent = ` ${i === 0 ? "thrown" : "stamped"} by ${s.by}, ${shortDate(s.at)}`;
      b.addEventListener("click", () => {
        for (const x of $$("button", list)) x.removeAttribute("aria-current");
        b.setAttribute("aria-current", "true");
        sky.showRoute(plane.stamps, Math.max(0, i - 1));
      });
      li.append(b, meta);
      return li;
    }),
  );
  let km = 0;
  for (let i = 1; i < plane.stamps.length; i++) {
    const [a, b] = [plane.stamps[i - 1], plane.stamps[i]];
    km += distanceKm(a.lat, a.lng, b.lat, b.lng);
  }
  $(".journey-distance").textContent =
    plane.stamps.length > 1
      ? `Approximate virtual distance: ${Math.round(km).toLocaleString("en-AU")} km between the places chosen, not a tracked flight.`
      : "No stamps yet beyond where it started.";
  sky.showRoute(plane.stamps);
  setState("journey_readonly");
}

function closeJourney() {
  sky.clearRoute();
  journeyPlane = null;
  if (previous === "drawer") {
    setState("world", { focus: false });
    openDrawer();
  } else setState(previous);
}

// ---------------------------------------------------------------- your planes

const drawer = $(".drawer");

function thumb(hex) {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 40 40");
  svg.setAttribute("class", "thumb");
  svg.setAttribute("aria-hidden", "true");
  for (const [d, fill] of [
    ["M20 3 L6 34 L19 29 Z", hex],
    ["M20 3 L34 34 L21 29 Z", mix(hex, "#ffffff", 0.25)],
    ["M20 3 L19 29 L20 37 L21 29 Z", mix(hex, "#27364B", 0.35)],
  ]) {
    const p = document.createElementNS(ns, "path");
    p.setAttribute("d", d);
    p.setAttribute("fill", fill);
    svg.append(p);
  }
  return svg;
}

function mineRow(p) {
  const li = document.createElement("li");
  li.dataset.id = String(p.id);
  const c = colourOf(p.colour);
  const text = document.createElement("div");
  text.className = "mine-text";
  const ex = document.createElement("p");
  ex.className = "excerpt";
  ex.textContent = p.body;
  const meta = document.createElement("p");
  meta.className = "sub";
  meta.textContent = `${c.name} · from ${p.stamps[0]?.label ?? "?"} · ${shortDate(p.createdAt)} · ${p.stamps.length} stamp${p.stamps.length === 1 ? "" : "s"}`;
  const b = document.createElement("button");
  b.type = "button";
  b.textContent = "View journey";
  b.setAttribute("aria-label", `View journey of plane #${p.id}`);
  b.addEventListener("click", () => {
    closeDrawer(false);
    showJourney(mineById.get(p.id) ?? p, "drawer");
  });
  text.append(ex, meta, b);
  li.append(thumb(c.hex), text);
  return li;
}

function upsertMine(p, atTop = false) {
  mineById.set(p.id, p);
  const list = $(".mine-list");
  const existing = list.querySelector(`li[data-id="${p.id}"]`);
  const row = mineRow(p);
  if (existing) existing.replaceWith(row);
  else if (atTop) list.prepend(row);
  else list.append(row);
  list.querySelector(".none")?.remove();
}

async function loadMine(reset) {
  if (reset) {
    mineCursor = null;
    mineById.clear();
    $(".mine-list").replaceChildren();
  }
  const res = await api(`/api/mine${mineCursor ? `?before=${mineCursor}` : ""}`);
  if (!res.ok) {
    toast("Couldn't load your planes.");
    return;
  }
  for (const p of res.data.planes) upsertMine(p);
  mineCursor = res.data.planes.at(-1)?.id ?? mineCursor;
  $("[data-action=more-mine]").hidden = !res.data.more;
  if (!mineById.size) {
    $(".mine-list").replaceChildren(
      Object.assign(document.createElement("li"), { className: "none", textContent: "You haven't thrown a plane from this browser yet." }),
    );
  }
}

async function openDrawer(e) {
  if (e) opener = e.currentTarget;
  drawer.hidden = false;
  document.body.dataset.drawer = "open";
  await loadMine(true);
  $("[data-action=close-drawer]").focus();
}

function closeDrawer(restore = true) {
  drawer.hidden = true;
  delete document.body.dataset.drawer;
  if (restore) $("[data-action=mine]").focus();
}

// ---------------------------------------------------------------- live

let source;
let cursor = Number(app.dataset.cursor);

function connect() {
  source = new EventSource(`/events?since=${cursor}`);
  source.addEventListener("open", () => ($(".connection").hidden = true));
  source.addEventListener("error", () => ($(".connection").hidden = false));
  source.addEventListener("reset", () => reconcile());
  source.addEventListener("sky", (e) => {
    cursor = Number(e.lastEventId) || cursor;
    const { kind, replay, plane } = JSON.parse(e.data);
    if (plane.flying) {
      if (!flying.has(plane.id)) addFlying(plane);
      else flying.set(plane.id, plane);
      if (kind === "created" && !replay) caption(plane);
    } else if (!hold || hold.planeId !== plane.id) removeFlying(plane.id);
    if (plane.mine && (mineById.has(plane.id) || kind === "created")) upsertMine(plane, kind === "created");
    if (journeyPlane?.id === plane.id && state === "journey_readonly" && plane.stamps.length !== journeyPlane.stamps.length) {
      // keep the open view, update only its history
      showJourney(plane, previous);
    }
  });
}

// Fetch the sky as the server has it now; restore a hold this browser still has.
async function reconcile() {
  const res = await api("/api/sky");
  if (!res.ok) return;
  cursor = Math.max(cursor, res.data.cursor);
  const ids = new Set(res.data.planes.map((p) => p.id));
  for (const id of [...flying.keys()]) if (!ids.has(id)) removeFlying(id);
  for (const p of res.data.planes) addFlying(p);
  const h = res.data.hold;
  if (h && h.plane) {
    if (!hold || hold.planeId !== h.planeId) {
      hold = { planeId: h.planeId, leaseId: h.leaseId, expires: h.expires, plane: h.plane, lost: false };
      showHeld("You were holding this plane. It's still yours to send on.");
      setState("caught_folded");
    }
  } else if (state === "catch_pending") setState("catching");
}

// ---------------------------------------------------------------- wiring

function bind() {
  const on = (action, fn) => {
    for (const el of $$(`[data-action="${action}"]`)) el.addEventListener("click", fn);
  };
  on("create", openComposer);
  on("close-composer", closeComposer);
  on("fold", foldDraft);
  on("unfold-draft", unfoldDraft);
  on("throw", throwPlane);
  on("catch", startCatching);
  on("cancel-catch", () => setState("world"));
  on("catch-any", () => requestCatch(null));
  on("open", openHeld);
  on("release", () => releaseHeld(false));
  on("stamp", () => releaseHeld(true));
  on("journey", () => hold && showJourney(hold.plane, state === "journey_readonly" ? previous : state));
  on("close-journey", closeJourney);
  on("mine", openDrawer);
  on("close-drawer", () => closeDrawer());
  on("more-mine", () => loadMine(false));
  on("about", () => $("dialog.about").showModal());
  on("sound", (e) => {
    soundOn = !soundOn;
    e.currentTarget.setAttribute("aria-pressed", String(soundOn));
    e.currentTarget.textContent = soundOn ? "Sound on" : "Sound off";
    if (soundOn) cue("fold");
  });
  const menu = $(".menu-toggle");
  menu.addEventListener("click", () => {
    const open = menu.getAttribute("aria-expanded") !== "true";
    menu.setAttribute("aria-expanded", String(open));
  });
  $("#secondary-items").addEventListener("click", (e) => {
    if (e.target.closest("button")) menu.setAttribute("aria-expanded", "false");
  });

  composer.text.addEventListener("compositionstart", () => (composer.composing = true));
  composer.text.addEventListener("compositionend", () => {
    composer.composing = false;
    updateCounter();
    bodyCheck(false);
    paintComposer();
    saveDraft();
  });
  composer.text.addEventListener("input", () => {
    updateCounter();
    if (!composer.composing) bodyCheck(false);
    paintComposer();
    saveDraft();
  });
  for (const r of $$("input[name=colour]", $(".composer"))) {
    r.addEventListener("change", () => {
      composer.colour = r.value;
      paintComposer();
      saveDraft();
    });
  }

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape" || e.defaultPrevented) return;
    if ($("dialog.about").open) return;
    if (!drawer.hidden) return closeDrawer();
    if (state === "editing") return closeComposer();
    if (state === "catching") return setState("world");
    if (state === "journey_readonly") return closeJourney();
  });

  addEventListener("pointermove", (e) => {
    net.tx = e.clientX;
    net.ty = e.clientY;
  });
  $("#sky").addEventListener("click", (e) => {
    if (state !== "catching") return;
    // a tap on touch, a click on the net's highlighted plane with a mouse
    const id = e.pointerType === "mouse" || !coarse.matches ? net.locked ?? sky.nearest(e.clientX, e.clientY, 44)?.id : sky.nearest(e.clientX, e.clientY, 50)?.id;
    if (id) requestCatch(id);
    else toast("No plane under the net. Aim at one, or use Catch an available plane.", 2200);
  });
  bindThrowGesture();
  addEventListener("pagehide", () => {
    if (state === "editing") saveDraft();
  });
}

async function boot() {
  const [land, reg] = await Promise.all([fetch("/web/land.json").then((r) => r.json()), fetch("/web/regions.json").then((r) => r.json())]);
  regions = reg.countries;
  try {
    const { Sky } = await import("./scene.js");
    sky = new Sky($("#sky"), land, { reducedMotion: reduced() });
  } catch (err) {
    console.warn("WebGL unavailable, using the flat sky", err);
    sky = new FlatSky($("#sky"));
    document.body.classList.add("flat");
  }
  composerPaper = new Paper(composer.slot, { reducedMotion: reduced });
  heldPaper = new Paper(held.slot, { reducedMotion: reduced });
  originPicker = new Picker($("[data-picker=origin]"), (p) => {
    composer.place = p;
    paintComposer();
    if (state === "editing") saveDraft();
  });
  stampPicker = new Picker($("[data-picker=stamp]"), (p) => {
    held.place = p;
    releaseKey = null;
    paintHeld();
  });
  draftKey = storage.get("pp-draft-key");
  bind();
  updateCreateLabel();
  await reconcile();
  connect();
  trackNet();
  if (state === "world") setState("world", { focus: false });
  document.body.classList.add("ready");
  // read-only handles for debugging from a console; nothing here can write
  globalThis.paperPlanes = { state: () => state, screenOf: (id) => sky.screenOf(id), flying: () => [...flying.keys()] };
}

// A 2D stand-in when WebGL isn't available: the same real planes, drawn as
// buttons drifting round a flat disc, with the same create/catch/read/stamp.
class FlatSky {
  constructor(host) {
    this.host = host;
    this.layer = document.createElement("div");
    this.layer.className = "flat-sky";
    this.layer.innerHTML = `<div class="flat-globe"></div>`;
    host.append(this.layer);
    this.planes = new Map();
    this.dragEnabled = false;
  }
  addPlane({ id, hex }) {
    if (this.planes.has(id)) return;
    const el = document.createElement("span");
    el.className = "flat-plane";
    el.append(thumb(hex));
    el.style.setProperty("--a", `${(id * 137) % 360}deg`);
    el.style.setProperty("--r", `${38 + ((id * 53) % 12)}vmin`);
    el.style.setProperty("--d", `${40 + ((id * 29) % 30)}s`);
    this.layer.append(el);
    this.planes.set(id, el);
  }
  removePlane(id) {
    this.planes.get(id)?.remove();
    this.planes.delete(id);
  }
  setPlanes() {}
  screenOf(id) {
    const r = this.planes.get(id)?.getBoundingClientRect();
    return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2, hidden: false } : null;
  }
  nearest(x, y, radius) {
    let best = null;
    for (const id of this.planes.keys()) {
      const s = this.screenOf(id);
      const d = Math.hypot(s.x - x, s.y - y);
      if (d <= radius && (!best || d < best.d)) best = { id, d, x: s.x, y: s.y };
    }
    return best;
  }
  globeScreen() {
    return { x: innerWidth / 2, y: innerHeight * 0.45, r: 100 };
  }
  setFocus() {}
  showRoute() {}
  clearRoute() {}
}

boot();
