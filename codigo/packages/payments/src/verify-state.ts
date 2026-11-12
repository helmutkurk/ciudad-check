import {
  chmodSync,
  closeSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  writeSync,
} from "node:fs";
import { dirname } from "node:path";
import { VerifyResponseSchema } from "@shelfie/core";
import type { VerifyResponse } from "@shelfie/core";
import { z } from "zod";

// Durable state of the x402 buyer (task B-13, security.md P5): receipts per idempotency key,
// keys whose payment outcome is unclear, and a write-ahead "pending" mark set before an attempt.
// After a crash a pending key may have been signed, so it is loaded as unclear (never re-signed
// automatically). Same file discipline as FilePayoutStore: fsync, atomic rename, a corrupt file
// is never silently replaced.

export interface StoredReceipt {
  txHash: string;
  verdict: VerifyResponse;
  receipt: unknown;
}

export interface VerifyClientState {
  receipts: Map<string, StoredReceipt>;
  uncertain: Set<string>;
}

const FileSchema = z.object({
  version: z.literal(1),
  receipts: z.array(
    z.object({
      key: z.string(),
      txHash: z.string(),
      verdict: VerifyResponseSchema,
      receipt: z.unknown(),
    }),
  ),
  uncertain: z.array(z.string()),
  pending: z.array(z.string()),
});

/** Load the state file; a missing file is an empty state, pending keys become unclear. */
export function loadVerifyClientState(path: string): VerifyClientState {
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    return { receipts: new Map(), uncertain: new Set() };
  }
  let parsed: z.infer<typeof FileSchema>;
  try {
    parsed = FileSchema.parse(JSON.parse(raw));
  } catch {
    // Replacing it could forget a signed payment and pay again.
    throw new Error(`verify client state file is unreadable: ${path}`);
  }
  const receipts = new Map<string, StoredReceipt>();
  for (const r of parsed.receipts) {
    receipts.set(r.key, { txHash: r.txHash, verdict: r.verdict, receipt: r.receipt });
  }
  const uncertain = new Set([...parsed.uncertain, ...parsed.pending]);
  for (const key of receipts.keys()) uncertain.delete(key);
  return { receipts, uncertain };
}

/** Write the state atomically (tmp file, fsync, rename). */
export function saveVerifyClientState(
  path: string,
  state: VerifyClientState & { pending: ReadonlySet<string> },
): void {
  const body: z.infer<typeof FileSchema> = {
    version: 1,
    receipts: [...state.receipts].map(([key, r]) => ({ key, ...r })),
    uncertain: [...state.uncertain],
    pending: [...state.pending],
  };
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const tmp = `${path}.tmp`;
  const fd = openSync(tmp, "w", 0o600);
  try {
    chmodSync(tmp, 0o600); // a stale tmp from an earlier crash keeps its old mode otherwise
    writeSync(fd, JSON.stringify(body));
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  renameSync(tmp, path);
}
