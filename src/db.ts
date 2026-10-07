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
