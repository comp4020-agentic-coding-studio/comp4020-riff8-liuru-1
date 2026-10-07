# This repo is a pod riff: pods write the prompt, the agent does the work

This repo is a copy of [`comp4020-final-liuru`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-liuru) at
`a7a25926` --- liuru's crit agent's final project as it stood at
`08-its-alive`. Their repo is untouched and off limits. From here to the end of
semester, each crit a pod picks this repo up from wherever the last run left
it.

**Pods: the only file you change is `prompt.md`, at the repo root.** Read the
live app, the code and the history, then write the prompt that would take
this app to a strong, interesting answer to the next brief (the crit runsheet
links it). The prompt can point at any file here. After the session,
liuru's crit agent runs `prompt.md` once, unattended, start to finish, and
nobody is there to answer its questions --- so say what you want, what good
looks like and what to leave alone. Push it before you leave.

**Crit agent: when `prompt.md` exists, it is your brief.** Run it to
completion in one go, keep `main` deployable, and delete `prompt.md` in your
last commit. Leave this block of `CLAUDE.md` as it is.

**Nothing here is marked.** No cutoff, no reflection, no `PROCESS.md` entry.
The next crit opens by looking at where each pod repo ended up, beside the
prompt that got it there (the `prompt-crit<N>` tag).

**The agent's own spec tests are `spec/trace.test.ts`.** They encode the brief it was
working to, and they gate the deploy. A prompt aimed at a different brief can
have them changed or deleted; keep `spec/invariants.test.ts` green, since that
one is true of any good site.

Everything below this line was written for the agent's graded submission. Its
marks, cutoff and weekly skills don't govern this repo: read it for how the
agent was directed, not for what anyone owes.

---

# Your harness

These are the rules for this app specifically, derived from the argument in
`README.md`. General workflow, memory and doctrine live outside this repo;
this file is the project's own constraints.

## What this app is

A small shared wall (六如): visitors leave a short passing thought tagged as
one of six similes from the Diamond Sūtra's closing line (dream, illusion,
bubble, shadow, dew, lightning). No accounts — a persistent cookie is the
only identity, and it exists so a returning visitor can find their own trace,
not to build a profile of them.

## Rules that follow from "good means small and quiet"

- No accounts, no login, no visible follower/reader counts, no algorithmic
  ranking of the wall. The list is plain reverse-chronological, always.
- No feature that exists to bring someone back (streaks, notifications,
  unread badges). The wall doesn't chase anyone.
- A trace is permanent once posted: no edit, no delete, no admin override.
  If that becomes a real problem, it needs a README argument first, not a
  quiet code change.
- Keep the six kinds fixed. Don't add a seventh "custom" tag — the constraint
  is the point, not a limitation to work around.
- No moderation or rate limiting yet. Named explicitly in README as a real
  gap, not a decision to leave unmade forever — revisit if the wall is ever
  exposed somewhere a stranger could actually find it and spam it.

## Enforced vs. judged

`spec/*.test.ts` is the enforced list: valid kind, non-empty text, a 240
character cap, live delivery over `/events` (`spec/live.test.ts`), and the
two course-wide checks (`/` answers, `/readme/`
publishes `README.md`). Everything else — whether the wall still feels like
the six similes rather than a generic guestbook — is a judgement call, made
here and revisited each crit, not something a test can catch.

## Stack notes for future runs

Plain Node (`node:http`, no framework) plus `better-sqlite3` on the Fly
volume at `/data`. No build step: the server runs its `.ts` source directly,
so the Docker image only needs `node`, not a bundler. Keep it this small
unless a real feature needs more. Live updates are server-sent events from an
in-memory listener set (`src/live.ts`), which assumes one machine; the
browser script (`src/client.js`) is progressive enhancement over plain forms.
