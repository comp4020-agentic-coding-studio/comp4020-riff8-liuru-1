import type { Kind, Reply, Trace } from "./db.ts";
import type { Hold, PublicPlane } from "./planes.ts";
import { COUNTRIES } from "./regions.ts";
import { COLOURS, MAX_BODY } from "./web/rules.js";

const KIND_META: Record<Kind, { glyph: string; hanzi: string; label: string; plural: string }> = {
  dream: { glyph: "☁", hanzi: "夢", label: "a dream", plural: "dreams" },
  illusion: { glyph: "◈", hanzi: "幻", label: "an illusion", plural: "illusions" },
  bubble: { glyph: "○", hanzi: "泡", label: "a bubble", plural: "bubbles" },
  shadow: { glyph: "◐", hanzi: "影", label: "a shadow", plural: "shadows" },
  dew: { glyph: "•", hanzi: "露", label: "dew", plural: "dew" },
  lightning: { glyph: "⚡", hanzi: "電", label: "a flash of lightning", plural: "lightning" },
};

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function relativeTime(ms: number): string {
  const seconds = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

const archiveShell = (title: string, body: string): string => `<!doctype html>
<html lang="en-AU">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <style>
      :root { color-scheme: light dark; }
      body {
        font-family: ui-serif, Georgia, "Noto Serif CJK SC", serif;
        max-width: 40rem;
        margin: 0 auto;
        padding: 1.5rem 1rem 4rem;
        line-height: 1.6;
      }
      header { margin-bottom: 1.5rem; }
      h1 { font-size: 1.4rem; margin-bottom: 0.25rem; }
      .sub { color: light-dark(#595959, #999); margin-top: 0; font-size: 0.95rem; }
      nav.meta a { color: inherit; }
      section.as-ifs { margin-bottom: 1.5rem; }
      section.as-ifs .verse { font-size: 1.05rem; letter-spacing: 0.08em; margin: 0 0 0.4rem; }
      section.as-ifs .verse span { white-space: nowrap; }
      section.as-ifs .gloss { font-size: 0.9rem; color: light-dark(#595959, #999); margin: 0; }
      form.trace-form {
        display: grid;
        gap: 0.6rem;
        border: 1px solid #8883;
        border-radius: 0.5rem;
        padding: 1rem;
        margin-bottom: 2rem;
      }
      form.trace-form label { display: grid; gap: 0.25rem; font-size: 0.9rem; }
      form.trace-form select,
      form.trace-form input {
        font: inherit;
        padding: 0.4rem 0.5rem;
        border-radius: 0.3rem;
        border: 1px solid #8886;
      }
      form.trace-form .form-actions { display: flex; justify-content: space-between; align-items: center; gap: 0.6rem; }
      form.trace-form button.sound-toggle { font-size: 0.8rem; padding: 0.25rem 0.7rem; }
      form.trace-form button.sound-toggle[aria-pressed="true"] { border-color: currentColor; }
      form.trace-form button.sound-toggle:disabled { cursor: default; opacity: 0.8; }
      form.trace-form button[hidden] { display: none; }
      form.trace-form button {
        font: inherit;
        justify-self: start;
        padding: 0.4rem 1rem;
        border-radius: 0.3rem;
        border: 1px solid #8886;
        background: transparent;
        cursor: pointer;
      }
      nav.filters ul { list-style: none; margin: 0 0 1rem; padding: 0; display: flex; flex-wrap: wrap; gap: 0.4rem; }
      nav.filters a {
        display: inline-block;
        padding: 0.2rem 0.6rem;
        border: 1px solid #8886;
        border-radius: 1rem;
        color: inherit;
        text-decoration: none;
        font-size: 0.9rem;
      }
      nav.filters a[aria-current="page"] { background: #8884; border-color: currentColor; }
      p.note { font-size: 0.9rem; margin: -1.25rem 0 1.25rem; min-height: 0; }
      p.note:empty { display: none; }
      p.note a { color: inherit; }
      ul.wall { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.75rem; }
      li.trace {
        display: grid;
        grid-template-columns: 1.6rem 1fr auto;
        gap: 0.6rem;
        align-items: baseline;
        padding: 0.5rem 0.6rem;
        border-radius: 0.4rem;
        opacity: 0.92;
      }
      li.trace.mine { background: #8883; opacity: 1; }
      li.trace.arrived { animation: arrive 1.2s ease-out; }
      @keyframes arrive { from { opacity: 0; transform: translateY(-0.3rem); } }
      @media (prefers-reduced-motion: reduce) { li.trace.arrived, li.reply.arrived { animation: none; } }
      li.trace .glyph { font-size: 1.1rem; text-align: center; }
      li.trace .text { overflow-wrap: anywhere; min-width: 0; }
      li.trace .when { font-size: 0.75rem; color: light-dark(#595959, #999); white-space: nowrap; }
      li.trace .thread { grid-column: 2 / -1; font-size: 0.9rem; }
      ol.replies {
        list-style: none;
        margin: 0.2rem 0 0.3rem;
        padding: 0 0 0 0.7rem;
        border-left: 2px solid #8885;
        display: grid;
        gap: 0.2rem;
      }
      ol.replies:empty { display: none; }
      li.reply { overflow-wrap: anywhere; }
      li.reply.mine .text { text-decoration: underline dotted #8889; text-underline-offset: 0.2em; }
      li.reply.arrived { animation: arrive 1.2s ease-out; }
      li.reply .when { font-size: 0.7rem; color: light-dark(#595959, #999); white-space: nowrap; }
      details.answer summary {
        cursor: pointer;
        font-size: 0.8rem;
        color: light-dark(#595959, #999);
        width: fit-content;
      }
      form.reply-form { display: flex; flex-wrap: wrap; gap: 0.4rem; align-items: end; margin-top: 0.3rem; }
      form.reply-form label { display: grid; gap: 0.15rem; font-size: 0.8rem; flex: 1 1 12rem; }
      form.reply-form input,
      form.reply-form button {
        font: inherit;
        padding: 0.25rem 0.45rem;
        border-radius: 0.3rem;
        border: 1px solid #8886;
        background: transparent;
      }
      form.reply-form button { cursor: pointer; }
      .empty { color: light-dark(#595959, #999); font-style: italic; }
      pre.readme-body { white-space: pre-wrap; }
      .visually-hidden {
        position: absolute;
        width: 1px;
        height: 1px;
        margin: -1px;
        padding: 0;
        overflow: hidden;
        clip: rect(0, 0, 0, 0);
        white-space: nowrap;
        border: 0;
      }
    </style>
  </head>
  <body>
    ${body}
  </body>
</html>`;

export function renderReply(r: Reply, visitorId: string): string {
  const isMine = r.visitorId === visitorId;
  const mineLabel = isMine ? `<span class="visually-hidden">yours: </span>` : "";
  return `<li class="reply${isMine ? " mine" : ""}" id="reply-${r.id}"><span class="text">${mineLabel}${escapeHtml(r.text)}</span> <span class="when">${relativeTime(r.createdAt)}</span></li>`;
}

// The old wall, read-only: every trace and answer as it was left, with no
// form to add to it. Paper planes replaced it as the way in (README.md).
export function renderTrace(t: Trace, visitorId: string, replies: Reply[]): string {
  const meta = KIND_META[t.kind];
  const isMine = t.visitorId === visitorId;
  const mineLabel = isMine ? `<span class="visually-hidden">yours: </span>` : "";
  return `<li class="trace kind-${t.kind}${isMine ? " mine" : ""}" id="trace-${t.id}" data-kind="${t.kind}">
            <span class="glyph" aria-hidden="true" title="${meta.hanzi} ${escapeHtml(meta.label)}">${meta.glyph}</span>
            <span class="visually-hidden">tagged as ${escapeHtml(meta.label)}: </span>
            <span class="text">${mineLabel}${escapeHtml(t.text)}</span>
            <span class="when">${relativeTime(t.createdAt)}</span>
            <div class="thread">
              <ol class="replies" aria-label="answers">${replies.map((r) => renderReply(r, visitorId)).join("")}</ol>
            </div>
          </li>`;
}

function renderFilters(current: Kind | undefined): string {
  const link = (href: string, active: boolean, inner: string) =>
    `<li><a href="${href}"${active ? ` aria-current="page"` : ""}>${inner}</a></li>`;
  const kinds = (Object.entries(KIND_META) as [Kind, (typeof KIND_META)[Kind]][]).map(([kind, m]) =>
    link(
      `/archive?kind=${kind}`,
      current === kind,
      `<span aria-hidden="true">${m.glyph}</span> <span lang="zh-Hant">${m.hanzi}</span> ${escapeHtml(m.plural)}`,
    ),
  );
  return `<nav class="filters" aria-label="show only one as-if">
        <ul>${link("/archive", current === undefined, "everything")}${kinds.join("")}</ul>
      </nav>`;
}

export function renderArchive(
  traces: Trace[],
  replies: Map<number, Reply[]>,
  visitorId: string,
  kind: Kind | undefined,
): string {
  const items = traces.length
    ? traces.map((t) => renderTrace(t, visitorId, replies.get(t.id) ?? [])).join("\n")
    : `<li class="empty">${kind ? `no ${escapeHtml(KIND_META[kind].plural)} were left` : "nothing was left on the wall"}</li>`;

  const body = `
    <header>
      <h1>六如 &mdash; the wall, archived</h1>
      <p class="sub">before the paper planes, this was a wall of passing thoughts. It's kept here as it was left, to read, not to add to.</p>
      <nav class="meta"><a href="/">back to the sky</a> &middot; <a href="/readme/">why it changed</a></nav>
    </header>
    <main>
      <section class="as-ifs" aria-label="the six as-ifs">
        <p class="verse" lang="zh-Hant"><span>一切有為法，</span><span>如夢幻泡影，</span><span>如露亦如電，</span><span>應作如是觀。</span></p>
        <p class="gloss">The Diamond Sūtra ends on six similes: everything that comes together from causes is
          <em>as if</em> a dream, an illusion, a bubble, a shadow, dew, a flash of lightning &mdash;
          see it that way. That's 六如, the six as&#8209;ifs. Each trace here was tagged with one.</p>
      </section>
      ${renderFilters(kind)}
      <ul class="wall">
        ${items}
      </ul>
    </main>
  `;
  return archiveShell("六如 — the wall, archived", body);
}

export function renderReadme(bodyHtml: string): string {
  const body = `
    <nav class="meta"><a href="/">back to the sky</a></nav>
    <main>${bodyHtml}</main>
  `;
  return archiveShell("About — Paper Planes", body);
}

// ---------------------------------------------------------------------------
// The sky. One page: the scene and every panel are in this HTML, and
// /web/app.js runs them. With JavaScript off, the <noscript> block below is
// the whole app as plain forms.

const colourName = (id: string): string => COLOURS.find((c) => c.id === id)?.name ?? id;

const when = (ms: number): string =>
  new Date(ms).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

function placeOptions(): string {
  return COUNTRIES.map(
    (c) =>
      `<optgroup label="${escapeHtml(c.name)}"><option value="${c.id}">${escapeHtml(c.name)} (anywhere)</option>${c.cities
        .map((ct) => `<option value="${ct.id}">${escapeHtml(ct.name)}, ${escapeHtml(c.name)}</option>`)
        .join("")}</optgroup>`,
  ).join("");
}

function stampList(p: PublicPlane): string {
  return `<ol class="nojs-stamps">${p.stamps
    .map((s) => `<li>${s.seq === 1 ? "From" : "Stamped in"} ${escapeHtml(s.label)}, ${when(s.at)}, by ${escapeHtml(s.by)}</li>`)
    .join("")}</ol>`;
}

function nojsPlane(p: PublicPlane): string {
  return `<article class="nojs-plane" style="--paper:${COLOURS.find((c) => c.id === p.colour)?.hex ?? "#ccc"}">
      <p class="nojs-meta">${escapeHtml(colourName(p.colour))} plane #${p.id} from ${escapeHtml(p.author)}</p>
      <p class="nojs-body">${escapeHtml(p.body)}</p>
      ${stampList(p)}
    </article>`;
}

function renderNoscript(o: SkyOptions): string {
  const places = placeOptions();
  const colours = COLOURS.map(
    (c, i) =>
      `<label class="nojs-swatch"><input type="radio" name="colour" value="${c.id}"${i === 4 ? " checked" : ""} /> <span style="background:${c.hex}"></span>${c.name}</label>`,
  ).join("");
  const held = o.hold
    ? `<section aria-labelledby="nojs-held"><h2 id="nojs-held">The plane you caught</h2>
        ${nojsPlane(o.hold.plane)}
        <form method="post" action="/planes/${o.hold.planeId}/release">
          <input type="hidden" name="lease" value="${o.hold.leaseId}" />
          <input type="hidden" name="key" value="${o.formKey}s" />
          <label>Add your stamp <select name="place" required><option value="">Choose a place</option>${places}</select></label>
          <button type="submit">Stamp &amp; send onward</button>
        </form>
        <form method="post" action="/planes/${o.hold.planeId}/release">
          <input type="hidden" name="lease" value="${o.hold.leaseId}" />
          <input type="hidden" name="key" value="${o.formKey}r" />
          <button type="submit">Release without stamping</button>
        </form>
      </section>`
    : `<section aria-labelledby="nojs-catch"><h2 id="nojs-catch">Catch a plane</h2>
        <form method="post" action="/catch"><button type="submit">Catch an available plane</button></form>
      </section>`;
  return `<noscript>
    <div class="nojs">
      ${o.note ? `<p class="nojs-note" role="status">${escapeHtml(o.note)}</p>` : ""}
      ${held}
      <section aria-labelledby="nojs-create"><h2 id="nojs-create">Create a plane</h2>
        <form method="post" action="/planes">
          <input type="hidden" name="key" value="${o.formKey}c" />
          <label>Your message (up to ${MAX_BODY} characters)<textarea name="body" rows="5" required></textarea></label>
          <fieldset><legend>Paper colour</legend>${colours}</fieldset>
          <label>The place your plane represents (it doesn't have to be where you are)
            <select name="place" required><option value="">Choose a place</option>${places}</select></label>
          <button type="submit">Throw plane</button>
        </form>
      </section>
      <section aria-labelledby="nojs-mine"><h2 id="nojs-mine">Your planes</h2>
        ${o.mine.length ? o.mine.map(nojsPlane).join("") : "<p>You haven't thrown a plane from this browser yet.</p>"}
      </section>
    </div>
  </noscript>`;
}

export interface SkyOptions {
  handle: string;
  hold?: Hold & { plane: PublicPlane };
  mine: PublicPlane[];
  cursor: number;
  note?: string;
  formKey: string;
}

const PLANE_MARK = `<svg class="mark" viewBox="0 0 24 24" aria-hidden="true"><path d="M2 11.5 22 3l-6.5 18-4-7.5z" fill="currentColor" opacity=".9"/><path d="M11.5 13.5 22 3" stroke="#fff" stroke-width="1.2"/></svg>`;

export function renderSky(o: SkyOptions): string {
  const swatches = COLOURS.map(
    (c) => `<label class="swatch">
              <input type="radio" name="colour" value="${c.id}" />
              <span class="dot" style="--c:${c.hex}" aria-hidden="true"></span>
              <span class="swatch-name">${c.name}</span>
            </label>`,
  ).join("");
  const picker = (id: string, label: string) => `<div class="picker" data-picker="${id}">
              <label for="${id}-country">${label}</label>
              <div class="combo">
                <input id="${id}-country" type="text" role="combobox" autocomplete="off" spellcheck="false"
                  aria-autocomplete="list" aria-expanded="false" aria-controls="${id}-list" aria-describedby="${id}-hint ${id}-error"
                  placeholder="Search, e.g. Australia or Tokyo" />
                <ul id="${id}-list" role="listbox" aria-label="${label} results" hidden></ul>
              </div>
              <label for="${id}-city" class="city-label">City <span class="optional">(optional)</span></label>
              <select id="${id}-city" disabled><option value="">Choose a country first</option></select>
              <p class="hint" id="${id}-hint">Choose the place your plane represents &mdash; it does not have to be where you are.</p>
              <p class="error" id="${id}-error" role="alert"></p>
            </div>`;

  const body = `
    <div id="sky" aria-hidden="true"></div>
    <div id="net" aria-hidden="true"></div>
    <header class="top">
      <a class="brand" href="/">${PLANE_MARK}<span class="brand-text"><span class="brand-name">Paper Planes</span><span class="brand-sub">Six colours. One shared sky.</span></span></a>
      <nav class="secondary" aria-label="More">
        <button type="button" class="menu-toggle" aria-expanded="false" aria-controls="secondary-items">Menu</button>
        <div id="secondary-items" class="secondary-items">
          <button type="button" data-action="mine">Your planes</button>
          <button type="button" data-action="sound" aria-pressed="false">Sound off</button>
          <button type="button" data-action="about">About</button>
        </div>
      </nav>
    </header>

    <main id="app" class="app" data-state="world" data-cursor="${o.cursor}">
      <p class="you">You are <strong class="handle">${escapeHtml(o.handle)}</strong> <span class="you-note">in this browser</span></p>
      <p class="connection" role="status" hidden>Reconnecting&hellip;</p>
      <p class="caption" aria-live="polite"></p>
      <p class="toast" role="status" aria-live="assertive"></p>
      <section class="panel world-panel" aria-label="The sky">
        <p class="hint-first">Write on a sheet, fold it into a plane and throw it into the sky. Catch someone else's, read it, stamp it and send it on.</p>
        <p class="empty-sky" hidden>No planes are flying yet. Make the first one.</p>
        <div class="actions">
          <button type="button" class="primary" data-action="create">Create a plane</button>
          <button type="button" class="primary" data-action="catch">Catch a plane</button>
        </div>
      </section>

      <section class="panel composer" role="dialog" aria-modal="true" aria-labelledby="composer-title">
        <h2 id="composer-title" class="visually-hidden">Create a plane</h2>
        <ol class="progress" aria-label="Steps">
          <li data-step="write">Write</li><li data-step="choose">Colour &amp; region</li><li data-step="fold">Fold</li><li data-step="throw">Throw</li>
        </ol>
        <div class="composer-grid">
          <div class="paper-slot" data-slot="composer">
            <div class="face">
              <p class="face-origin"></p>
              <label for="message" class="visually-hidden">Your message</label>
              <textarea id="message" class="face-body" maxlength="1000" aria-describedby="message-count message-error" placeholder="Write something for a stranger to find&hellip;"></textarea>
              <ol class="face-stamps" aria-label="Stamp preview"></ol>
            </div>
            <p class="sending" hidden>Sending&hellip;</p>
          </div>
          <div class="rail">
            <p class="counter" id="message-count" aria-live="polite">0 / ${MAX_BODY}</p>
            <p class="error" id="message-error" role="alert"></p>
            <fieldset class="swatches">
              <legend>Paper colour</legend>
              <div class="swatch-row">${swatches}</div>
            </fieldset>
            ${picker("origin", "Country / region")}
            <div class="rail-actions edit-actions">
              <button type="button" class="primary" data-action="fold">Fold plane</button>
              <button type="button" data-action="close-composer">Back to sky</button>
            </div>
            <div class="rail-actions ready-actions">
              <button type="button" class="primary" data-action="throw">Throw plane</button>
              <button type="button" data-action="unfold-draft">Back to edit</button>
              <p class="gesture-hint">Or drag the plane upward and let go.</p>
            </div>
            <p class="error" id="send-error" role="alert"></p>
          </div>
        </div>
      </section>

      <section class="panel catching" aria-labelledby="catching-title">
        <h2 id="catching-title" class="instruction">Point the net at a plane and click it</h2>
        <div class="actions">
          <button type="button" class="primary" data-action="catch-any">Catch an available plane</button>
          <button type="button" data-action="cancel-catch">Back to sky</button>
        </div>
      </section>

      <section class="panel held" role="dialog" aria-modal="true" aria-labelledby="held-title">
        <h2 id="held-title" class="visually-hidden">The plane you caught</h2>
        <div class="composer-grid">
          <div class="paper-slot" data-slot="held">
            <div class="face">
              <p class="face-origin"></p>
              <div class="face-body reading" tabindex="0" role="region" aria-label="The message on this plane"></div>
              <ol class="face-stamps" aria-label="Stamps"></ol>
              <button type="button" class="all-stamps" data-action="journey" hidden></button>
            </div>
          </div>
          <div class="rail">
            <p class="plane-meta"></p>
            <div class="rail-actions folded-actions">
              <button type="button" class="primary" data-action="open">Open / Unfold</button>
              <button type="button" data-action="release">Back to sky</button>
            </div>
            <div class="reading-actions">
              ${picker("stamp", "Add your stamp")}
              <div class="rail-actions">
                <button type="button" class="primary" data-action="stamp">Stamp &amp; send onward</button>
                <button type="button" data-action="release">Release without stamping</button>
                <button type="button" data-action="journey">View journey</button>
              </div>
            </div>
            <p class="held-note" role="status"></p>
            <p class="lease-warning" role="alert" hidden></p>
            <p class="error" id="held-error" role="alert"></p>
          </div>
        </div>
      </section>

      <section class="panel journey" aria-labelledby="journey-title">
        <div class="journey-card">
          <h2 id="journey-title">Journey</h2>
          <p class="journey-body"></p>
          <ol class="journey-list"></ol>
          <p class="journey-distance"></p>
          <button type="button" data-action="close-journey">Back</button>
        </div>
      </section>
    </main>

    <aside class="drawer" aria-labelledby="drawer-title" hidden>
      <div class="drawer-head"><h2 id="drawer-title">Your planes</h2><button type="button" data-action="close-drawer">Close</button></div>
      <p class="drawer-note">Planes thrown from this browser. There's no account: another browser, or cleared cookies, starts a fresh list.</p>
      <ul class="mine-list"></ul>
      <button type="button" class="more" data-action="more-mine" hidden>Load more</button>
    </aside>

    <dialog class="about" aria-labelledby="about-title">
      <h2 id="about-title">About</h2>
      <p>A student recreation of <a href="https://paperplanes.world/">Paper Planes</a> (Active Theory for Google I/O, 2016), made for COMP4020 at the ANU. Not affiliated with or endorsed by Google or Active Theory.</p>
      <p>Write a message, fold it into one of six colours of paper, and throw it. Anyone can catch it, read it, add a stamp from a place they choose, and send it on. The place is a label you pick, never your location.</p>
      <p>Map data: <a href="https://www.naturalearthdata.com/">Natural Earth</a> (public domain), via <a href="https://github.com/topojson/world-atlas">world-atlas</a>. 3D: <a href="https://threejs.org/">three.js</a>.</p>
      <p><a href="/readme/">How it works and why</a> &middot; <a href="/archive">The old wall (六如), archived</a></p>
      <form method="dialog"><button>Close</button></form>
    </dialog>

    ${renderNoscript(o)}
    <script type="importmap">{"imports":{"three":"/vendor/three.module.js"}}</script>
    <script type="module" src="/web/app.js"></script>
  `;
  return `<!doctype html>
<html lang="en-AU" class="no-js">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content" />
    <title>Paper Planes</title>
    <script>document.documentElement.className = "js";</script>
    <link rel="stylesheet" href="/web/app.css" />
  </head>
  <body>
    ${body}
  </body>
</html>`;
}
