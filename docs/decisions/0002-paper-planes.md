# 0002: paper planes on the same server, one lease per catch

Status: accepted (pod riff, crit 10 brief). Supersedes the wall as the
primary experience; 0001's stack holds.

## Context

The pod's brief replaces the 六如 wall with a recreation of Paper Planes:
six colours of paper, a message on each plane, a region the writer picks,
catching, stamping and sending on, playable on a desktop as well as a phone.
It has to keep the old wall's data, stay on one 256 MB Fly machine with a
SQLite volume, and satisfy the crit-10 brief: two browsers act on shared
state, the server tells them apart and enforces who may do what, and the
logs let someone narrate it.

## Decision

- **Same server, more tables.** `planes`, `stamps`, `requests` and
  `sky_events` sit beside `traces` and `replies` in the same database
  (`src/db.ts`), created with `IF NOT EXISTS`. Nothing about the old tables
  changes; `/archive` reads them, and their write routes are gone.
- **A person is the existing `visitor` cookie.** Their public handle is a
  bird name plus 24 bits of `sha256("paper-planes-handle:" + cookie)`
  (`src/log.ts`). Colours are never identity.
- **A catch is a lease on the plane row.** `state`, `lease_id`,
  `lease_holder` and `lease_expires` live on `planes`. Acquiring is one
  `UPDATE … WHERE state = 'flying'`; SQLite runs it atomically, so exactly
  one racer sees `changes = 1`. Stamping or releasing is one transaction whose
  `UPDATE` checks holder, lease id and expiry together, and the stamp is
  inserted only if that `UPDATE` hit a row. A five-second timer expires
  abandoned leases.
- **Idempotency is a table, not a cache.** `requests` keys on
  `(visitor, key)` and stores the operation and a payload fingerprint, so a
  retried create returns the same plane and a reused key with a different
  payload is refused, across restarts.
- **The SSE cursor is `sky_events.id`.** Each event carries the plane as it
  is now, rendered for the listener, so a replayed event is harmless and a
  reconnect replays from `Last-Event-ID`. More than 500 missed events sends
  `reset` and the page refetches the sky.
- **The globe is three.js; the paper is the DOM.** three.js (served from
  `node_modules`, no bundler) draws the planet and the flock. The sheet is
  CSS-3D panels hinged on real creases (`src/web/paper.js`), so the message
  is real text the whole way through the fold and the editable layer is an
  ordinary `<textarea>`. Land comes from Natural Earth via a committed
  half-degree mask (`scripts/build-land.ts`), so the image needs neither
  topojson nor the atlas.
- **Places are a committed catalogue.** `src/web/regions.json` holds 207
  countries and regions and 536 cities with ids, aliases (Simplified Chinese
  names included) and approximate centres. Server and browser read the same
  file; the server validates every id.

## Consequences

- One plane in hand per visitor, and a plane can't be held by two people,
  by construction rather than by checking.
- A refreshed tab gets its hold back from `/api/sky`, because the hold lives
  on the server, not in the page.
- The lease and idempotency rules are in SQL `WHERE` clauses, so a forged
  request fails the same way a stale one does, with nothing to special-case.
- The old wall's 140-character answers and its six kinds are kept as data
  but can't grow.
- Fan-out is still one process's memory; a second machine would need a
  shared channel, as 0001 said.
