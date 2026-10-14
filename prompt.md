# Next: tell people apart, let a thought be let go, and make the logs say who did what

## Where this repo stands, and where it's going

Last week's run made the 六如 wall live: traces and answers reach every open
page within a second over SSE, six filters, one-level answers, optional sound.
All five items landed. Read the history from `riff-start` to `HEAD` to see how.

This run aims at the next brief, C10 "Fly by instruments":
https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/crits/10-fly-by-instruments/

C10 asks three things of a multi-user app:

1. Two people, each in their own browser (separate Chrome profiles or an
   incognito window, sharing no cookies), use it from the URL alone, and the
   app tells them apart.
2. What each person may see and change is **checked on the server**, and that
   decision is written down in the repo with why.
3. The server **logs who did what**, well enough that someone who never
   touches the app can tail `flyctl logs` and narrate what the two people did.
   The logging outlives the crit: it's what the next person (or agent) reads
   when the deployed app misbehaves.

Today the app does (1) quietly: a persistent `visitor` cookie, and your own
traces are marked yours. It barely does (2): nobody can change anything, so
there is no rule to check. It does not do (3) at all: `src/server.ts` logs
`listening on` and uncaught errors, nothing else. The README already admits
both gaps ("no server-side logging", "no moderation", "an unkind answer under
your thought can't be removed by you or anyone else").

The interesting answer is not an account system bolted on. It's this:
**stay anonymous, give each person power over their own words and nobody
else's, enforce that on the server, and make every action and every refusal
legible in the logs without the logs becoming a way to identify or
impersonate anyone.**

## How to work: a branch per item, merge only what passes

Last week's branch-per-item rule worked; keep it.

- Build each numbered item on its own branch. Run `pnpm check` there. Merge to
  `main` only when it passes, and push `main` straight after each merge. CI
  deploys every push to `main`, so a broken merge breaks the live app.
- The run is unattended and can be cut short. Whatever is merged and pushed
  is what the next pod inherits. Three items landed beats five half-built.
- If an item can't be made to work, leave its branch unmerged and move on.
- Never post test data to the live app at https://comp4020-riff8-liuru-1.fly.dev/.
  Test against a local server with a throwaway `DATA_DIR`.
- Keep `prompt.md` until the end. Delete it in your last commit, as the riff
  block at the top of `CLAUDE.md` says. Leave that block exactly as it is.
- Don't touch `PROCESS.md`, `reflections/`, `agent/` or any course tag.
  `pnpm check:evidence` must still pass on the inherited files.

## The items, in priority order

### 1. Logs that say who did what (must land)

Every meaningful thing a person does, and every thing the server refuses to
let them do, becomes **one line on stdout**. Fly captures stdout; that's the
whole pipeline. No log service, no file, no dependency unless it truly earns
its place.

**Who.** A person in the logs is a short, stable handle derived from their
visitor id: for example the first 6 hex characters of a SHA-256 of it. Same
browser, same handle, across requests, reloads and restarts. **Never write the
raw visitor id to the logs:** the cookie is the only credential this app has,
so anyone who can read a raw id can become that person. The handle must not be
reversible into the cookie.

**What.** A small fixed vocabulary of events, each line starting with the
event name so a human scanning the tail can read it. Something like this
(names and exact fields are yours, but cover this ground):

```
boot              port=8080 traces=57 replies=12 image=<FLY_IMAGE_REF if set>
visitor.new       v=3fa9c1
wall.view         v=3fa9c1 view=all
wall.view         v=9b20e4 view=dream
trace.left        v=3fa9c1 trace=58 kind=dream chars=31
trace.dropped     v=9b20e4 reason=unknown-kind
reply.left        v=9b20e4 reply=13 trace=58 trace_by=3fa9c1
reply.dropped     v=9b20e4 trace=999 reason=no-such-trace
stream.open       v=9b20e4 replayed=2 open=2
stream.close      v=9b20e4 after=41s open=1
refused           v=9b20e4 action=let-go target=trace:58 owner=3fa9c1 reason=not-yours
error             v=3fa9c1 route="POST /reply" message="..."
```

Notice what that buys: `trace_by=` and `owner=` show one person acting on
another person's thing, which is exactly the moment the narrator needs to
point at. `boot` with row counts shows that what people did survived a machine
restart (Fly stops the machine when idle, so this happens all the time).

Rules for the lines:

- **No visitor-written text in the logs.** Trace and answer text is already
  public on the wall and can be looked up by id. Putting it in the logs invites
  log injection (a newline in a trace forging a fake log line) and copies
  people's words somewhere they didn't put them. Log ids, kinds, lengths and
  reasons. Any value that could ever contain user input must be escaped or
  quoted so one action is always exactly one line.
- Don't log noise: no line per keepalive, per script fetch, or per static
  asset. A two-person five-minute session should produce a tail a person can
  read in one screen.
- Counts of open streams are fine **in the logs**; `CLAUDE.md` forbids visible
  reader counts on the page, and that still stands.
- The existing 500 path logs with the route and the handle, so a crash says
  whose request hit it.

Put the formatting in one small module (say `src/log.ts`) so every route logs
the same way. A unit test that imports it directly is welcome: the handle is
stable, never equals the raw id, and an input containing `\n` can't produce
two lines.

### 2. Let go of your own words, and only your own (must land)

Give each person one power: they can **let go** (放下) of a trace or an answer
**they wrote**. It disappears from the wall for everyone, live, within a
second. That fits the six similes better than "delete" does: everything on
this wall was already passing; now its writer can let it pass.

This deliberately changes a rule. `CLAUDE.md` says "A trace or an answer is
permanent once posted: no edit, no delete, no admin override", and says a
change to it "needs a README argument first, not a quiet code change". So:
**write the README argument first, then change the rule in the lower part of
`CLAUDE.md`, then build it.** Still no editing, still no admin, still no
accounts.

What must hold, all of it enforced on the server:

- **Ownership is checked on the server, not by hiding a button.** The control
  only appears on your own items, but that is decoration. A hand-crafted POST
  from another visitor's cookie for someone else's trace must be refused,
  change nothing, and log a `refused` line naming both handles. This is the
  thing C10 tests: "one of them can change what should be the other's" is the
  failure.
- Letting go of a trace takes its answers off the wall with it.
- **Races resolve cleanly.** If A lets go of trace 58 while B is answering it,
  B's answer is dropped (and logged as dropped, reason the trace was let go),
  never attached to a trace nobody can see. `addReply` currently inserts
  whenever the trace row exists; that check must also respect let-go.
- **Live and reconnecting pages agree.** Every open page removes the item
  within a second. A page whose stream was down when the let-go happened must
  not keep showing it after it reconnects. Today the stream cursor is
  `<trace>.<reply>`, which only moves forward with new rows; a let-go changes
  an old row, so the catch-up needs something more (a release sequence in the
  cursor, or another mechanism you can justify). Filtered views follow the
  same rule.
- **It persists.** After a restart or redeploy, what was let go stays gone and
  everything else stays. Decide whether the row is kept with a `released_at`
  marker or its text is also erased, and say which in the README honestly:
  don't call it "erased" if the text is still in the database.
- A deliberate act, not an accidental tap: some confirm step, without a nagging
  modal. Works without JavaScript as a plain form POST, like posting does
  today; the script only improves it.
- Check the origin of these POSTs (same-origin `Origin` header), since this is
  the first action that destroys something. Consider adding `Secure` to the
  cookie, since Fly forces HTTPS.

Spec, in a new `spec/` file, using separate cookies as separate people:

- A lets go of A's trace: gone from `/` and from every filter, and three other
  open streams each receive the removal within a second.
- B tries to let go of A's trace or answer: refused, the item is still on the
  wall for everyone, nothing broadcast.
- An answer posted to a trace that was already let go is dropped.
- A stream that reconnects with a `Last-Event-ID` from before the let-go does
  not get the trace back.
- Break each check on purpose and watch it fail before trusting it.

### 3. The person whose thought it is decides what stays under it

The README names this gap: an unkind answer under your trace can't be removed.
Give a trace's writer one more power: they can **set aside** an answer someone
else left **under their own trace**. Nobody else can, and the answer's writer
can still let go of it themselves (item 2).

That makes three positions relative to any answer, and the server checks all
three: the answer's writer (can let go), the writer of the trace it hangs
under (can set it aside), and everyone else (can do neither). Log it as its
own event with both handles (`reply.set_aside v=3fa9c1 reply=13 reply_by=9b20e4`).
A set-aside answer disappears for everyone, including the person who wrote it.
No shadow-hiding where they still see it and think it's there; that would be
the app lying to someone.

Add spec checks for all three positions, including the refusal.

### 4. Each browser can see its own handle, and only its own (if there's time)

At the crit, two classmates use the app while someone reads the logs. A small,
quiet line at the bottom of the page, visible **only to that browser**,
showing the same handle the logs use ("this browser appears in the logs as
3fa9c1") bridges the two. It is not a name: nobody else ever sees it, it never
appears next to a trace, and it's not the cookie. If you build it, argue in
the README why it doesn't break "no names, no visible distinction between
visitors". If you think it does break that argument, don't build it, and say
why in the README instead. Either answer is fine; an unargued one isn't.

## The decision to write down

C10 wants "what each person may see and change" decided, checked on the
server, and written in the repo with why. Write it in two places:

- **`README.md`, a new section** on who can change what: what counts as a
  person here (a browser's cookie), what each person may do to their own
  words, to answers under their own trace, and to everyone else's; and why.
  Also the honest costs:
  - Clear your cookies, or switch browser or device, and you are a stranger to
    your own past traces: you can no longer let them go. No account means no
    recovery, and that's the price of no accounts.
  - Two people sharing one browser are one person to this app; one person on a
    phone and a laptop is two.
  - Moderation is still only by the people involved; there is no one to report
    to. Rate limiting is still absent.
- **`docs/decisions/0002-who-may-change-what.md`**, an ADR in the shape of
  0001: context, the alternatives, the choice, what it costs. Compare at least:
  everything permanent for everyone (the status quo); writers can let go of
  their own words only; writers plus thread owners (the choice, if item 3
  lands); and some admin or moderator role (why not, for a wall with no
  accounts).

Also add a short **"Reading the logs"** section to the README: what each event
name means, and a real excerpt from a local two-visitor session you ran (not
invented), so the next reader can narrate from `flyctl logs` without reading
the source.

Keep the README coherent as one argument. It currently says "small and quiet
rather than sticky", "no names", and "permanent once posted". After this run
the last one is no longer true. Say what changed and why it is still the same
app; don't leave a README describing a different app from the one running.
Update the lower, app-specific part of `CLAUDE.md` to match, including the
enforced-vs-judged list.

## What good looks like at the end

- Two independent browser contexts (separate cookie jars, not two tabs) and a
  terminal showing the server's stdout. One posts, the other answers, one
  tries to let go of the other's trace and is refused, the owner lets it go.
  Reading only the terminal, you can say who did each thing and what was
  refused. Do this run for real against a local server and use its output for
  the README excerpt.
- Neither person can change what is the other's, by any request, not just
  through the UI.
- Nothing in the logs could be used to become someone else; no visitor text
  appears in them; one action is one line.
- `pnpm check` is green. `spec/invariants.test.ts` and `spec/trace.test.ts` are
  unchanged and passing. The existing live, replies and wall specs still pass,
  or are changed only where this run deliberately changed the behaviour they
  encode, and that change is explained in the README.
- If Docker is available, build and run the real image and run the spec
  against it, as CI does. If it isn't, say so; don't claim it ran.
- Traces survive a restart. Don't wipe `/data` or delete rows to make anything
  work.

## Read first

- `README.md`: the argument this app holds to, and the gaps it already names
- `CLAUDE.md`: the riff block (leave it alone) and the app's rules below it
- `src/server.ts`: routes, the visitor cookie, the one place errors are logged
- `src/db.ts`: `Trace`, `Reply`, `addReply`'s exists-check, the `*Since` queries
- `src/live.ts`: the SSE fan-out and the `<trace>.<reply>` cursor
- `src/client.js`: how live events are applied to the page
- `spec/sse.ts` and `spec/live.test.ts`: how specs act as several visitors
- `docs/decisions/0001-plain-node-and-sqlite.md`: the ADR shape to follow
