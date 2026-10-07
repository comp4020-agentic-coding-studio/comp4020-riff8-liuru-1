# Next: make the wall real-time, and let passing be something people witness together

## The goal

C9 wants this app real-time: a trace one person leaves reaches every other open
session in about a second, with no reload. Do that — the transport is yours,
and SSE is probably enough for a one-way wall.

But real-time on its own would just be a faster guestbook, and this app is
better than that. The wall is named 六如 and tagged with six similes for things
that vanish — a bubble, dew, a flash of lightning — and right now **nothing on
it passes.** The page says "it stays here, quietly, whether or not you come
back", and the database agrees: every trace is permanent. The name promises
impermanence and the behaviour delivers an archive.

Close that gap, and use co-presence to do it. That is the decision we want from
this run.

## The decision: passing is witnessed, not scheduled

Make a trace's passing something that happens **while people are there to see
it**, not on a timer that runs in an empty room.

Concretely: while more than one session is open, traces visibly age on the wall
in real time — the newest are sharp, older ones recede, and the oldest reach a
state where they have clearly passed. When nobody else is present the wall is
still; a lone visitor reads an archive. Come back with someone else and the
wall starts moving again.

This is the Pico Park point the README already makes: the app should be better
because other people are in it right now, not merely usable by more than one
person at a time.

**Do not delete traces to achieve this.** Passing is how the wall *presents* a
trace, not whether the row exists. Traces must still survive a restart and a
redeploy, and `spec/trace.test.ts` must keep passing unchanged.

If you think a different single decision serves the six similes better, you may
take it — but write down which one you took and why, and it must still be about
how the app behaves with several people in it.

## What good looks like

- Two browsers side by side: a trace left in one appears in the other within
  about a second, neither reloaded.
- With both open, the wall is visibly in motion — ageing is something you can
  watch happen, not something you infer from timestamps.
- With one browser open, the wall is still and quiet.
- The decision and its reasoning are written into the repo, not just
  implemented — `README.md` is where this app's argument lives, so extend it
  there.
- `pnpm check` is green and the app deploys. `spec/trace.test.ts` is unchanged.
- Add at least one check of your own in `spec/` for the new behaviour, and make
  sure you have seen it fail before you trust it.

## Keep, and leave alone

- **Keep the wall quiet.** The README's definition of good is "small and quiet
  rather than sticky": no notifications, no growth loop, nothing that chases a
  visitor back. Live updates must not become alerts. Nothing should jump,
  flash, or steal focus while someone is reading.
- **Keep the six similes doing real work.** They are the design constraint, not
  a select box. If ageing is added, it should feel like the simile a trace was
  tagged with — lightning and dew do not pass the same way.
- **No names, no colours, no avatars.** The README defers visitor identity
  deliberately. If you need to show that others are present, show presence —
  not people. A count, or the wall simply moving, is enough.
- **Don't redefine what this app is for.** Extend the README's argument; don't
  replace it.
- Reverse-chronological, nothing ranked or curated. Leave that alone.
- Respect `prefers-reduced-motion`: if ageing is animated, it must have a still
  equivalent.

## Read first

- `README.md` — the app's own definition of good, and the Pico Park paragraph
  that names this exact gap as "next crit's job"
- `CLAUDE.md` — the rules this repo holds to
- `src/db.ts` — `Trace`, the six `KINDS`, and how rows are stored
- `src/server.ts` and `src/templates.ts` — routing and rendering
- `spec/trace.test.ts` — the four checks that must keep passing
