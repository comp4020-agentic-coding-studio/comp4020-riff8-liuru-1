# Paper Planes — six colours, one shared sky

This is a student recreation of [Paper Planes](https://paperplanes.world/),
the 2016 Google I/O piece by Active Theory, in which people around the world
fold a message into a plane, throw it, catch a stranger's, stamp it with
where they are and throw it on. It's made for COMP4020 at the ANU and isn't
affiliated with Google or Active Theory.

It keeps the original's scene and loop: a pastel, slowly turning low-poly
globe, planes circling it, a sheet that folds into a plane and flies off,
catching one from the sky, unfolding it to read, stamping it, throwing it on.
It changes four things on purpose:

1. **Six colours of paper** — Coral, Orange, Yellow, Mint, Blue and Lavender
   — instead of the original's white paper.
2. **The whole thing works on a laptop.** The original's desktop page shows
   the globe and asks you to join on a phone; here a mouse, a keyboard or a
   touchscreen can each do everything.
3. **You choose the place on your stamp.** The original stamps a plane with
   your physical location. Here it's a country or region (and, if you like, a
   city) you pick from a list, and it doesn't have to be where you are.
   Nothing asks for your location.
4. **You write a message on the plane**, up to 240 characters, and whoever
   catches it reads exactly what you wrote, on the paper itself.

## From six similes to six colours

This repo used to be 六如, a wall where a passing thought was tagged as one
of the six similes from the Diamond Sūtra's closing line — a dream, an
illusion, a bubble, a shadow, dew, a flash of lightning. The pod that riffed
on it asked for this instead, and asked specifically that the six choices
become six equal paper colours rather than six kinds of thought with
different rules. So a colour here means nothing: it never marks who wrote a
plane, how popular it is, or what anyone may do with it. It's paper you
liked the look of.

What survives from the wall is its temperament. There are still no accounts,
no follower counts, no likes, no ranking and no notifications. A plane, like
a trace, is permanent once thrown: nobody can edit or delete it, including
whoever wrote it. The wall's traces and answers weren't migrated into
planes, because they were never planes; they're kept exactly as they were,
read-only, at [/archive](/archive), linked quietly from the About panel.

## How it works

Write on the sheet, choose a colour and a place, and press **Fold plane**.
The sheet folds into a dart with the start of your message on one wing and
your place on the other. Press **Throw plane** (or drag it upward and let
go) and it joins the sky on every open page within about a second.

**Catch a plane** brings up a net that follows the pointer; click a plane
inside it to catch that one, or press **Catch an available plane** to take
any. You get someone else's when there is one. The plane comes to you folded,
with its preview on the wing; **Open / Unfold** spreads it into the sheet,
with the whole message and every stamp so far. Add your own place and press
**Stamp & send onward**, or **Release without stamping** to let it go as it
was. **View journey** draws its route on the globe, stop by stop, with an
approximate distance between the places people chose — a virtual journey,
not a tracked one.

**Your planes** lists what this browser has thrown, newest first, each with
its current stamps and route.

If the browser can't do WebGL, the same sky is drawn flat, with every action
intact. With JavaScript off, the page is plain forms: write and throw, catch
one, read it, stamp it or release it.

## People, and who may change what

A person is a browser. The first visit sets a random, long-lived `visitor`
cookie (HttpOnly, never readable by the page's scripts), and that's the only
identity there is. From it the server derives a public handle — a bird and
six hex digits, like `swallow-c8d493` — with a one-way hash, so the handle can
be shown on the page and written to the logs without revealing the cookie.
You see your own handle at the bottom of the sky; a plane shows its author's
handle, and each stamp shows its stamper's. There's no list of who's here
and no count of anyone.

| What | Who can read it | Who can change it | Enforced in |
| --- | --- | --- | --- |
| A plane's message, colour, author, origin stamp | everyone | nobody, ever | `src/planes.ts`, `createPlane`: written once, no update path exists |
| Earlier stamps | everyone | nobody | stamps are only ever inserted, at the next sequence number |
| Whether a plane is flying or held | everyone | whoever catches it, for 120 s | `catchPlane`: one conditional `UPDATE … WHERE state = 'flying'` |
| A new stamp, or letting it go | — | only the visitor holding the current lease | `releasePlane`: checks visitor **and** lease id **and** expiry in one `UPDATE` |
| Your planes | only you | — | `/api/mine` selects by the cookie's visitor id |

A catch holds the plane for 120 seconds, renewed every 30 while you're
looking at it. Close the tab and the hold lapses; the server puts the plane
back in the sky within five seconds of it expiring. A request carrying an old
lease id (from a previous catch of the same plane, or someone else's) is
refused, so a stale tab can't stamp a plane it no longer holds.

Every write carries a request key. Sending the same key twice — a double
click, a retry after a dropped connection — returns the first result instead
of making a second plane or stamp; the same key with a different payload is
refused. Writes from another site are refused, request bodies are capped at
8 KB, and each visitor gets a small per-minute budget (12 planes, 40 catches,
40 releases). A garbled cookie gets a fresh identity instead of an error.

## Reading the logs

Every action prints one JSON line to stdout, which is what
`flyctl logs -a comp4020-riff8-liuru-1` shows. Each line has the time, a
request id, the action, the outcome, the actor's handle, and the plane id
where there is one:

```
{"action":"plane_create","outcome":"ok","actor":"robin-83ac23","plane":1,"colour":"blue","origin":"AU",…}
{"action":"plane_catch","outcome":"ok","actor":"swallow-c8d493","plane":1,"creator":"robin-83ac23",…}
{"action":"plane_catch","outcome":"refused","actor":"heron-b3358a","plane":1,"reason":"already_caught"}
{"action":"plane_stamp","outcome":"ok","actor":"swallow-c8d493","plane":1,"seq":2,"region":"JP",…}
```

The actions are `visitor_issue`, `plane_create`, `plane_catch`,
`plane_stamp`, `plane_release`, `lease_expire`, `lease_renew` (refusals
only), `stream_open`/`stream_close`, and `write` for requests refused before
they reach a route (cross-site, oversized, malformed). Refusals carry a
short `reason`. Lines are written after a change commits, never before. No
line ever holds a message body, a cookie, a lease id, an IP address or a raw
request payload. To follow two people at a crit, read the handles shown at
the bottom of each of their screens and watch for those in the log; nobody
needs to generate test traffic on the live app to try it.

## Setup

Node 24 and pnpm 11 (pinned in `mise.toml`). `pnpm install`, then
`node src/server.ts`; it listens on `PORT` (default 8080) and keeps its
SQLite file in `DATA_DIR` (default `./data`). `pnpm check` runs the
type-check and the spec against a running server at `APP_URL`. The globe's
land mask is generated once by `node scripts/build-land.ts` from Natural
Earth's public-domain 1:110m land, via
[world-atlas](https://github.com/topojson/world-atlas) (ISC), and committed;
the place list is `src/web/regions.json`. Rendering uses
[three.js](https://threejs.org/) (MIT), served from the app itself.

## What's enforced vs. judged

Enforced in `spec/`: a plane needs one of the six colours, a place from the
catalogue (a city has to belong to its country), and a message of 1 to 240
code points that's stored exactly as written, line breaks and surrounding
spaces included. Two catchers racing for one plane get exactly one winner.
Only the lease holder can stamp or release, an old lease can't act on a new
catch, and repeated keys don't duplicate anything. A catcher can't change a
plane's message, colour or history. A thrown plane reaches other open pages
within a second, a reconnecting page gets exactly what it missed, and the
archive stays read-only.

Judged: whether the sky feels like Paper Planes — the scale of the globe,
the fold, the throw, the moment of catching something a stranger wrote —
rather than a form with a 3D background. That's checked by eye, at 1440×900
and 390×844, and it's the crit's call.

## Known limitations

- The fold is DOM panels hinged in CSS 3D, not a cloth simulation; it reads
  as a dart, but the paper doesn't bend.
- The sky draws at most 60 flying planes, sampled at random; catching "any"
  still draws from all of them.
- Live updates fan out from one process's memory, which works because the
  app runs on exactly one machine. A second machine would need a shared
  channel.
- The per-visitor limits are per cookie, so clearing cookies resets them.
  There's still no moderation, and an unkind message can't be removed. If
  the sky is ever exposed somewhere a stranger could flood it, that's the
  first thing to revisit.
- Handles are 24 bits of hash: plenty to tell a crit's worth of people
  apart, not a guarantee across millions.
