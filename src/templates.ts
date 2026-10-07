import type { Kind, Trace } from "./db.ts";

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

const shell = (title: string, body: string): string => `<!doctype html>
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
      @media (prefers-reduced-motion: reduce) { li.trace.arrived { animation: none; } }
      li.trace .glyph { font-size: 1.1rem; text-align: center; }
      li.trace .text { overflow-wrap: anywhere; min-width: 0; }
      li.trace .when { font-size: 0.75rem; color: light-dark(#595959, #999); white-space: nowrap; }
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

export function renderTrace(t: Trace, visitorId: string): string {
  const meta = KIND_META[t.kind];
  const isMine = t.visitorId === visitorId;
  const mineLabel = isMine ? `<span class="visually-hidden">yours: </span>` : "";
  return `<li class="trace kind-${t.kind}${isMine ? " mine" : ""}" id="trace-${t.id}" data-kind="${t.kind}">
            <span class="glyph" aria-hidden="true" title="${meta.hanzi} ${escapeHtml(meta.label)}">${meta.glyph}</span>
            <span class="visually-hidden">tagged as ${escapeHtml(meta.label)}: </span>
            <span class="text">${mineLabel}${escapeHtml(t.text)}</span>
            <span class="when">${relativeTime(t.createdAt)}</span>
          </li>`;
}

function renderFilters(current: Kind | undefined): string {
  const link = (href: string, active: boolean, inner: string) =>
    `<li><a href="${href}"${active ? ` aria-current="page"` : ""}>${inner}</a></li>`;
  const kinds = (Object.entries(KIND_META) as [Kind, (typeof KIND_META)[Kind]][]).map(([kind, m]) =>
    link(
      `/?kind=${kind}`,
      current === kind,
      `<span aria-hidden="true">${m.glyph}</span> <span lang="zh-Hant">${m.hanzi}</span> ${escapeHtml(m.plural)}`,
    ),
  );
  return `<nav class="filters" aria-label="show only one as-if">
        <ul>${link("/", current === undefined, "everything")}${kinds.join("")}</ul>
      </nav>`;
}

export function renderWall(
  traces: Trace[],
  visitorId: string,
  kind: Kind | undefined,
  newest: number,
): string {
  const options = Object.entries(KIND_META)
    .map(
      ([value, m]) =>
        `<option value="${value}"${value === kind ? " selected" : ""}>${m.hanzi} ${escapeHtml(m.label)}</option>`,
    )
    .join("");

  const items = traces.length
    ? traces.map((t) => renderTrace(t, visitorId)).join("\n")
    : `<li class="empty">${kind ? `no ${escapeHtml(KIND_META[kind].plural)} yet` : "nothing has passed through yet"}</li>`;

  const body = `
    <header>
      <h1>六如 &mdash; a wall for passing things</h1>
      <p class="sub">leave a thought as one of the six as-ifs; it stays here, quietly, whether or not you come back</p>
      <nav class="meta"><a href="/readme/">what this is for</a></nav>
    </header>
    <main>
      <section class="as-ifs" aria-label="the six as-ifs">
        <p class="verse" lang="zh-Hant"><span>一切有為法，</span><span>如夢幻泡影，</span><span>如露亦如電，</span><span>應作如是觀。</span></p>
        <p class="gloss">The Diamond Sūtra ends on six similes: everything that comes together from causes is
          <em>as if</em> a dream, an illusion, a bubble, a shadow, dew, a flash of lightning &mdash;
          see it that way. That's 六如, the six as&#8209;ifs. Pick whichever your thought feels most like.</p>
      </section>
      <form class="trace-form" method="post" action="/trace">
        <label>this feels like&hellip;
          <select name="kind" required>${options}</select>
        </label>
        <label>what passed through
          <input type="text" name="text" maxlength="240" required placeholder="a fragment, not an essay" />
        </label>
        <button type="submit">let it go</button>
      </form>
      <p class="note" role="status" id="post-note"></p>
      ${renderFilters(kind)}
      <p class="visually-hidden" role="status" aria-live="polite" id="live-status"></p>
      <ul class="wall" data-since="${newest}"${kind ? ` data-kind="${kind}"` : ""}>
        ${items}
      </ul>
    </main>
    <script src="/client.js" defer></script>
  `;
  return shell("六如 — a wall for passing things", body);
}

export function renderReadme(bodyHtml: string): string {
  const body = `
    <nav class="meta"><a href="/">back to the wall</a></nav>
    <main>${bodyHtml}</main>
  `;
  return shell("About — 六如", body);
}
