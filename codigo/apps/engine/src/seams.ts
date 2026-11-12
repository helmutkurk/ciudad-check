import type { Payout, PayoutQueue } from "@shelfie/core";

/**
 * Optional operator actions the real payout queue may offer on top of the core `PayoutQueue` port
 * (domain-model section 6.7). The core port only has enqueue/get/reconcile.
 * TODO(integration): confirm names with `@shelfie/payments` (owner B); the engine degrades to a
 * 503 `dependency_unavailable` for retry when `retry` is missing.
 */
export interface PayoutQueueAdmin extends PayoutQueue {
  retry?(id: string): Promise<Payout>;
  markPaid?(id: string, txHash: string): Promise<Payout>;
  queueDepth?(): number;
  /** Real queue: advance SUBMITTED payouts to CONFIRMED. The engine calls it every few seconds. */
  pollConfirmations?(): Promise<void>;
  /** Real queue: start-up recovery (SENDING -> UNKNOWN -> reconcile). */
  recover?(): Promise<void>;
  status?(): Promise<{ depth: number }>;
}

/** Read-only probes for GET /api/health. */
export interface HealthProbe {
  payBalanceLovelace(): Promise<string>;
  /** null = unknown (not configured or lookup failed). */
  vbuyBalanceLovelace(): Promise<string | null>;
  payQueueDepth(): number;
  verifierUp(): Promise<boolean>;
}
