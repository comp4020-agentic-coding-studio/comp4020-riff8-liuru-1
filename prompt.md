# Next: six ways of passing — who may see it, who may end it, and logs that say who did

## Where this repo stands

Last week's run made the 六如 wall live: traces and answers reach every open
page within a second over SSE, six filters, one-level answers, optional sound.
All five items landed. Read `git log riff-start..HEAD` and the README to see
how and why.

This run aims at the next brief, C10 "Fly by instruments":
https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/crits/10-fly-by-instruments/

C10 asks three things of a multi-user app:

1. Two people, each in their own browser (separate Chrome profiles or an
   incognito window, sharing no cookies), use it from the URL alone, and the
   app tells them apart.
2. **What each person may see and change is checked on the server**, and that
   decision is written down in the repo with why. The brief says what counts
   as a person, and what each may see and change, is the app's call.
3. **The server logs who did what**, well enough that someone who never
   touches the app can tail `flyctl logs` and narrate what two people did. The
   logging outlives the crit: it's what the next person, or agent, reads when
   the deployed app misbehaves.

Today the app does (1) quietly: a persistent `visitor` cookie, and your own
traces are marked yours. It barely does (2): nothing can be changed by anyone,
so there is no rule to check. It does not do (3) at all: `src/server.ts` logs
`listening on` and uncaught errors, nothing else. The README already admits
both gaps.

## The idea: the kind you pick is the rule your words live under

Right now the six similes are a label. Dream, illusion, bubble, shadow, dew
and lightning all behave identically; the kind only changes a glyph, a filter
and a sound. The README says the theme "isn't decoration bolted onto a
generic guestbook", but in the code it is.

C10 hands this app exactly the question it needs: **who may see a thing, and
who may end it.** Answer it six ways. Each simile becomes a different rule of
seeing and ending, enforced by the server, so choosing what your thought is
*like* chooses how it lives among other people:

| Simile | Rule | What it shows about the multi-user decision |
|---|---|---|
| 泡 bubble | Anyone **except** its writer may pop it, once. First pop wins. | Someone else may end your words, because you chose a bubble. |
| 露 dew | Evaporates by itself 12 hours after it is left. Nobody needs to end it. | Time, not a person, decides. |
| 梦 dream | Anyone may answer a dream, but each answer is seen **only by the dreamer and the person who answered**. | Seeing is per pair, not per wall. |
| 影 shadow | Visible to others **only while its writer is here** (has the page open). | Seeing depends on the writer's presence. |
| 幻 illusion | Every viewer sees a **different partial version**; only its writer sees it whole. | Seeing depends on who is looking. |
| 电 lightning | Seen **only by the pages open at the moment it strikes**, for about 15 seconds. Afterwards only a scorch mark remains: when, not what. | Seeing depends on the viewer's presence. |

On top of the six, two rules hold for every kind:

- **A writer may always let go (放下) of their own trace or answer**, whatever
  its kind, and nobody else may. It leaves the wall for everyone, live.
- **The writer of a trace may set aside (移开) an answer someone else left
  under it.** The README already names this gap: an unkind answer under your
  thought currently can't be removed by you or anyone.

This is a big change to what the app is, and it's meant to be. It is still
anonymous, still small, still live, still the six similes, still no names,
accounts, counts, ranking or notifications. What changes is that "everything
here is passing" stops being a sentence in the README and becomes six
behaviours a visitor can feel, and that the server can be shown to enforce.

### Non-negotiable for every rule

- **Withheld means never sent.** If a viewer may not see something, it is not
  in the HTML, not in an attribute, not in an SSE payload, not in a reconnect
  replay, not in a script variable. Hiding with CSS or client-side checks does
  not count. `src/live.ts` already renders each event per listener's visitor;
  build on that.
- **Identity comes from the cookie only.** Never trust a visitor id, owner,
  or handle sent in a form field or query string.
- **Every refusal is real.** A hand-crafted POST from another cookie must be
  refused, change nothing, broadcast nothing, and log a `refused` line. "The
  button isn't shown" is not a permission check. C10's failure is "one of them
  can change what should be the other's"; make it impossible, not hidden.
- **Races resolve to one answer for everyone.** Two pops of one bubble: one
  wins. An answer racing a let-go: the answer is dropped, never attached to
  something nobody can see. Use SQLite transactions or conditional updates.
- **Nothing is wiped.** Additive, repeatable migrations only (`ALTER TABLE ...
  ADD COLUMN` guarded by a schema check, new tables with `IF NOT EXISTS`).
  Never drop tables, never delete `/data`. Where a rule says text is erased,
  erase that field on that row deliberately, and say so in the README.
- **Put the six rules in one pure module** (say `src/rules.ts`) that takes the
  trace, the viewer and an explicit `now` and decides what that viewer sees.
  No database import, so a spec can import it directly and test time-based
  rules without waiting twelve hours. Rendering, the SSE fan-out and replay all
  ask this module; no rule is re-implemented in a second place.

## How to work: a branch per item, merge only what passes

Last week's branch-per-item rule worked; keep it.

- Build each numbered item (and each simile in item 3) on its own branch. Run
  `pnpm check` there with the app running locally. Merge to `main` only when
  it passes, and push `main` straight after each merge. CI deploys every push
  to `main`, so a broken merge breaks the live app.
- The run is unattended and can be cut short at any time. Whatever is merged
  and pushed is what the next pod inherits. Four items landed beats seven
  half-built. If an item can't be made to work, leave its branch unmerged,
  note it, and move on.
- Use the time budget the run has. Build, test with several visitors, then
  refine. Don't stop at a plan.
- **Never post test data to the live app** at
  https://comp4020-riff8-liuru-1.fly.dev/. Test against a local server with a
  throwaway `DATA_DIR`.
- Keep `prompt.md` until the end; delete it in your last commit, as the riff
  block at the top of `CLAUDE.md` says. Leave that block exactly as it is.
- Don't touch `PROCESS.md`, `reflections/`, `agent/`, `fly.toml`'s machine
  settings, CI secrets, or any course tag. `pnpm check:evidence` must still
  pass on the inherited files.

## The items, in priority order

### 1. Logs that say who did what (must land first)

Every meaningful thing a person does, and every thing the server refuses,
becomes **one line on stdout**. Fly captures stdout; that is the whole
pipeline. No log service, no log file, no dependency unless it truly earns its
place.

**Who.** A person in the logs is a short, stable handle derived from their
visitor id, such as the first 6 hex characters of its SHA-256. Same browser,
same handle, across requests, reloads and restarts. **Never write the raw
visitor id to the logs:** the cookie is this app's only credential, so anyone
who reads a raw id can become that person.

**What.** A small fixed vocabulary, each line starting with the event name so
a person scanning the tail can read it. Names and fields are yours; cover this
ground, and extend it as items land:

```
boot               port=8080 traces=57 replies=12 dew_evaporated_at_boot=3
visitor.new        v=3fa9c1
wall.view          v=3fa9c1 view=all shown=48 withheld=6
trace.left         v=3fa9c1 trace=58 kind=bubble chars=31
trace.dropped      v=9b20e4 reason=unknown-kind
reply.left         v=9b20e4 reply=13 trace=58 trace_by=3fa9c1 seen_by=all
reply.left         v=9b20e4 reply=14 trace=61 trace_by=3fa9c1 seen_by=pair
bubble.popped      v=9b20e4 trace=58 trace_by=3fa9c1
let_go             v=3fa9c1 trace=60
set_aside          v=3fa9c1 reply=13 reply_by=9b20e4 trace=58
dew.evaporated     trace=40 trace_by=77c2d0 age=12h
presence.here      v=3fa9c1 shadows_shown=2
presence.gone      v=3fa9c1 shadows_withheld=2
lightning.struck   v=9b20e4 trace=62 witnesses=1
lightning.scorched trace=62
stream.open        v=9b20e4 replayed=4 open=2
stream.close       v=9b20e4 after=41s open=1
refused            v=9b20e4 action=let_go target=trace:60 owner=3fa9c1 reason=not-yours
refused            v=3fa9c1 action=pop target=trace:58 reason=own-bubble
refused            v=c4e811 action=pop target=trace:58 reason=already-popped
refused            v=9b20e4 action=post reason=rate
error              v=3fa9c1 route="POST /reply" message="..."
```

What that buys the narrator: `trace_by=`, `owner=` and `reply_by=` show one
person acting on another person's thing, which is the moment worth pointing
at. `shown=` / `withheld=` make the per-viewer rules visible from outside.
`boot` with row counts shows that what people did survived a restart (Fly
stops the machine when idle, so restarts happen constantly).

Rules for the lines:

- **No visitor-written text in the logs, ever.** It is public (or deliberately
  withheld) on the wall and can be looked up by id. Logging it invites log
  injection, copies people's words somewhere they didn't put them, and would
  leak dream answers, illusions and lightning that the rules withhold. Log ids,
  kinds, lengths, handles and reasons.
- Any value that could contain input must be escaped or quoted so one action
  is always exactly one line.
- No noise: no line per keepalive, script fetch or asset. A two-person
  five-minute session should produce a tail a person can read in one screen.
- Counts of open streams and witnesses are fine **in the logs**. `CLAUDE.md`
  forbids visible reader counts on the page, and that still stands.
- The 500 path logs the route and the handle, so a crash says whose request
  hit it. A malformed cookie (bad percent-encoding currently throws in
  `parseCookies`) must not crash a request: treat it as a new visitor and log
  it.

One small module (say `src/log.ts`) formats every line. Unit-test it directly:
the handle is stable and never equals the raw id, and input containing `\n`
cannot produce two lines.

### 2. Let go of your own words, and only your own (must land)

A writer may let go (放下) of a trace or answer they wrote. It disappears for
everyone within a second. Letting go of a trace takes its answers with it.

This deliberately reverses a rule. `CLAUDE.md` says "A trace or an answer is
permanent once posted: no edit, no delete, no admin override", and that such a
change "needs a README argument first, not a quiet code change". So: **write
the README argument first, then change the rule in the lower part of
`CLAUDE.md`, then build it.** Still no editing and no admin.

This item also lays the plumbing every later item needs, so get it right here:

- **A removal channel that survives reconnects.** The stream cursor is
  `<trace>.<reply>`, which only moves forward with new rows. A let-go changes
  an old row, so a page whose stream was down would keep showing it. Consider
  replacing the cursor with one sequence over a `wall_events` table (left,
  answered, let go, popped, set aside, evaporated, scorched), so reconnect
  replays every change after the cursor, each filtered for that viewer by
  `src/rules.ts`. If exact replay gets complicated, sending a reconnecting page
  a fresh snapshot of its own view is acceptable: correctness beats
  cleverness.
- `addReply` currently inserts whenever the trace row exists; it must also
  refuse a trace that is let go, popped, evaporated, scorched or withheld from
  that answerer.
- Decide whether a let-go row keeps its text with a `released_at` marker or
  has its text erased, and describe it honestly in the README. Don't call it
  erased if it isn't.
- A deliberate act, not an accidental tap: a confirm step, no nagging modal.
  Works without JavaScript as a plain form POST, like posting does today.
- Harden the write path now that things can be destroyed: same-origin check on
  every POST (`Origin` header), `Secure` on the cookie (Fly forces HTTPS), and
  a size cap on request bodies (`readBody` currently reads without limit).
  Refusals are logged.

Spec, in a new file, with separate cookies as separate people: A lets go of
A's trace and three other open streams each see it removed within a second;
B's attempt on A's trace or answer is refused and changes nothing; an answer to
a let-go trace is dropped; a stream reconnecting with a `Last-Event-ID` from
before the let-go doesn't get it back.

### 3. Six similes, six rules (the heart of this run)

One branch per simile, in this order, merging each that passes. Each needs:
the rule enforced in `src/rules.ts` and on every write route it touches; live
behaviour on every open page; correct reconnect replay; its log lines; spec
checks with separate visitors; and a one-line explanation shown **at the
moment a visitor picks that kind** in the form, so the rule is never a
surprise. Keep the existing glyphs, filters and sounds.

**3a. 泡 Bubble: anyone but its writer may pop it.**
A bubble is the one thing on the wall that someone else may end. Any other
visitor may pop it, once; it disappears for everyone, answers with it, and an
empty ring stays in its place so the wall shows something passed there. The
writer cannot pop their own (they can let go instead), which keeps the two
acts distinct in the logs. Two visitors popping at the same instant: exactly
one succeeds; the other is told "already popped" and logged as refused. Spec
the race with simultaneous requests.

**3b. 露 Dew: evaporates after 12 hours.**
Dew fades as it ages (lighter ink over its life, computed from `createdAt`
and `now`) and leaves the wall 12 hours after it is left, live on every open
page, logged as `dew.evaporated`. A periodic sweep handles it while the server
is up; on boot, reconcile anything that expired while the machine was stopped,
once, without duplicate broadcasts. Test the timing through `src/rules.ts`
with an explicit `now`. Note: `spec/trace.test.ts` posts dew and expects it on
a fresh load at full text; keep that true, since that file must not change.

**3c. 梦 Dream: answers are seen only by the dreamer and the answerer.**
Anyone may answer a dream. Each answer is visible to exactly two people: the
person who wrote it and the person who dreamt the trace. The dreamer sees all
the answers under their dream; each answerer sees only their own; everyone
else sees the dream and none of its answers, and no count or hint of how many.
Withheld means never sent: three-visitor spec where C's page and C's stream
never contain B's answer to A's dream, while A and B both get it live. The
dreamer may set aside answers like any other trace writer (item 4).

**3d. 影 Shadow: seen by others only while its writer is here.**
"Here" means the writer has at least one open `/events` stream, with a grace
period of about 20 seconds after their last stream closes so a reload doesn't
flicker. When a writer leaves, their shadows are withdrawn from every other
open page and from fresh loads; when they return, the shadows come back. The
writer always sees their own, marked as visible only while they're here.
Presence is in memory (one machine), so after a restart nobody is "here" until
their page reconnects; say so. A visitor without JavaScript has no stream, so
their shadows are seen only by themselves: an honest limitation to state, not
a bug to hide. This reveals that an anonymous someone is present without
counting anyone, which `CLAUDE.md` asks for ("let the wall moving be the
signal"); argue that in the README.

**3e. 幻 Illusion: each viewer sees a different version.**
Only the writer sees an illusion whole. Every other viewer sees a version with
roughly a third of its words withheld, the selection chosen deterministically
from that viewer's handle and the trace id, so the same person sees the same
illusion every time and two people comparing screens see different ones.
Segment words with `Intl.Segmenter` so Chinese text (no spaces) works as well
as English. The full text never leaves the server for a non-writer. Withheld
words render as a quiet mark with a screen-reader label, not as a blur over
real text. Spec: two visitors get different renderings of a long enough
illusion, neither contains the full text, the writer's does, and the same
visitor gets the same rendering twice.

**3f. 电 Lightning: seen only by those present when it strikes.**
A lightning trace goes out live to every open page and shows for about 15
seconds, then fades to a scorch mark: a small burnt sign with its time and no
text. A fresh page load never shows lightning text, even a second after it
strikes, and that includes its writer. A stream that reconnects inside the
15-second window gets it; after that, only the scorch. After the window the
text is erased from the row, so "only the people who were there saw it" is
literally true; the scorch persists across restarts. Log the strike with the
number of witnesses (open streams of other visitors), never the text. Gentle
treatment: no full-screen flash, no strobing, a still change under
`prefers-reduced-motion`. Note `spec/live.test.ts` already uses lightning for
its "reaches three other open sessions within a second" check; that should
keep passing, because those sessions are open when it strikes.

### 4. The writer of a trace may set aside answers under it

A trace's writer may set aside (移开) any answer under their own trace. That
makes three positions relative to any answer, all checked on the server: the
answer's writer (may let go), the trace's writer (may set aside), everyone
else (may do neither). A set-aside answer disappears for everyone, including
its writer: no shadow-hiding where they still see it and think it's there,
because that would be the app lying to someone. Log it with both handles.
Spec all three positions, including the refusal.

### 5. Make the rules legible on the page

A newcomer should understand within 30 seconds that the kind they pick
decides how their words will live. Rewrite the short explanation above the
form (it currently says what the six as-ifs *are*) to say what each one
*does*, in the page's own quiet voice, bilingual where the page already is.
The right controls appear on the right items only (let go on yours, pop on
others' bubbles, set aside under your traces), with plain labels beside the
poetic ones, 44px touch targets and visible focus.

At the very bottom of the page, add one line visible **only to that browser**:
"this browser appears in the logs as 3fa9c1". At the crit, two classmates use
the app while someone reads the logs; this line bridges the two. It is not a
name: nobody else sees it, it never appears next to a trace, it is not the
cookie. Argue in the README why that doesn't break "no names, no visible
distinction between visitors".

Check the page at 1440x900 and 390x844 with no horizontal page overflow.

### 6. Rate limiting, refused and logged

The README names rate limiting as a real gap, and with things that can be
popped and answered privately, a spammer now matters more. Per visitor
handle, cap traces and answers over a rolling window (for example 6 traces
and 20 answers per 10 minutes). Over the limit, the post is refused with a
quiet message on the page and a `refused ... reason=rate` log line. An
in-memory limiter is fine on one machine; say that it resets on restart, and
that a person can evade it by clearing cookies.

## Existing specs: what to keep, what to change

- `spec/invariants.test.ts` and `spec/trace.test.ts`: **unchanged and green.**
  `trace.test.ts` uses dew; design dew so it holds (see 3b).
- `spec/live.test.ts`, `spec/replies.test.ts`, `spec/wall.test.ts` encode "all
  six kinds behave the same". Some checks will now be wrong on purpose (a
  shadow posted by an absent writer doesn't reach others; lightning isn't on a
  fresh load; filters can't "add up" when some kinds are withheld). Change
  them deliberately, not by deleting their intent: live delivery, reconnect
  replay, simultaneous answers, filters and "yours" marking are all still
  promises, so re-express each using a kind whose rule permits it. List what
  changed and why in the README's enforced-vs-judged section.
- Add checks for everything new, **and break each one on purpose to watch it
  fail before trusting it.**

## The decision to write down

C10 wants "what each person may see and change" decided, checked on the
server, and written in the repo with why.

**`README.md`** becomes the argument for six ways of passing. Keep the voice,
the sources (Sloan, the Small Technology Foundation, Pico Park) and the
"small and quiet" thesis, and rewrite around the change:

- why a label became a rule, and why that is the theme finally doing work;
- what counts as a person here (one browser's cookie), and what each person
  may see and do, per kind, to their own words, to answers under their own
  trace, and to everyone else's;
- why "permanent once posted" is gone and what replaced it;
- the honest costs: clear your cookies, or switch browser or device, and you
  are a stranger to your own past traces (no account means no recovery); two
  people on one browser are one person, one person on two devices is two; a
  bubble means a stranger may end your words; dew loses things people liked;
  lightning is unrecoverable by design; illusions frustrate on purpose;
  shadows vanish for no-JS writers; moderation is still only by the people
  involved, with no one to report to;
- **"Reading the logs"**: what each event name means, and a **real** excerpt
  from a local session you ran with two or three separate visitors (not
  invented), so the next reader can narrate from `flyctl logs` without the
  source;
- what is enforced in `spec/` and what is judged, updated for this run.

Don't leave a README describing a different app from the one running.

**`docs/decisions/0002-who-may-see-and-change.md`**, an ADR in the shape of
0001: context, alternatives, the choice, the costs. Compare at least:
everything permanent and visible to all (the status quo); writers may let go
of their own words and nothing else; one uniform rule for all kinds versus a
rule per kind (the choice); and a moderator or admin role (why not, for a
wall with no accounts). Include why the per-viewer rules (dream, illusion,
lightning, shadow) are enforced by never sending, and what that costs in
rendering every event per listener.

**The lower, app-specific part of `CLAUDE.md`** is rewritten to match: the six
rules and the two universal ones, "withheld means never sent", "identity from
the cookie only", "never log raw visitor ids or visitor text", one action one
log line, rules live only in `src/rules.ts`, and the updated enforced list.
These are standing rules for the next run, so write them as rules.

## What good looks like at the end

- **A real crowd session, run by you, locally.** Two or three independent
  browser contexts (separate cookie jars, not tabs sharing one) and a terminal
  showing the server's stdout. One leaves a bubble, another pops it; one
  answers a dream and a third can't see the answer; a shadow's writer closes
  their page and the shadow leaves the others'; two viewers see different
  illusions; a lightning strike reaches the open pages and is a scorch on a
  fresh load; someone tries to let go of another person's trace and is
  refused. Reading only the terminal, you can say who did each thing and what
  was refused. Use that run's output for the README excerpt. If a browser
  automation tool is available, drive real browsers and take screenshots at
  1440x900 and 390x844; if not, drive it with `fetch` and separate cookie
  jars, and say which you did.
- Nobody can see what a rule withholds from them, or change what is someone
  else's, by any request, not just through the UI.
- Nothing in the logs could be used to become someone else; no visitor text
  appears in them; one action is one line.
- `pnpm check` is green against the running app; `pnpm check:evidence` passes.
- If Docker is available, build and run the real image and run the spec
  against it, as CI does. If it isn't, say so; don't claim it ran.
- Everything that should persist survives a restart on the same data
  directory, and timed rules (dew, lightning scorch) reconcile once on boot.

## Still off the table

No accounts, logins, names, colours or avatars on traces. No visible counts
of readers, answers, pops or witnesses. No ranking, no notifications, no
"since your last visit", no unread markers. No admin, no moderation queue, no
report button. No seventh kind. No editing. No full-screen effects or
autoplaying sound. Don't migrate the stack, add a framework or build step, add
a second machine or database, or touch `fly.toml`'s machine settings.

## Final report

When you stop, say briefly: which items landed on `main`, which branches were
left unmerged and why, which tests and playtests actually ran (and which
couldn't), and the limitations a visitor would hit. The course harness pushes
and CI deploys after you finish; don't claim the live site was checked.

## Read first

- `README.md`: the argument this app holds to, and the gaps it already names
- `CLAUDE.md`: the riff block (leave it alone) and the app's rules below it
- `src/server.ts`: routes, the visitor cookie, `parseCookies`, `readBody`, the
  one place errors are logged
- `src/db.ts`: `Trace`, `Reply`, `addReply`'s exists-check, the `*Since`
  queries
- `src/live.ts`: the SSE fan-out, per-listener rendering, the cursor
- `src/templates.ts` and `src/client.js`: how traces render and how live
  events are applied to the page
- `spec/sse.ts` and `spec/live.test.ts`: how specs act as several visitors
- `docs/decisions/0001-plain-node-and-sqlite.md`: the ADR shape to follow
