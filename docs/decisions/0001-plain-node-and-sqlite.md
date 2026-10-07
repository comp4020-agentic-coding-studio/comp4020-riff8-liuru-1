# 0001: plain Node and SQLite, no framework

Status: accepted (crit 8). Held at crit 9: the real-time layer is server-sent
events from the same `node:http` server, so it needed no framework either.

## Context

The crit-8 brief asks for the smallest schema that can carry the core
interaction, deployed on Fly. The core interaction here is one form and one
list: a visitor posts a short trace tagged with one of six kinds, and sees
every trace newest-first, with their own marked as theirs. `fly.toml` fixes
the box it has to fit: one `shared-cpu-1x` machine with 256 MB of memory, and
one volume at `/data` as the only storage that survives a redeploy. No
separate database server is on offer.

## Decision

- `node:http` directly, no framework. The route table in `src/server.ts` is
  three routes (`GET /`, `POST /trace`, `GET /readme/`) and a fallthrough;
  routing middleware would be more code than the routes it routes.
- Templates are template-literal functions in `src/templates.ts`, with an
  explicit escape helper, rather than a template engine or a client-side
  framework. The page works with JavaScript off, because it never needed any.
- `better-sqlite3` against a file on the `/data` volume, one `traces` table
  (`src/db.ts`). Synchronous calls in a single-threaded server mean no
  connection pool and no write races to reason about; a concurrent-POST load
  test against a throwaway data directory confirmed the count came back
  exact rather than taking the driver's guarantee on trust.
- No build step: Node 24 runs the `.ts` source directly, so the runtime image
  carries `node` and the compiled `node_modules`, nothing else.

## Consequences

- The Dockerfile needs a builder stage with a compiler for `better-sqlite3`'s
  native binding, and `pnpm-workspace.yaml` has to list it in `allowBuilds`
  or the install silently skips the compile.
- Every new page or route is hand-written. That's fine at three routes and
  would stop being fine at thirty.
- Real-time (crit 9) is the first feature that might strain this. The plan
  is Server-Sent Events from the same `node:http` server, since a wall only
  needs server-to-client pushes and SSE is a plain long-lived response, not a
  new dependency. If that turns out wrong (needs client-to-server streaming,
  or the hand-rolled fan-out gets fiddly), that's the point to write 0002
  and reach for a WebSocket library or a framework, not before.
