import { describe, expect, it } from "vitest";
import { AppError } from "./errors.js";
import {
  MACHINES,
  canTransition,
  isTerminal,
  transition,
  type EntityName,
  type PayoutState,
} from "./states.js";

describe("state machines: legal transitions", () => {
  it("job happy path to SETTLED", () => {
    let s = MACHINES.job.initial;
    s = transition("job", s, "tasks_planned");
    expect(s).toBe("COLLECTING");
    s = transition("job", s, "window_closed");
    s = transition("job", s, "decide_deliver");
    s = transition("job", s, "shell_submitted");
    s = transition("job", s, "settlement_observed");
    expect(s).toBe("SETTLED");
    expect(isTerminal("job", s)).toBe(true);
  });

  it("job withheld path to REFUNDED", () => {
    let s = transition("job", "DECIDING", "decide_withhold");
    expect(s).toBe("WITHHELD");
    s = transition("job", s, "refund_observed");
    expect(s).toBe("REFUNDED");
  });

  it("job intake rejection and cancel", () => {
    expect(transition("job", "RECEIVED", "intake_rejected")).toBe("REJECTED_INPUT");
    expect(transition("job", "COLLECTING", "admin_cancel")).toBe("CANCELLED");
  });

  it("task: claim, expire back to open, verify, accept, pay", () => {
    expect(transition("task", "OPEN", "claim")).toBe("CLAIMED");
    expect(transition("task", "CLAIMED", "claim_expired")).toBe("OPEN");
    expect(transition("task", "CLAIMED", "claim_released")).toBe("OPEN");
    expect(transition("task", "CLAIMED", "photo_received")).toBe("SUBMITTED");
    expect(transition("task", "SUBMITTED", "verify_started")).toBe("VERIFYING");
    expect(transition("task", "VERIFYING", "verdict_pass")).toBe("ACCEPTED");
    expect(transition("task", "ACCEPTED", "payout_confirmed")).toBe("PAID");
  });

  it("task: failed verdict retries or ends depending on attempts", () => {
    expect(transition("task", "VERIFYING", "verdict_fail_retry")).toBe("OPEN");
    expect(transition("task", "VERIFYING", "verdict_fail_final")).toBe("FAILED");
    expect(transition("task", "VERIFYING", "verify_error_final")).toBe("OPEN");
  });

  it("task: window close expires OPEN and CLAIMED only", () => {
    expect(transition("task", "OPEN", "window_closed")).toBe("EXPIRED");
    expect(transition("task", "CLAIMED", "window_closed")).toBe("EXPIRED");
    expect(canTransition("task", "ACCEPTED", "window_closed")).toBe(false);
  });

  it("claim and submission", () => {
    expect(transition("claim", "ACTIVE", "submission_received")).toBe("USED");
    expect(transition("claim", "ACTIVE", "ttl_passed")).toBe("EXPIRED");
    expect(transition("claim", "ACTIVE", "worker_released")).toBe("RELEASED");
    expect(transition("claim", "ACTIVE", "location_tries_exhausted")).toBe("RELEASED");
    expect(transition("submission", "RECEIVED", "verify_started")).toBe("VERIFYING");
    expect(transition("submission", "VERIFYING", "transport_error")).toBe("VERIFY_RETRY");
    expect(transition("submission", "VERIFY_RETRY", "retry")).toBe("VERIFYING");
    expect(transition("submission", "VERIFY_RETRY", "retries_exhausted")).toBe("ERROR_FINAL");
    expect(transition("submission", "VERIFYING", "verdict_pass")).toBe("PASSED");
    expect(transition("submission", "VERIFYING", "verdict_fail")).toBe("REJECTED");
  });

  it("payout happy path and crash path", () => {
    let s: PayoutState = transition("payout", "QUEUED", "dequeued");
    s = transition("payout", s, "hash_obtained");
    s = transition("payout", s, "confirmed");
    expect(s).toBe("CONFIRMED");
    expect(transition("payout", "SENDING", "timeout_or_crash")).toBe("UNKNOWN");
    expect(transition("payout", "UNKNOWN", "reconcile_found")).toBe("SUBMITTED");
    expect(transition("payout", "QUEUED", "max_attempts")).toBe("FAILED_FINAL");
    expect(transition("payout", "SUBMITTED", "rejected_by_node")).toBe("FAILED_FINAL");
  });

  it("settlement", () => {
    expect(transition("settlement", "PENDING", "decide_deliver")).toBe("DELIVER");
    expect(transition("settlement", "DELIVER", "result_submitted")).toBe("RESULT_SUBMITTED");
    expect(transition("settlement", "RESULT_SUBMITTED", "settled")).toBe("SETTLED");
    expect(transition("settlement", "PENDING", "decide_withhold")).toBe("WITHHOLD");
    expect(transition("settlement", "WITHHOLD", "withheld")).toBe("WITHHELD");
    expect(transition("settlement", "WITHHELD", "refunded")).toBe("REFUNDED");
  });
});

describe("state machines: illegal transitions", () => {
  it("throws AppError invalid_transition with details", () => {
    try {
      transition("task", "OPEN", "verdict_pass");
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      const e = err as AppError;
      expect(e.code).toBe("invalid_transition");
      expect(e.status).toBe(409);
      expect(e.details).toMatchObject({ entity: "task", from: "OPEN", event: "verdict_pass" });
    }
  });

  it("terminal states have no outgoing transitions", () => {
    for (const name of Object.keys(MACHINES) as EntityName[]) {
      const m = MACHINES[name];
      for (const t of m.terminal) {
        const outgoing = Object.keys(m.table[t as keyof typeof m.table]);
        // PAYOUT CONFIRMED and job/settlement terminals are dead ends
        expect(outgoing, `${name}.${t}`).toEqual([]);
      }
    }
  });

  it("rejects skipping states", () => {
    expect(canTransition("job", "RECEIVED", "decide_deliver")).toBe(false);
    expect(canTransition("job", "WITHHELD", "shell_submitted")).toBe(false);
    expect(canTransition("task", "SUBMITTED", "verdict_pass")).toBe(false);
    expect(canTransition("claim", "USED", "ttl_passed")).toBe(false);
    expect(canTransition("submission", "PASSED", "verdict_fail")).toBe(false);
    expect(canTransition("payout", "QUEUED", "confirmed")).toBe(false);
    expect(canTransition("payout", "SENDING", "confirmed")).toBe(false);
    expect(canTransition("settlement", "PENDING", "settled")).toBe(false);
  });

  it("every table target is a known state of the same machine", () => {
    for (const name of Object.keys(MACHINES) as EntityName[]) {
      const table = MACHINES[name].table as Record<string, Record<string, string>>;
      const states = new Set(Object.keys(table));
      for (const [from, events] of Object.entries(table)) {
        for (const [ev, to] of Object.entries(events)) {
          expect(states.has(to), `${name}: ${from} --${ev}--> ${to}`).toBe(true);
        }
      }
    }
  });
});

describe("payout double-payment guard", () => {
  it("refuses UNKNOWN -> QUEUED without a reconcile proof", () => {
    expect(() => transition("payout", "UNKNOWN", "reconcile_proved_absent")).toThrow(AppError);
    expect(() =>
      transition("payout", "UNKNOWN", "reconcile_proved_absent", { reconcileProvedAbsent: false }),
    ).toThrow(/reconcile/);
  });

  it("allows UNKNOWN -> QUEUED only with proof", () => {
    expect(
      transition("payout", "UNKNOWN", "reconcile_proved_absent", { reconcileProvedAbsent: true }),
    ).toBe("QUEUED");
  });

  it("has no other path from UNKNOWN to QUEUED", () => {
    const events = MACHINES.payout.table.UNKNOWN;
    const toQueued = Object.entries(events).filter(([, to]) => to === "QUEUED");
    expect(toQueued.map(([ev]) => ev)).toEqual(["reconcile_proved_absent"]);
    expect(canTransition("payout", "UNKNOWN", "dequeued")).toBe(false);
    expect(canTransition("payout", "UNKNOWN", "operator_retry")).toBe(false);
  });
});
