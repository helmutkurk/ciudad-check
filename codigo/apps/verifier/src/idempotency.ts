import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { VerifyResponseSchema } from "@shelfie/core";
import type { Clock, Logger, VerifyResponse } from "@shelfie/core";
import { z } from "zod";

// Idempotency cache (contracts.md 3.1): same Idempotency-Key -> same verdict, one model call.
// In-memory with optional JSON file persistence; concurrent calls with one key share one
// computation (the x402 handler can run more than once on retries). Errors are not cached.
// Image bytes are never stored; the verdict holds the extraction only.

const FileSchema = z.object({
  entries: z.array(
    z.object({
      key: z.string(),
      bodyHash: z.string(),
      storedAtMs: z.number(),
      verdict: VerifyResponseSchema,
    }),
  ),
});

interface Entry {
  bodyHash: string;
  storedAtMs: number;
  verdict: VerifyResponse;
}

export class IdempotencyConflict extends Error {}

export interface IdempotencyOptions {
  clock: Clock;
  ttlSec: number;
  path?: string | undefined;
  logger?: Logger | undefined;
  maxEntries?: number;
}

export class IdempotencyCache {
  private readonly entries = new Map<string, Entry>();
  private readonly inflight = new Map<string, { bodyHash: string; promise: Promise<VerifyResponse> }>();

  constructor(private readonly opts: IdempotencyOptions) {
    this.load();
  }

  get size(): number {
    return this.entries.size;
  }

  /**
   * Returns the cached verdict (cached: true) or runs `compute` once per key.
   * Throws IdempotencyConflict when the key was used with a different request body.
   */
  async run(
    key: string,
    bodyHash: string,
    compute: () => Promise<VerifyResponse>,
  ): Promise<VerifyResponse> {
    this.evictExpired();
    const hit = this.entries.get(key);
    if (hit) {
      if (hit.bodyHash !== bodyHash) throw new IdempotencyConflict();
      return { ...hit.verdict, cached: true };
    }
    const pending = this.inflight.get(key);
    if (pending) {
      if (pending.bodyHash !== bodyHash) throw new IdempotencyConflict();
      return { ...(await pending.promise), cached: true };
    }
    const promise = compute();
    this.inflight.set(key, { bodyHash, promise });
    try {
      const verdict = await promise;
      this.entries.set(key, {
        bodyHash,
        storedAtMs: this.opts.clock.nowMs(),
        verdict: { ...verdict, cached: false },
      });
      this.persist();
      return verdict;
    } finally {
      this.inflight.delete(key);
    }
  }

  private evictExpired(): void {
    const cutoff = this.opts.clock.nowMs() - this.opts.ttlSec * 1000;
    let changed = false;
    for (const [k, e] of this.entries) {
      if (e.storedAtMs < cutoff) {
        this.entries.delete(k);
        changed = true;
      }
    }
    const max = this.opts.maxEntries ?? 5000;
    while (this.entries.size > max) {
      const oldest = this.entries.keys().next();
      if (oldest.done) break;
      this.entries.delete(oldest.value);
      changed = true;
    }
    if (changed) this.persist();
  }

  private load(): void {
    const path = this.opts.path;
    if (!path) return;
    try {
      const parsed = FileSchema.safeParse(JSON.parse(readFileSync(path, "utf8")));
      if (!parsed.success) {
        this.opts.logger?.warn("idempotency cache file ignored (schema mismatch)");
        return;
      }
      for (const e of parsed.data.entries) {
        this.entries.set(e.key, { bodyHash: e.bodyHash, storedAtMs: e.storedAtMs, verdict: e.verdict });
      }
    } catch {
      // missing or unreadable file: start empty
    }
  }

  private persist(): void {
    const path = this.opts.path;
    if (!path) return;
    try {
      mkdirSync(dirname(path), { recursive: true });
      const body = {
        entries: [...this.entries].map(([key, e]) => ({ key, ...e })),
      };
      const tmp = `${path}.tmp`;
      writeFileSync(tmp, JSON.stringify(body), { mode: 0o600 });
      renameSync(tmp, path);
    } catch (err) {
      this.opts.logger?.warn("idempotency cache could not be written", {
        reason: err instanceof Error ? err.name : "unknown",
      });
    }
  }
}
