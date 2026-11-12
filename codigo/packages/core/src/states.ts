import { z } from "zod";
import { AppError } from "./errors.js";

// State machine tables for every entity (domain-model.md section 2).
// Transitions are keyed by event; guard conditions of the diagrams (for example "attempts < max")
// are expressed as separate events chosen by the caller.

export const JobStateSchema = z.enum([
  "RECEIVED",
  "COLLECTING",
  "DECIDING",
  "DELIVERABLE",
  "DELIVERED",
  "SETTLED",
  "WITHHELD",
  "REFUNDED",
  "REJECTED_INPUT",
  "CANCELLED",
]);
export type JobState = z.infer<typeof JobStateSchema>;

export const TaskStateSchema = z.enum([
  "OPEN",
  "CLAIMED",
  "SUBMITTED",
  "VERIFYING",
  "ACCEPTED",
  "PAID",
  "FAILED",
  "EXPIRED",
]);
export type TaskState = z.infer<typeof TaskStateSchema>;

export const ClaimStateSchema = z.enum(["ACTIVE", "USED", "EXPIRED", "RELEASED"]);
export type ClaimState = z.infer<typeof ClaimStateSchema>;

export const SubmissionStateSchema = z.enum([
  "RECEIVED",
  "VERIFYING",
  "VERIFY_RETRY",
  "PASSED",
  "REJECTED",
  "ERROR_FINAL",
]);
export type SubmissionState = z.infer<typeof SubmissionStateSchema>;

export const PayoutStateSchema = z.enum([
  "QUEUED",
  "SENDING",
  "SUBMITTED",
  "CONFIRMED",
  "UNKNOWN",
  "FAILED_FINAL",
]);
export type PayoutState = z.infer<typeof PayoutStateSchema>;

export const SettlementStateSchema = z.enum([
  "PENDING",
  "WITHHOLD",
  "DELIVER",
  "RESULT_SUBMITTED",
  "SETTLED",
  "WITHHELD",
  "REFUNDED",
]);
export type SettlementState = z.infer<typeof SettlementStateSchema>;

export interface Machine<S extends string, E extends string> {
  readonly name: string;
  readonly initial: S;
  readonly terminal: readonly S[];
  readonly table: { readonly [K in S]: { readonly [Ev in E]?: S } };
}

function machine<S extends string, E extends string>(m: Machine<S, E>): Machine<S, E> {
  return m;
}

export const jobMachine = machine<JobState, JobEvent>({
  name: "job",
  initial: "RECEIVED",
  terminal: ["REJECTED_INPUT", "CANCELLED", "SETTLED", "REFUNDED"],
  table: {
    RECEIVED: { tasks_planned: "COLLECTING", intake_rejected: "REJECTED_INPUT" },
    COLLECTING: {
      window_closed: "DECIDING",
      all_tasks_terminal: "DECIDING",
      admin_cancel: "CANCELLED",
    },
    DECIDING: { decide_deliver: "DELIVERABLE", decide_withhold: "WITHHELD" },
    DELIVERABLE: { shell_submitted: "DELIVERED" },
    DELIVERED: { settlement_observed: "SETTLED" },
    SETTLED: {},
    WITHHELD: { refund_observed: "REFUNDED" },
    REFUNDED: {},
    REJECTED_INPUT: {},
    CANCELLED: {},
  },
});
export type JobEvent =
  | "tasks_planned"
  | "intake_rejected"
  | "window_closed"
  | "all_tasks_terminal"
  | "admin_cancel"
  | "decide_deliver"
  | "decide_withhold"
  | "shell_submitted"
  | "settlement_observed"
  | "refund_observed";

export const taskMachine = machine<TaskState, TaskEvent>({
  name: "task",
  initial: "OPEN",
  terminal: ["PAID", "FAILED", "EXPIRED"],
  table: {
    OPEN: { claim: "CLAIMED", window_closed: "EXPIRED" },
    CLAIMED: {
      claim_expired: "OPEN",
      claim_released: "OPEN",
      photo_received: "SUBMITTED",
      window_closed: "EXPIRED",
    },
    SUBMITTED: { verify_started: "VERIFYING" },
    VERIFYING: {
      verdict_pass: "ACCEPTED",
      verdict_fail_retry: "OPEN", // verdict fail AND attempts < max
      verdict_fail_final: "FAILED", // verdict fail AND attempts = max
      verify_error_final: "OPEN", // ERROR_FINAL: not a worker fault, attempt not counted
    },
    ACCEPTED: { payout_confirmed: "PAID" },
    PAID: {},
    FAILED: {},
    EXPIRED: {},
  },
});
export type TaskEvent =
  | "claim"
  | "claim_expired"
  | "claim_released"
  | "photo_received"
  | "verify_started"
  | "verdict_pass"
  | "verdict_fail_retry"
  | "verdict_fail_final"
  | "verify_error_final"
  | "payout_confirmed"
  | "window_closed";

export const claimMachine = machine<ClaimState, ClaimEvent>({
  name: "claim",
  initial: "ACTIVE",
  terminal: ["USED", "EXPIRED", "RELEASED"],
  table: {
    ACTIVE: {
      submission_received: "USED",
      ttl_passed: "EXPIRED",
      worker_released: "RELEASED",
      location_tries_exhausted: "RELEASED",
    },
    USED: {},
    EXPIRED: {},
    RELEASED: {},
  },
});
export type ClaimEvent =
  "submission_received" | "ttl_passed" | "worker_released" | "location_tries_exhausted";

export const submissionMachine = machine<SubmissionState, SubmissionEvent>({
  name: "submission",
  initial: "RECEIVED",
  terminal: ["PASSED", "REJECTED", "ERROR_FINAL"],
  table: {
    RECEIVED: { verify_started: "VERIFYING" },
    VERIFYING: {
      transport_error: "VERIFY_RETRY",
      verdict_pass: "PASSED",
      verdict_fail: "REJECTED",
    },
    VERIFY_RETRY: { retry: "VERIFYING", retries_exhausted: "ERROR_FINAL" },
    PASSED: {},
    REJECTED: {},
    ERROR_FINAL: {},
  },
});
export type SubmissionEvent =
  | "verify_started"
  | "transport_error"
  | "retry"
  | "verdict_pass"
  | "verdict_fail"
  | "retries_exhausted";

export const payoutMachine = machine<PayoutState, PayoutEvent>({
  name: "payout",
  initial: "QUEUED",
  terminal: ["CONFIRMED"],
  table: {
    QUEUED: { dequeued: "SENDING", max_attempts: "FAILED_FINAL" },
    SENDING: { hash_obtained: "SUBMITTED", timeout_or_crash: "UNKNOWN" },
    SUBMITTED: { confirmed: "CONFIRMED", rejected_by_node: "FAILED_FINAL" },
    UNKNOWN: {
      reconcile_found: "SUBMITTED",
      // Double-payment guard: only legal with proof (see transition ctx).
      reconcile_proved_absent: "QUEUED",
      // Operator escape hatch (admin mark-paid, flagged in the ledger). verify Friday
      operator_mark_paid: "CONFIRMED",
    },
    // Operator actions from domain-model section 6.7. verify Friday
    FAILED_FINAL: { operator_retry: "QUEUED", operator_mark_paid: "CONFIRMED" },
    CONFIRMED: {},
  },
});
export type PayoutEvent =
  | "dequeued"
  | "max_attempts"
  | "hash_obtained"
  | "timeout_or_crash"
  | "confirmed"
  | "rejected_by_node"
  | "reconcile_found"
  | "reconcile_proved_absent"
  | "operator_mark_paid"
  | "operator_retry";

export const settlementMachine = machine<SettlementState, SettlementEvent>({
  name: "settlement",
  initial: "PENDING",
  terminal: ["SETTLED", "REFUNDED"],
  table: {
    PENDING: { decide_deliver: "DELIVER", decide_withhold: "WITHHOLD" },
    DELIVER: { result_submitted: "RESULT_SUBMITTED" },
    RESULT_SUBMITTED: { settled: "SETTLED" },
    WITHHOLD: { withheld: "WITHHELD" },
    WITHHELD: { refunded: "REFUNDED" },
    SETTLED: {},
    REFUNDED: {},
  },
});
export type SettlementEvent =
  "decide_deliver" | "decide_withhold" | "result_submitted" | "settled" | "withheld" | "refunded";

export const MACHINES = {
  job: jobMachine,
  task: taskMachine,
  claim: claimMachine,
  submission: submissionMachine,
  payout: payoutMachine,
  settlement: settlementMachine,
} as const;

export interface EntityStateMap {
  job: JobState;
  task: TaskState;
  claim: ClaimState;
  submission: SubmissionState;
  payout: PayoutState;
  settlement: SettlementState;
}
export interface EntityEventMap {
  job: JobEvent;
  task: TaskEvent;
  claim: ClaimEvent;
  submission: SubmissionEvent;
  payout: PayoutEvent;
  settlement: SettlementEvent;
}
export type EntityName = keyof EntityStateMap;

export interface TransitionContext {
  /**
   * Required (true) for payout `reconcile_proved_absent`: a reconcile succeeded and proved that
   * no transfer exists after the settling delay. Without it UNKNOWN -> QUEUED is refused.
   */
  reconcileProvedAbsent?: boolean;
}

/**
 * Returns the next state or throws AppError `invalid_transition` (409) on an illegal transition.
 * Pure: the caller persists the result.
 */
export function transition<K extends EntityName>(
  entity: K,
  from: EntityStateMap[K],
  event: EntityEventMap[K],
  ctx: TransitionContext = {},
): EntityStateMap[K] {
  const m = MACHINES[entity] as unknown as Machine<string, string>;
  const next = m.table[from]?.[event];
  if (next === undefined) {
    throw new AppError(
      "invalid_transition",
      `Illegal ${entity} transition: ${from} --${event}--> ?`,
      undefined,
      { entity, from, event },
    );
  }
  if (entity === "payout" && from === "UNKNOWN" && next === "QUEUED") {
    if (ctx.reconcileProvedAbsent !== true) {
      throw new AppError(
        "invalid_transition",
        "Payout UNKNOWN -> QUEUED requires a reconcile that proved no transfer exists.",
        undefined,
        { entity, from, event, rule: "no_unknown_to_queued_without_reconcile" },
      );
    }
  }
  return next as EntityStateMap[K];
}

/** True when `transition` would succeed (no throw). */
export function canTransition<K extends EntityName>(
  entity: K,
  from: EntityStateMap[K],
  event: EntityEventMap[K],
  ctx: TransitionContext = {},
): boolean {
  try {
    transition(entity, from, event, ctx);
    return true;
  } catch {
    return false;
  }
}

export function isTerminal<K extends EntityName>(entity: K, state: EntityStateMap[K]): boolean {
  return (MACHINES[entity].terminal as readonly string[]).includes(state);
}
