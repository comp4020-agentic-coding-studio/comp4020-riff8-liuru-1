import { createHash, randomUUID } from "node:crypto";
import {
  acquire,
  appendStamp,
  catchCandidate,
  expireHold,
  expiredHolds,
  findRequest,
  heldBy,
  insertPlane,
  planeRow,
  planesBy,
  recordEvent,
  recordRequest,
  releaseHold,
  renew,
  stampsFor,
  transaction,
  type PlaneRow,
  type StampRow,
} from "./db.ts";
import { handleFor, log } from "./log.ts";
import { place } from "./regions.ts";
import { bodyProblem, isColour, normaliseBody } from "./web/rules.js";

// Every rule about who may change a plane lives here, and every one is
// checked against the server's own record of the visitor, never a flag the
// browser sent. See docs/decisions/0004-paper-planes.md for the table.

export const LEASE_MS = 120_000;

export interface PublicStamp {
  seq: number;
  country: string;
  city: string | null;
  label: string;
  lat: number;
  lng: number;
  by: string;
  at: number;
}

export interface PublicPlane {
  id: number;
  colour: string;
  body: string;
  author: string;
  createdAt: number;
  flying: boolean;
  mine: boolean;
  stamps: PublicStamp[];
}

function publicStamp(s: StampRow): PublicStamp {
  // stored ids were validated on the way in; a catalogue edit that dropped one
  // still shows the raw id rather than losing the stamp
  const p = place(s.country, s.city) ?? place(s.country, null);
  return {
    seq: s.seq,
    country: s.country,
    city: s.city,
    label: p?.label ?? s.country,
    lat: p?.lat ?? 0,
    lng: p?.lng ?? 0,
    by: handleFor(s.actorId),
    at: s.createdAt,
  };
}

export function publicPlanes(rows: PlaneRow[], viewer: string): PublicPlane[] {
  const stamps = stampsFor(rows.map((r) => r.id));
  return rows.map((r) => ({
    id: r.id,
    colour: r.colour,
    body: r.body,
    author: handleFor(r.creatorId),
    createdAt: r.createdAt,
    flying: r.state === "flying",
    mine: r.creatorId === viewer,
    stamps: (stamps.get(r.id) ?? []).map(publicStamp),
  }));
}

export function publicPlane(id: number, viewer: string): PublicPlane | undefined {
  const row = planeRow(id);
  return row ? publicPlanes([row], viewer)[0] : undefined;
}

export type Result<T> = { ok: true; value: T } | { ok: false; status: number; reason: string; message: string };

const refuse = (status: number, reason: string, message: string): Result<never> => ({
  ok: false,
  status,
  reason,
  message,
});

const fingerprint = (op: string, payload: unknown): string =>
  createHash("sha256").update(JSON.stringify([op, payload])).digest("hex");

const KEY = /^[A-Za-z0-9_-]{8,64}$/;

// The same key from the same visitor replays the first answer; the same key
// with a different payload, or for a different operation, is refused.
function replay(actor: string, key: string, op: string, fp: string): Result<number> | undefined {
  const seen = findRequest(actor, key);
  if (!seen) return undefined;
  if (seen.op !== op || seen.fingerprint !== fp || seen.planeId === null) {
    return refuse(409, "key_reused", "That request key was already used for something else.");
  }
  return { ok: true, value: seen.planeId };
}

export interface CreateInput {
  key: unknown;
  colour: unknown;
  body: unknown;
  country: unknown;
  city: unknown;
}

export function createPlane(actor: string, input: CreateInput): Result<{ id: number; replayed: boolean }> {
  if (typeof input.key !== "string" || !KEY.test(input.key)) return refuse(400, "bad_key", "Missing request key.");
  if (!isColour(input.colour)) return refuse(400, "bad_colour", "Choose one of the six colours.");
  if (typeof input.body !== "string") return refuse(400, "bad_body", "Write something first.");
  const body = normaliseBody(input.body);
  const problem = bodyProblem(body);
  if (problem) return refuse(400, body.trim() ? "too_long" : "empty", problem);
  const origin = place(input.country, input.city);
  if (!origin) return refuse(400, "bad_region", "Choose a country or region from the list.");
  const colour = input.colour as string;
  const key = input.key;
  const fp = fingerprint("create", [colour, body, origin.country, origin.city]);
  return transaction(() => {
    const seen = replay(actor, key, "create", fp);
    if (seen) return seen.ok ? { ok: true, value: { id: seen.value, replayed: true } } : seen;
    const now = Date.now();
    const id = insertPlane(actor, colour, body, now);
    appendStamp(id, actor, origin.country, origin.city, now);
    recordRequest(actor, key, "create", fp, id);
    recordEvent("created", id);
    return { ok: true, value: { id, replayed: false } };
  });
}

export interface Hold {
  planeId: number;
  leaseId: string;
  expires: number;
}

const holdOf = (row: PlaneRow): Hold => ({
  planeId: row.id,
  leaseId: row.leaseId ?? "",
  expires: row.leaseExpires ?? 0,
});

export const currentHold = (actor: string): Hold | undefined => {
  const row = heldBy(actor, Date.now());
  return row ? holdOf(row) : undefined;
};

// One plane in hand at a time. A specific id is caught only if it's still
// flying; no id means "any", preferring someone else's.
export function catchPlane(actor: string, requested: unknown): Result<Hold & { self: boolean }> {
  const already = currentHold(actor);
  if (already) return refuse(409, "already_holding", "You're already holding a plane. Send it on or let it go first.");
  let id: number | undefined;
  if (requested !== undefined && requested !== null && requested !== "") {
    id = Number(requested);
    if (!Number.isInteger(id) || id <= 0) return refuse(400, "bad_plane", "No such plane.");
  }
  return transaction(() => {
    const target = id ?? catchCandidate(actor);
    if (target === undefined) return refuse(404, "sky_empty", "No planes are flying right now.");
    const row = planeRow(target);
    if (!row) return refuse(404, "no_such_plane", "No such plane.");
    const leaseId = randomUUID();
    const expires = Date.now() + LEASE_MS;
    if (!acquire(target, leaseId, actor, expires)) {
      return refuse(409, "already_caught", "That plane has already been caught. Try another.");
    }
    recordEvent("caught", target);
    return { ok: true, value: { planeId: target, leaseId, expires, self: row.creatorId === actor } };
  });
}

export function renewHold(actor: string, planeId: number, leaseId: unknown): Result<Hold> {
  if (typeof leaseId !== "string") return refuse(400, "bad_lease", "Missing lease.");
  const now = Date.now();
  const expires = now + LEASE_MS;
  if (!renew(planeId, actor, leaseId, now, expires)) {
    return refuse(409, "lease_lost", "You're no longer holding this plane.");
  }
  return { ok: true, value: { planeId, leaseId, expires } };
}

export interface ReleaseInput {
  key: unknown;
  leaseId: unknown;
  country: unknown;
  city: unknown;
}

// Stamp-and-send or let go, in one transaction: the stamp lands only if the
// release does. Only the visitor holding this exact lease can do either, so a
// stale tab (or a forged request) holding last catch's lease id can't act on
// this catch.
export function releasePlane(
  actor: string,
  planeId: number,
  input: ReleaseInput,
): Result<{ stamped: number | null; replayed: boolean }> {
  if (typeof input.key !== "string" || !KEY.test(input.key)) return refuse(400, "bad_key", "Missing request key.");
  if (typeof input.leaseId !== "string") return refuse(400, "bad_lease", "Missing lease.");
  const wantsStamp = input.country !== undefined && input.country !== null && input.country !== "";
  const stamp = wantsStamp ? place(input.country, input.city) : undefined;
  if (wantsStamp && !stamp) return refuse(400, "bad_region", "Choose a country or region from the list.");
  const op = stamp ? "stamp" : "release";
  const key = input.key;
  const leaseId = input.leaseId;
  const fp = fingerprint(op, [planeId, leaseId, stamp?.country ?? null, stamp?.city ?? null]);
  return transaction(() => {
    const seen = replay(actor, key, op, fp);
    if (seen) return seen.ok ? { ok: true, value: { stamped: null, replayed: true } } : seen;
    const now = Date.now();
    if (!releaseHold(planeId, actor, leaseId, now)) {
      return refuse(409, "lease_lost", "You're no longer holding this plane, so it can't be stamped or released.");
    }
    const seq = stamp ? appendStamp(planeId, actor, stamp.country, stamp.city, now) : null;
    recordRequest(actor, key, op, fp, planeId);
    recordEvent(stamp ? "stamped" : "released", planeId);
    return { ok: true, value: { stamped: seq, replayed: false } };
  });
}

// Holds nobody renewed go back into the sky. Called on a timer; returns the
// planes it freed so the caller can tell open pages.
export function expireHolds(): number[] {
  const now = Date.now();
  const freed: number[] = [];
  for (const row of expiredHolds(now)) {
    if (expireHold(row.id, now)) {
      recordEvent("expired", row.id);
      log({ action: "lease_expire", outcome: "ok", actor: handleFor(row.leaseHolder ?? ""), plane: row.id });
      freed.push(row.id);
    }
  }
  return freed;
}

export function myPlanes(actor: string, before: number, limit: number): PlaneRow[] {
  return planesBy(actor, before, limit);
}
