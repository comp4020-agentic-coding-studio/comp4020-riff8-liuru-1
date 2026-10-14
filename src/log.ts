import { createHash, randomUUID } from "node:crypto";

// One JSON line per thing that happened, on stdout, which is what
// `flyctl logs` shows. Written so someone watching the log can narrate who
// did what without the UI: every line names its action, outcome and public
// actor handle. Never a message body, a cookie, a lease id or an IP.
export interface LogFields {
  req?: string;
  action: string;
  outcome: "ok" | "refused" | "error";
  actor?: string;
  plane?: number;
  reason?: string;
  [extra: string]: string | number | boolean | undefined | null;
}

export function log(fields: LogFields): void {
  console.log(JSON.stringify({ t: new Date().toISOString(), ...fields }));
}

export const requestId = (): string => randomUUID().slice(0, 8);

// A visitor's public name: a one-way function of their cookie, so the handle
// can be shown on the page and in the log without either revealing the
// cookie. A bird for the eye and 24 bits of hash so two visitors in one crit
// don't collide (the full cookie is 122 random bits, so the handle is
// stable but not reversible).
const BIRDS = [
  "albatross", "crane", "curlew", "dove", "egret", "falcon", "finch", "gannet",
  "heron", "ibis", "kestrel", "kite", "lark", "magpie", "osprey", "owl",
  "pelican", "petrel", "plover", "robin", "swallow", "swift", "tern", "wren",
];

export function handleFor(visitorId: string): string {
  const h = createHash("sha256").update(`paper-planes-handle:${visitorId}`).digest();
  return `${BIRDS[h[0] % BIRDS.length]}-${h.subarray(1, 4).toString("hex")}`;
}
