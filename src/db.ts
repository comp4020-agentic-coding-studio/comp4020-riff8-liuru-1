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
