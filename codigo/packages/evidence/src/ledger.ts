import { createHash } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import { LedgerEventSchema, systemClock } from "@shelfie/core";
import type { Clock, LedgerEvent, LedgerKind } from "@shelfie/core";
import { DEFAULT_EXPLORER, txUrl } from "./explorer.js";
import type { ExplorerBases } from "./explorer.js";

/** prevHash of the first entry. */
export const GENESIS_HASH = "0".repeat(64);

/** Deterministic JSON: object keys sorted, undefined dropped. */
export function canonicalJson(value: unknown): string {
  if (value === undefined) return "null";
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((v) => canonicalJson(v)).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`).join(",")}}`;
}

export function sha256Hex(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

/** Hash of one entry; the next entry carries it as `prevHash`. */
export function entryHash(entry: LedgerEvent): string {
  return sha256Hex(canonicalJson(entry));
}

export interface AppendInput {
  kind: LedgerKind;
  /** Ids (job, task, submission ...). Together with `kind` and `txHash` this is the natural key. */
  refs: Record<string, string>;
  txHash?: string | undefined;
  note?: string | undefined;
  flags?: Record<string, boolean> | undefined;
  /** Optional extra data that is hashed into `payloadHash` but not stored. No secrets, no bytes. */
  payload?: unknown;
}

export interface AppendResult {
  entry: LedgerEvent;
  /** False when the same (kind, refs, txHash) was already in the ledger: nothing was written. */
  appended: boolean;
}

export interface LedgerOptions {
  path: string;
  clock?: Clock;
  explorer?: ExplorerBases;
}

function naturalKey(
  kind: string,
  refs: Record<string, string>,
  txHash: string | undefined,
): string {
  return canonicalJson({ kind, refs, txHash: txHash ?? null });
}

export type VerifyFailureReason =
  | "unparseable_line"
  | "schema_violation"
  | "seq_gap"
  | "prev_hash_mismatch"
  | "duplicate_natural_key";

export interface VerifyResult {
  ok: boolean;
  entries: number;
  /** Hash of the last entry ("head"); publish it to anchor the ledger. */
  headHash: string;
  failure?: { line: number; seq: number | null; reason: VerifyFailureReason };
}

/** Parse and chain-check JSONL text. Pure; used by the writer on load and by `verifyLedger`. */
export function verifyLedgerText(text: string): VerifyResult & { events: LedgerEvent[] } {
  const events: LedgerEvent[] = [];
  let prev = GENESIS_HASH;
  const seen = new Set<string>();
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i] ?? "";
    if (raw.trim() === "") continue;
    const line = i + 1;
    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      return {
        ok: false,
        entries: events.length,
        headHash: prev,
        events,
        failure: { line, seq: null, reason: "unparseable_line" },
      };
    }
    const parsed = LedgerEventSchema.safeParse(json);
    if (!parsed.success) {
      return {
        ok: false,
        entries: events.length,
        headHash: prev,
        events,
        failure: { line, seq: null, reason: "schema_violation" },
      };
    }
    const ev = parsed.data;
    if (ev.seq !== events.length + 1) {
      return {
        ok: false,
        entries: events.length,
        headHash: prev,
        events,
        failure: { line, seq: ev.seq, reason: "seq_gap" },
      };
    }
    if (ev.prevHash !== prev) {
      return {
        ok: false,
        entries: events.length,
        headHash: prev,
        events,
        failure: { line, seq: ev.seq, reason: "prev_hash_mismatch" },
      };
    }
    const key = naturalKey(ev.kind, ev.refs, ev.txHash);
    if (seen.has(key)) {
      return {
        ok: false,
        entries: events.length,
        headHash: prev,
        events,
        failure: { line, seq: ev.seq, reason: "duplicate_natural_key" },
      };
    }
    seen.add(key);
    events.push(ev);
    prev = entryHash(ev);
  }
  return { ok: true, entries: events.length, headHash: prev, events };
}

/** Chain check of a ledger file. A missing file is an empty, valid ledger. Never writes. */
export function verifyLedger(path: string): VerifyResult {
  if (!existsSync(path)) return { ok: true, entries: 0, headHash: GENESIS_HASH };
  const { events: _events, ...result } = verifyLedgerText(readFileSync(path, "utf8"));
  return result;
}

type Listener = (entry: LedgerEvent) => void;

/**
 * Append-only writer/reader. seq starts at 1. Each entry's `prevHash` is the hash of the previous
 * entry. The file is only ever opened for append; it is never truncated, rewritten or reset.
 * A file that fails verification on load makes the constructor throw (the file is left as is).
 */
export class Ledger {
  private readonly path: string;
  private readonly clock: Clock;
  private readonly explorer: ExplorerBases;
  private events: LedgerEvent[] = [];
  private keys = new Set<string>();
  private head = GENESIS_HASH;
  private readonly listeners = new Set<Listener>();

  constructor(opts: LedgerOptions) {
    this.path = opts.path;
    this.clock = opts.clock ?? systemClock;
    this.explorer = opts.explorer ?? DEFAULT_EXPLORER;
    mkdirSync(dirname(this.path), { recursive: true });
    if (existsSync(this.path)) {
      const res = verifyLedgerText(readFileSync(this.path, "utf8"));
      if (!res.ok) {
        const f = res.failure;
        throw new Error(
          `Evidence ledger failed verification (${f?.reason ?? "unknown"} at line ${f?.line ?? 0}); refusing to append. The file was not modified.`,
        );
      }
      this.events = res.events;
      this.head = res.headHash;
      for (const e of res.events) this.keys.add(naturalKey(e.kind, e.refs, e.txHash));
    }
  }

  append(input: AppendInput): AppendResult {
    const key = naturalKey(input.kind, input.refs, input.txHash);
    if (this.keys.has(key)) {
      const existing = this.events.find((e) => naturalKey(e.kind, e.refs, e.txHash) === key);
      if (existing) return { entry: existing, appended: false };
    }
    const explorerUrl =
      input.txHash !== undefined ? txUrl(input.txHash, this.explorer.txBase) : undefined;
    const body = {
      kind: input.kind,
      refs: input.refs,
      txHash: input.txHash ?? null,
      note: input.note ?? "",
      flags: input.flags ?? {},
      payload: input.payload ?? null,
    };
    const entry: LedgerEvent = {
      seq: this.events.length + 1,
      ts: this.clock.nowIso(),
      kind: input.kind,
      refs: input.refs,
      ...(input.txHash !== undefined ? { txHash: input.txHash } : {}),
      ...(explorerUrl !== undefined ? { explorerUrl } : {}),
      payloadHash: sha256Hex(canonicalJson(body)),
      prevHash: this.head,
      note: input.note ?? "",
      flags: input.flags ?? {},
    };
    appendFileSync(this.path, `${JSON.stringify(entry)}\n`, { flag: "a", mode: 0o600 });
    this.events.push(entry);
    this.keys.add(key);
    this.head = entryHash(entry);
    for (const l of this.listeners) {
      try {
        l(entry);
      } catch {
        // a failing subscriber never breaks the ledger
      }
    }
    return { entry, appended: true };
  }

  /** Entries with seq greater than `afterSeq`, at most `limit`. */
  read(afterSeq = 0, limit = 200): LedgerEvent[] {
    return this.events.filter((e) => e.seq > afterSeq).slice(0, limit);
  }

  all(): readonly LedgerEvent[] {
    return this.events;
  }

  size(): number {
    return this.events.length;
  }

  headHash(): string {
    return this.head;
  }

  /** Subscribe to new entries (SSE). Returns the unsubscribe function. */
  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  filePath(): string {
    return this.path;
  }
}
