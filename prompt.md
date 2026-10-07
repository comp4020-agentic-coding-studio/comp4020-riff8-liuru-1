# Next: make the wall live, and let people move through the six as-ifs together

## The goal

C9 wants this app real-time. Everything below is in priority order: if the run
runs out of road, land the earlier items properly rather than all of them
badly. A half-finished feature is worse than one we didn't ask for.

### 1. Live updates — this one must land

A trace one person leaves appears on every other open session in about a
second, with no reload. Today the wall only updates on refresh, and the README
already names this as the gap. Transport is yours; SSE is probably enough for a
one-way wall.

### 2. Say what the six as-ifs are

A first-time visitor should understand 六如 — the six similes from the closing
lines of the Diamond Sūtra — without leaving the page. Short and in the page's
own voice, not a wall of explanation.

### 3. Filter the wall by as-if

Six ways in, one per simile. Someone who wants only the dreams should be able
to get a wall of only dreams, and back again. Keep it reverse-chronological
inside a filter; don't rank or curate.

### 4. Let people respond to a trace

Give visitors a way to react or reply to someone else's trace, so the wall can
hold more than one voice per thought. Keep it as small as it can be and still
be worth having.

### 5. Sound, if there's time

When someone picks an as-if, play a short sound that belongs to it — thunder
for lightning, and so on. **Off by default, with a visible control to turn it
on**, and silent for anyone with `prefers-reduced-motion` set. Never play audio
without the visitor having acted first.

## The C9 decision you must write down

C9 asks for one decision about how the app behaves when several people are in
it at once, recorded in the repo with the reasoning. Replies make that decision
unavoidable, so make it deliberately and write it into `README.md`:

- what arrives live and what waits for a reload — new traces? replies to a
  trace someone is reading? a filtered view?
- what two people replying to the same trace at the same moment see
- what someone sees when they come back tomorrow

Pick the answers, state them, say why.

## Where this cuts against the README — handle it, don't ignore it

The README's current definition of good is "small and quiet rather than
sticky", with no message-board features and no identity. Replies and sound both
push against that. That is allowed — this is a riff, and the app is meant to go
somewhere — **but don't break the argument silently.** Extend `README.md` to
say what changed and why it's still the same app. An app whose README describes
a quieter thing than the one running is the failure to avoid.

Still off the table: names, colours, avatars. Show presence if you need to, not
people.

## What good looks like

- Two browsers side by side: a trace in one appears in the other inside a
  second, neither reloaded.
- **Test it as a crowd, not a user.** Drive 3–4 independent sessions at once —
  separate browsers or separate cookie jars, not four tabs sharing one — and
  check that posting, filtering and replying all behave with all of them live.
  Multi-user bugs do not show up with one session.
- Each of the six filters shows only its own traces, and the counts add up to
  the unfiltered wall.
- Sound, if built, is silent until switched on.
- `pnpm check` is green, `spec/trace.test.ts` is unchanged and still passing,
  and the app deploys.
- Add checks of your own in `spec/` for whatever you build, and **break each
  one on purpose to watch it fail before trusting it.**
- Traces still survive a restart and a redeploy. Don't delete rows to make
  anything here work.

## Read first

- `README.md` — this app's definition of good, and the paragraph naming
  real-time as next crit's job
- `CLAUDE.md` — the rules this repo holds to
- `src/db.ts` — `Trace`, the six `KINDS`, how rows are stored
- `src/server.ts`, `src/templates.ts` — routing and rendering
- `spec/trace.test.ts` — the four checks that must keep passing
