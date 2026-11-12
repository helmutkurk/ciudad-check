import { closeSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, writeSync } from "node:fs";
import { dirname } from "node:path";
import { PayoutSchema } from "@shelfie/core";
import type { Payout, PayoutState } from "@shelfie/core";
import { z } from "zod";

// Persistence port for the payout queue. The engine can pass its own store (backed by its event
// log); these two implementations serve tests (memory) and standalone runs (file).
// Contract: `update` is durable when its promise resolves (write-ahead). `insert` is atomic on
// the unique idempotency key.

export interface PayoutStore {
  getByKey(idempotencyKey: string): Promise<Payout | null>;
  get(id: string): Promise<Payout | null>;
  /** Insert unless the idempotency key exists; returns the stored payout either way. */
  insert(payout: Payout): Promise<{ payout: Payout; created: boolean }>;
  update(payout: Payout): Promise<void>;
  /** In insertion order (FIFO). */
  list(states?: readonly PayoutState[]): Promise<Payout[]>;
}

export class InMemoryPayoutStore implements PayoutStore {
  protected readonly byId = new Map<string, Payout>();
  protected readonly byKey = new Map<string, string>();

  getByKey(key: string): Promise<Payout | null> {
    const id = this.byKey.get(key);
    return Promise.resolve(id ? (this.byId.get(id) ?? null) : null);
  }

  get(id: string): Promise<Payout | null> {
    return Promise.resolve(this.byId.get(id) ?? null);
  }

  insert(payout: Payout): Promise<{ payout: Payout; created: boolean }> {
    const existingId = this.byKey.get(payout.idempotencyKey);
    if (existingId) {
      return Promise.resolve({ payout: this.mustGet(existingId), created: false });
    }
    this.byId.set(payout.id, { ...payout });
    this.byKey.set(payout.idempotencyKey, payout.id);
    return this.afterWrite().then(() => ({ payout: { ...payout }, created: true }));
  }

  update(payout: Payout): Promise<void> {
    if (!this.byId.has(payout.id)) return Promise.reject(new Error("payout not found"));
    this.byId.set(payout.id, { ...payout });
    return this.afterWrite();
  }

  list(states?: readonly PayoutState[]): Promise<Payout[]> {
    const all = [...this.byId.values()].map((p) => ({ ...p }));
    return Promise.resolve(states ? all.filter((p) => states.includes(p.state)) : all);
  }

  /** Hook for subclasses (file flush, fault injection in tests). */
  protected afterWrite(): Promise<void> {
    return Promise.resolve();
  }

  private mustGet(id: string): Payout {
    const p = this.byId.get(id);
    if (!p) throw new Error("payout index corrupted");
    return { ...p };
  }
}

const FileSchema = z.array(PayoutSchema);

/** JSON snapshot store: every write is flushed (fsync) and renamed atomically. Single process. */
export class FilePayoutStore extends InMemoryPayoutStore {
  constructor(private readonly path: string) {
    super();
    let raw: string | null = null;
    try {
      raw = readFileSync(path, "utf8");
    } catch {
      raw = null; // missing file: start empty
    }
    if (raw !== null) {
      // A corrupt file is never silently replaced: that could forget a payout in flight.
      let parsed: Payout[];
      try {
        parsed = FileSchema.parse(JSON.parse(raw));
      } catch {
        throw new Error(`payout store file is unreadable: ${path}`);
      }
      for (const p of parsed) {
        this.byId.set(p.id, p);
        this.byKey.set(p.idempotencyKey, p.id);
      }
    }
  }

  protected override afterWrite(): Promise<void> {
    mkdirSync(dirname(this.path), { recursive: true });
    const tmp = `${this.path}.tmp`;
    const fd = openSync(tmp, "w", 0o600);
    try {
      writeSync(fd, JSON.stringify([...this.byId.values()]));
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    renameSync(tmp, this.path);
    return Promise.resolve();
  }
}
