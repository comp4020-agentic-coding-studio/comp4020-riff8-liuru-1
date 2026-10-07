# 六如 — a wall for passing things

This is a shared wall. Anyone who visits can leave a short, passing
thought — tagged as one of the six similes from the closing lines of the
Diamond Sūtra: a dream, an illusion, a bubble, a shadow, dew, a flash of
lightning. Those six are also where my own name in this course comes from
(Tang Yin's Buddhist name, 六如, "the six as-ifs"), so the theme isn't
decoration bolted onto a generic guestbook — it's the actual design
constraint: everything on the wall is supposed to feel like it's already
passing.

## What good means here

Good, for this app, is small and quiet rather than sticky. The brief points at
the small web, home-cooked software, and games built for a handful of people
rather than a market, and those are the three things I actually leaned on
while deciding what to build and what to leave out.

Robin Sloan's [*An App Can Be a Home-Cooked Meal*](https://www.robinsloan.com/notes/home-cooked-app/)
argues that software made for a specific, small circle of people — not a
public, not a userbase — can afford to just be finished: no growth loop, no
notifications chasing you back. The wall has no accounts, no follower count,
no read receipts. You can find your own trace again, but there's nothing here
trying to make you come back.

The [Small Technology Foundation](https://small-tech.org/)'s case for a small
web — public spaces people can actually understand the whole of, without
tracking or an algorithmic feed — is why the wall shows everything in one
plain reverse-chronological list, oldest at the bottom, nothing curated or
ranked. What you see is what's actually there.

And the design point the final-project brief itself makes explicitly --- build
something that's *better* because other people are using it right now, the
way small local-multiplayer games (like [*Pico Park*](https://store.steampowered.com/app/1509960/PICO_PARK/))
only work because everyone is present at once --- is why the wall is live. A
trace someone leaves appears on every other open page within about a second,
with no reload. There's still no "three people are here" line and no names:
the only sign anyone else is present is the wall moving.

## Several people at once

This is the one decision about shared use the app is built around, so it's
written down rather than left to whatever the code happens to do.

**New traces arrive live, and nothing else about the page changes under
you.** A new trace slides in at the top of the wall; the list isn't rebuilt,
so a half-typed thought in the form, your scroll position, and whatever
you're reading stay put. The wall stays plain reverse-chronological whether
it was loaded or streamed, so a page that has been open all afternoon shows
exactly what a fresh load would. A wall filtered to one as-if (only the
dreams, say) takes new traces of that kind live and quietly ignores the rest;
filtering narrows the list, never reorders it, and switching filters is an
ordinary link, so it's a fresh load of that view.

**Answers arrive live too, into the thread they belong to.** An answer
appears under its trace on every open page within about a second, at the
bottom of that trace's short thread, oldest first, so it reads as a
conversation. An answer form you've opened and half-filled stays as it was
while other people's answers land above it. An answer never moves its trace up
the wall: the wall is ordered by when each thought was left, not by how much
talk it has drawn, because sorting by activity is where a ranked feed starts.

**Two people answering the same trace at once both land.** Nothing on the
wall is ever edited, only added to, so there's nothing for two people to
conflict over. The server takes answers in the order they arrive, and every
open page, and every later visitor, sees that same order. Neither sees the
other typing; you find out someone else answered the moment their answer
appears, the same way you find out about a new trace.

**A dropped connection catches up rather than starting over.** Each page
keeps one server-sent-events stream open. If it drops (a phone sleeping, a
train tunnel, the app's machine restarting), the browser reconnects and the
server sends what was missed since the last trace that page saw, in order,
with nothing doubled. A page also asks for anything posted between its own
render and its stream opening, so a trace never falls into that gap.

**Coming back tomorrow shows the wall, not what's new.** There's no unread
marker, no "since your last visit" line, no count of what you missed. You see
the same wall anyone else sees, with your own traces and answers marked as
yours. If someone answered one of your traces overnight, you'll find it under
that trace when you scroll to it, and nowhere else: no "someone answered you".
Marking what's new would be the first step towards chasing people back, which
is the thing this app exists not to do.

The alternatives were polling (simpler, but a fixed delay and a request every
few seconds from every idle tab for a wall that mostly isn't moving) and
WebSockets (two-way, which the wall doesn't need: posting is still an
ordinary form submission, and works without JavaScript). The cost of SSE
here is that the fan-out lives in one process's memory, which only works
because the app runs on exactly one machine. A second machine would need a
shared channel between them, and that's a real rewrite, not a setting.

## Answers, and why it's still the same app

The first version of this wall held one voice per thought, and part of the
argument below is "not a message board with a select box on it". Answers
push straight against that: a thought can now draw a reply, and replies are
the basic unit of a message board. They're here because a wall that is better
for other people being on it ought to let those people meet somewhere, and an
answer under a stranger's passing thought is the smallest place that can
happen.

What keeps it the same app is everything an answer doesn't have. It has no
name, so it's a voice, not a person you could follow. It's capped at 140
characters, smaller than a trace, so the thought stays the main thing. It has
no kind of its own; it belongs to the as-if it answers. Answers go one level
deep (you can't answer an answer), there are no counts of them anywhere, they
never lift a trace up the wall, and nothing tells you one arrived. Like
traces, they're permanent once left. The six similes are still the only way
anything enters the wall.

The cost is real. A trace can now gather a small conversation, and an unkind
answer under your thought can't be removed by you or anyone else. That makes
the missing moderation below a sharper gap than it was.

## Sound, and why it's still quiet

Each as-if has a short sound of its own, synthesised in the browser: two drops
of dew, a bubble's rising bloop, a crack and then thunder for lightning. It's
off until you turn it on, it plays only when you pick an as-if yourself, and
anyone whose system asks for reduced motion gets none of it. Above all, it
never plays when someone else's trace or answer arrives. A chime for new
activity is a notification, and a notification is the wall reaching out to
pull you back, which is the one thing it doesn't do. The sound is for the
moment you choose what your own thought is like, not a signal that others are
here.

## What's enforced vs. what's judged

Enforced, in `spec/`: a trace needs a real kind (one of the six) and non-empty
text capped at 240 characters, or the server silently drops it rather than
storing garbage. An answer needs a trace that exists and non-empty text capped
at 140. Live delivery is checked as a crowd: several separate visitors' open
streams each receive what another visitor leaves within a second, simultaneous
answers arrive in one agreed order, and a reconnecting stream gets exactly
what it missed. Each of the six filters shows only its own kind, newest first,
and together they add up to the whole wall. Traces persist in SQLite on the app's own volume, so they
survive a restart or a redeploy — not just the current process.

Judged, by me now and by a reader later: whether the wall actually feels like
the six similes it's named after, not a message board with a select box on
it, and whether the plain list stays legible once real people have used it.
I haven't built moderation, rate limiting, or a way to remove a trace or an
answer — for a
wall this small, the honest position is that I haven't yet had a reason to
need any of them, not that I've reasoned my way out of needing them forever.

## What I deliberately didn't build yet

No visible distinction between visitors beyond
"yours vs. everyone else's" (no names, colours, or avatars — deferred until
there's an actual multi-user feature that needs it), no server-side logging
beyond what Fly captures by default (crit 11), and no moderation. All three are
real gaps, not oversights, and each has a crit on the course's own schedule
that's the right place to close it.
