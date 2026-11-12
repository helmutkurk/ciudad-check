import { createHash } from "node:crypto";
import {
  AppError,
  newPayoutId,
  payoutIdempotencyKey,
  payoutMetadataTag,
  transition,
} from "@shelfie/core";
import type { Clock, IdGenerator, Payout } from "@shelfie/core";
import type { PayoutQueueAdmin } from "../seams.js";

/**
 * In-process payout queue for `FAKE_PAYMENTS=1`. Idempotent on taskId. Each `get` advances the
 * payout one step (QUEUED -> SENDING -> SUBMITTED -> CONFIRMED) through the core state machine, so
 * the engine's watcher exercises the real transitions. Hashes are visibly fake (`fake-payout-tx-`).
 */
export class FakePayoutQueue implements PayoutQueueAdmin {
  private readonly byId = new Map<string, Payout>();
  private readonly byTask = new Map<string, string>();
  private failFinal = 0;
  readonly enqueueCalls: string[] = [];

  constructor(
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}

  /** The next `n` payouts end in FAILED_FINAL (for operator-path tests). */
  failNext(n: number): void {
    this.failFinal = n;
  }

  enqueue(p: { taskId: string; toAddress: string; lovelace: string }): Promise<Payout> {
    this.enqueueCalls.push(p.taskId);
    const existingId = this.byTask.get(p.taskId);
    if (existingId !== undefined) return Promise.resolve(this.mustGet(existingId));
    const id = newPayoutId(this.ids);
    const payout: Payout = {
      id,
      taskId: p.taskId as Payout["taskId"],
      idempotencyKey: payoutIdempotencyKey(p.taskId),
      toAddress: p.toAddress,
      amount: p.lovelace,
      state: "QUEUED",
      txHash: null,
      metadataTag: payoutMetadataTag(id),
      attempts: 0,
      lastError: null,
      walletId: "fake-pay-1",
      sendingSince: null,
    };
    this.byId.set(id, payout);
    this.byTask.set(p.taskId, id);
    return Promise.resolve(payout);
  }

  get(id: string): Promise<Payout> {
    const cur = this.mustGet(id);
    let next = cur;
    switch (cur.state) {
      case "QUEUED":
        if (this.failFinal > 0) {
          this.failFinal--;
          next = {
            ...cur,
            state: transition("payout", "QUEUED", "max_attempts"),
            lastError: "fake: failed final",
          };
        } else {
          next = {
            ...cur,
            state: transition("payout", "QUEUED", "dequeued"),
            attempts: cur.attempts + 1,
            sendingSince: this.clock.nowIso(),
          };
        }
        break;
      case "SENDING":
        next = {
          ...cur,
          state: transition("payout", "SENDING", "hash_obtained"),
          txHash: `fake-payout-tx-${createHash("sha256").update(cur.id).digest("hex").slice(0, 16)}`,
        };
        break;
      case "SUBMITTED":
        next = { ...cur, state: transition("payout", "SUBMITTED", "confirmed") };
        break;
      default:
        break;
    }
    this.byId.set(id, next);
    return Promise.resolve(next);
  }

  reconcile(id: string): Promise<Payout> {
    return Promise.resolve(this.mustGet(id));
  }

  retry(id: string): Promise<Payout> {
    const cur = this.mustGet(id);
    const next: Payout = {
      ...cur,
      state: transition("payout", cur.state, "operator_retry"),
      lastError: null,
    };
    this.byId.set(id, next);
    return Promise.resolve(next);
  }

  markPaid(id: string, txHash: string): Promise<Payout> {
    const cur = this.mustGet(id);
    const next: Payout = {
      ...cur,
      state: transition("payout", cur.state, "operator_mark_paid"),
      txHash,
    };
    this.byId.set(id, next);
    return Promise.resolve(next);
  }

  queueDepth(): number {
    return [...this.byId.values()].filter((p) => p.state === "QUEUED" || p.state === "SENDING")
      .length;
  }

  private mustGet(id: string): Payout {
    const p = this.byId.get(id);
    if (!p) throw new AppError("not_found", "Payout not found.");
    return p;
  }
}
