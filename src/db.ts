import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";

export const KINDS = ["dream", "illusion", "bubble", "shadow", "dew", "lightning"] as const;
export type Kind = (typeof KINDS)[number];

export interface Trace {
  id: number;
  visitorId: string;
  kind: Kind;
  text: string;
  createdAt: number;
}

// An answer to someone else's trace (or your own). Smaller than a trace, with
// no kind of its own: it belongs to the thought it answers.
export interface Reply {
  id: number;
  traceId: number;
  visitorId: string;
  text: string;
  createdAt: number;
}

export function isKind(value: string): value is Kind {
  return (KINDS as readonly string[]).includes(value);
}

const dataDir = process.env.DATA_DIR ?? "./data";
mkdirSync(dataDir, { recursive: true });

const dbPath = `${dataDir}/app.db`;
const db = new Database(dbPath);
db.pragma("journal_mode = WAL");
db.exec(`
  CREATE TABLE IF NOT EXISTS traces (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    visitor_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    text TEXT NOT NULL,
    created_at INTEGER NOT NULL
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS replies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    trace_id INTEGER NOT NULL REFERENCES traces(id),
    visitor_id TEXT NOT NULL,
    text TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS replies_by_trace ON replies (trace_id, id);
`);

const insertTrace = db.prepare(
  "INSERT INTO traces (visitor_id, kind, text, created_at) VALUES (?, ?, ?, ?)",
);

export function addTrace(visitorId: string, kind: Kind, text: string): number {
  return Number(insertTrace.run(visitorId, kind, text, Date.now()).lastInsertRowid);
}

const selectRecent = db.prepare(
  "SELECT id, visitor_id AS visitorId, kind, text, created_at AS createdAt FROM traces ORDER BY id DESC LIMIT ?",
);
const selectRecentOfKind = db.prepare(
  "SELECT id, visitor_id AS visitorId, kind, text, created_at AS createdAt FROM traces WHERE kind = ? ORDER BY id DESC LIMIT ?",
);

// Newest first, filtered or not: a filter narrows the wall, it never reorders it.
export function recentTraces(limit = 200, kind?: Kind): Trace[] {
  return (kind ? selectRecentOfKind.all(kind, limit) : selectRecent.all(limit)) as Trace[];
}

const selectMaxId = db.prepare("SELECT COALESCE(MAX(id), 0) AS id FROM traces");

export function newestTraceId(): number {
  return (selectMaxId.get() as { id: number }).id;
}

const selectSince = db.prepare(
  "SELECT id, visitor_id AS visitorId, kind, text, created_at AS createdAt FROM traces WHERE id > ? ORDER BY id ASC LIMIT ?",
);

// What a reconnecting stream missed, oldest first so the client can prepend
// each in turn and end up in the same order as a fresh page load.
export function tracesSince(id: number, limit = 200): Trace[] {
  return selectSince.all(id, limit) as Trace[];
}

const selectById = db.prepare(
  "SELECT id, visitor_id AS visitorId, kind, text, created_at AS createdAt FROM traces WHERE id = ?",
);

export function traceById(id: number): Trace | undefined {
  return selectById.get(id) as Trace | undefined;
}

const REPLY_COLUMNS = "id, trace_id AS traceId, visitor_id AS visitorId, text, created_at AS createdAt";
const insertReply = db.prepare(
  "INSERT INTO replies (trace_id, visitor_id, text, created_at) SELECT id, ?, ?, ? FROM traces WHERE id = ?",
);
const selectReplyById = db.prepare(`SELECT ${REPLY_COLUMNS} FROM replies WHERE id = ?`);

// Only inserts when the trace exists: an answer to nothing is dropped, the
// same way a trace with a made-up kind is.
export function addReply(traceId: number, visitorId: string, text: string): Reply | undefined {
  const result = insertReply.run(visitorId, text, Date.now(), traceId);
  if (result.changes === 0) return undefined;
  return selectReplyById.get(Number(result.lastInsertRowid)) as Reply;
}

const selectRepliesFor = db.prepare(
  `SELECT ${REPLY_COLUMNS} FROM replies WHERE trace_id IN (SELECT value FROM json_each(?)) ORDER BY id ASC`,
);

// Oldest first under each trace, so a thread reads as a conversation.
export function repliesFor(traceIds: number[]): Map<number, Reply[]> {
  const out = new Map<number, Reply[]>();
  for (const r of selectRepliesFor.all(JSON.stringify(traceIds)) as Reply[]) {
    const list = out.get(r.traceId) ?? [];
    list.push(r);
    out.set(r.traceId, list);
  }
  return out;
}

const selectRepliesSince = db.prepare(`SELECT ${REPLY_COLUMNS} FROM replies WHERE id > ? ORDER BY id ASC LIMIT ?`);

export function repliesSince(id: number, limit = 500): Reply[] {
  return selectRepliesSince.all(id, limit) as Reply[];
}

const selectMaxReplyId = db.prepare("SELECT COALESCE(MAX(id), 0) AS id FROM replies");

export function newestReplyId(): number {
  return (selectMaxReplyId.get() as { id: number }).id;
}

// ---------------------------------------------------------------------------
// Paper planes. Added beside the wall's tables, never replacing them: traces
// and replies stay exactly as they were and are read by /archive.
//
// A plane's body, colour, origin and creator are written once and never
// updated. Only `state` and the lease columns change: flying -> held (one
// visitor, one lease id, an expiry) -> flying again. The origin is stamp 1, so
// a journey is just the plane's stamps in seq order.
db.exec(`
  CREATE TABLE IF NOT EXISTS planes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    creator_id TEXT NOT NULL,
    colour TEXT NOT NULL,
    body TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    state TEXT NOT NULL DEFAULT 'flying' CHECK (state IN ('flying', 'held')),
    lease_id TEXT,
    lease_holder TEXT,
    lease_expires INTEGER
  );
  CREATE INDEX IF NOT EXISTS planes_by_state ON planes (state);
  CREATE INDEX IF NOT EXISTS planes_by_creator ON planes (creator_id, id);
  CREATE INDEX IF NOT EXISTS planes_by_holder ON planes (lease_holder);

  CREATE TABLE IF NOT EXISTS stamps (
    plane_id INTEGER NOT NULL REFERENCES planes(id),
    seq INTEGER NOT NULL,
    actor_id TEXT NOT NULL,
    country TEXT NOT NULL,
    city TEXT,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (plane_id, seq)
  );

  -- One row per idempotent write: the same actor sending the same key gets
  -- the first response back instead of a second plane or a second stamp.
  CREATE TABLE IF NOT EXISTS requests (
    actor_id TEXT NOT NULL,
    key TEXT NOT NULL,
    op TEXT NOT NULL,
    fingerprint TEXT NOT NULL,
    plane_id INTEGER,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (actor_id, key)
  );

  -- Every committed change to the sky, in order: the SSE cursor, so a
  -- reconnecting page can be sent exactly what it missed.
  CREATE TABLE IF NOT EXISTS sky_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kind TEXT NOT NULL,
    plane_id INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  );
`);

export interface PlaneRow {
  id: number;
  creatorId: string;
  colour: string;
  body: string;
  createdAt: number;
  state: "flying" | "held";
  leaseId: string | null;
  leaseHolder: string | null;
  leaseExpires: number | null;
}

export interface StampRow {
  planeId: number;
  seq: number;
  actorId: string;
  country: string;
  city: string | null;
  createdAt: number;
}

export interface RequestRow {
  op: string;
  fingerprint: string;
  planeId: number | null;
}

export interface SkyEvent {
  id: number;
  kind: string;
  planeId: number;
}

const PLANE_COLUMNS = `id, creator_id AS creatorId, colour, body, created_at AS createdAt, state,
  lease_id AS leaseId, lease_holder AS leaseHolder, lease_expires AS leaseExpires`;
const STAMP_COLUMNS = `plane_id AS planeId, seq, actor_id AS actorId, country, city, created_at AS createdAt`;

const q = {
  insertPlane: db.prepare("INSERT INTO planes (creator_id, colour, body, created_at) VALUES (?, ?, ?, ?)"),
  insertStamp: db.prepare(
    "INSERT INTO stamps (plane_id, seq, actor_id, country, city, created_at) VALUES (?, ?, ?, ?, ?, ?)",
  ),
  nextSeq: db.prepare("SELECT COALESCE(MAX(seq), 0) + 1 AS seq FROM stamps WHERE plane_id = ?"),
  plane: db.prepare(`SELECT ${PLANE_COLUMNS} FROM planes WHERE id = ?`),
  stampsFor: db.prepare(
    `SELECT ${STAMP_COLUMNS} FROM stamps WHERE plane_id IN (SELECT value FROM json_each(?)) ORDER BY plane_id, seq`,
  ),
  flyingSample: db.prepare(`SELECT ${PLANE_COLUMNS} FROM planes WHERE state = 'flying' ORDER BY RANDOM() LIMIT ?`),
  // someone else's plane first; your own only when nothing else is flying
  catchCandidate: db.prepare(
    `SELECT id FROM planes WHERE state = 'flying' ORDER BY (creator_id = ?), RANDOM() LIMIT 1`,
  ),
  acquire: db.prepare(
    `UPDATE planes SET state = 'held', lease_id = ?, lease_holder = ?, lease_expires = ?
     WHERE id = ? AND state = 'flying'`,
  ),
  renew: db.prepare(
    `UPDATE planes SET lease_expires = ?
     WHERE id = ? AND state = 'held' AND lease_holder = ? AND lease_id = ? AND lease_expires > ?`,
  ),
  release: db.prepare(
    `UPDATE planes SET state = 'flying', lease_id = NULL, lease_holder = NULL, lease_expires = NULL
     WHERE id = ? AND state = 'held' AND lease_holder = ? AND lease_id = ? AND lease_expires > ?`,
  ),
  expired: db.prepare(`SELECT ${PLANE_COLUMNS} FROM planes WHERE state = 'held' AND lease_expires <= ?`),
  expire: db.prepare(
    `UPDATE planes SET state = 'flying', lease_id = NULL, lease_holder = NULL, lease_expires = NULL
     WHERE id = ? AND state = 'held' AND lease_expires <= ?`,
  ),
  heldBy: db.prepare(
    `SELECT ${PLANE_COLUMNS} FROM planes WHERE state = 'held' AND lease_holder = ? AND lease_expires > ? LIMIT 1`,
  ),
  mine: db.prepare(`SELECT ${PLANE_COLUMNS} FROM planes WHERE creator_id = ? AND id < ? ORDER BY id DESC LIMIT ?`),
  request: db.prepare("SELECT op, fingerprint, plane_id AS planeId FROM requests WHERE actor_id = ? AND key = ?"),
  insertRequest: db.prepare(
    "INSERT INTO requests (actor_id, key, op, fingerprint, plane_id, created_at) VALUES (?, ?, ?, ?, ?, ?)",
  ),
  insertEvent: db.prepare("INSERT INTO sky_events (kind, plane_id, created_at) VALUES (?, ?, ?)"),
  eventsSince: db.prepare("SELECT id, kind, plane_id AS planeId FROM sky_events WHERE id > ? ORDER BY id ASC LIMIT ?"),
  newestEvent: db.prepare("SELECT COALESCE(MAX(id), 0) AS id FROM sky_events"),
};

export const transaction = <T>(fn: () => T): T => db.transaction(fn)();

export function insertPlane(creatorId: string, colour: string, body: string, at: number): number {
  return Number(q.insertPlane.run(creatorId, colour, body, at).lastInsertRowid);
}

export function appendStamp(
  planeId: number,
  actorId: string,
  country: string,
  city: string | null,
  at: number,
): number {
  const { seq } = q.nextSeq.get(planeId) as { seq: number };
  q.insertStamp.run(planeId, seq, actorId, country, city, at);
  return seq;
}

export const planeRow = (id: number): PlaneRow | undefined => q.plane.get(id) as PlaneRow | undefined;

export function stampsFor(planeIds: number[]): Map<number, StampRow[]> {
  const out = new Map<number, StampRow[]>(planeIds.map((id) => [id, []]));
  for (const s of q.stampsFor.all(JSON.stringify(planeIds)) as StampRow[]) out.get(s.planeId)?.push(s);
  return out;
}

export const flyingSample = (limit: number): PlaneRow[] => q.flyingSample.all(limit) as PlaneRow[];

export function catchCandidate(visitorId: string): number | undefined {
  return (q.catchCandidate.get(visitorId) as { id: number } | undefined)?.id;
}

export function acquire(planeId: number, leaseId: string, holder: string, expires: number): boolean {
  return q.acquire.run(leaseId, holder, expires, planeId).changes === 1;
}

export function renew(planeId: number, holder: string, leaseId: string, now: number, expires: number): boolean {
  return q.renew.run(expires, planeId, holder, leaseId, now).changes === 1;
}

export function releaseHold(planeId: number, holder: string, leaseId: string, now: number): boolean {
  return q.release.run(planeId, holder, leaseId, now).changes === 1;
}

export const expiredHolds = (now: number): PlaneRow[] => q.expired.all(now) as PlaneRow[];

export function expireHold(planeId: number, now: number): boolean {
  return q.expire.run(planeId, now).changes === 1;
}

export const heldBy = (visitorId: string, now: number): PlaneRow | undefined =>
  q.heldBy.get(visitorId, now) as PlaneRow | undefined;

export function planesBy(creatorId: string, before: number, limit: number): PlaneRow[] {
  return q.mine.all(creatorId, before, limit) as PlaneRow[];
}

export const findRequest = (actorId: string, key: string): RequestRow | undefined =>
  q.request.get(actorId, key) as RequestRow | undefined;

export function recordRequest(actorId: string, key: string, op: string, fingerprint: string, planeId: number): void {
  q.insertRequest.run(actorId, key, op, fingerprint, planeId, Date.now());
}

export function recordEvent(kind: string, planeId: number): number {
  return Number(q.insertEvent.run(kind, planeId, Date.now()).lastInsertRowid);
}

export const eventsSince = (id: number, limit = 500): SkyEvent[] => q.eventsSince.all(id, limit) as SkyEvent[];
export const newestEventId = (): number => (q.newestEvent.get() as { id: number }).id;
