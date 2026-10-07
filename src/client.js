// The wall works without this file: the form posts and the page reloads.
// With it, new traces arrive over server-sent events and posting doesn't
// reload, so the wall moving is the only sign anyone else is here.

const wall = document.querySelector("ul.wall");
const status = document.getElementById("live-status");
const form = document.querySelector("form.trace-form");
const note = document.getElementById("post-note");

function fromHtml(html) {
  const t = document.createElement("template");
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

function addTrace({ id, kind, html }) {
  // a filtered wall only takes its own kind, live as on a fresh load
  if (wall.dataset.kind && wall.dataset.kind !== kind) return;
  if (document.getElementById(`trace-${id}`)) return;
  const li = fromHtml(html);
  li.classList.add("arrived");
  wall.querySelector("li.empty")?.remove();
  wall.prepend(li);
  // one short line for screen readers, matching what a sighted visitor sees
  const label = li.querySelector(".visually-hidden")?.textContent ?? "";
  const text = li.querySelector(".text")?.textContent ?? "";
  status.textContent = `just arrived, ${label}${text}`;
}

if (wall && "EventSource" in window) {
  const since = wall.dataset.since ?? "0";
  const events = new EventSource(`/events?since=${encodeURIComponent(since)}`);
  events.addEventListener("trace", (e) => addTrace(JSON.parse(e.data)));
}

// Post without leaving the page; the stream brings the trace back, the same
// way it reaches everyone else.
if (form && "EventSource" in window) {
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const body = new URLSearchParams(new FormData(form));
    const input = form.querySelector("input[name=text]");
    const button = form.querySelector("button[type=submit]");
    button.disabled = true;
    try {
      await fetch(form.action, { method: "POST", body, redirect: "manual" });
      input.value = "";
      // posting a kind this filtered view hides would otherwise look like it vanished
      const kind = body.get("kind");
      if (wall.dataset.kind && kind !== wall.dataset.kind) {
        const chosen = form.querySelector(`option[value="${kind}"]`)?.textContent ?? kind;
        note.innerHTML = "";
        note.append(`Left as ${chosen.replace(/^\S+\s/, "")}; this view shows only one as-if. `);
        const all = document.createElement("a");
        all.href = "/";
        all.textContent = "See everything";
        note.append(all, ".");
      } else {
        note.textContent = "";
      }
    } finally {
      button.disabled = false;
      input.focus();
    }
  });
}
