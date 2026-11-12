import { createHash } from "node:crypto";
import { AppError, GATES_OBSERVED, GATES_OUT_OF_STOCK } from "@shelfie/core";
import type {
  Clock,
  GateResult,
  PayoutAdapter,
  ReasonCode,
  VerifyClient,
  VerifyRequest,
  VerifyResponse,
} from "@shelfie/core";
import { systemClock } from "@shelfie/core";

// Fakes first: FAKE_PAYMENTS=1 and the payout fault-injection tests run on these. Fake hashes
// never look like real ones (see isRealTxHash), so a fake can not be pasted into evidence.

// ---------------------------------------------------------------- payout adapter
export type PayoutFault =
  /** Transfer is recorded on the fake chain, then the call times out (outcome unknown). */
  | "timeout_after_send"
  /** Call times out and nothing was sent. */
  | "timeout_before_send"
  /** The process dies after write-ahead and before anything is sent (generic error, nothing sent). */
  | "crash_before_send"
  /** Transfer is recorded, then the process dies: the caller never sees the hash. */
  | "crash_after_send"
  /** Wallet cannot build the transfer: provably not sent. */
  | "insufficient_funds";

export interface FakeChainTx {
  txHash: string;
  toAddress: string;
  lovelace: string;
  metadataTag: string;
  atMs: number;
}

export interface FakePayoutAdapterOptions {
  clock?: Clock;
  balanceLovelace?: string;
  feeLovelace?: string;
  /** Confirmations reported for a tx once "mined". Default 1 (confirmed on first poll). */
  confirmations?: number;
}

export class FakePayoutAdapter implements PayoutAdapter {
  readonly chain: FakeChainTx[] = [];
  sendCalls = 0;
  inFlight = 0;
  maxInFlight = 0;
  /** Latency of send(), in real milliseconds; lets tests prove concurrency 1. */
  sendDelayMs = 0;
  /** When true, find() throws (inconclusive reconcile). */
  findFails = false;
  private readonly faults: PayoutFault[] = [];
  private readonly rejected = new Set<string>();
  private balanceValue: bigint;
  private readonly clock: Clock;
  private readonly fee: bigint;
  private readonly conf: number;

  constructor(opts: FakePayoutAdapterOptions = {}) {
    this.clock = opts.clock ?? systemClock;
    this.balanceValue = BigInt(opts.balanceLovelace ?? "100000000");
    this.fee = BigInt(opts.feeLovelace ?? "200000");
    this.conf = opts.confirmations ?? 1;
  }

  /** Queue a fault for the next send() call(s), in order. */
  injectFault(...faults: PayoutFault[]): void {
    this.faults.push(...faults);
  }

  setBalance(lovelace: string): void {
    this.balanceValue = BigInt(lovelace);
  }

  /** Make confirmations() report the tx as rejected (-1). */
  rejectTx(txHash: string): void {
    this.rejected.add(txHash);
  }

  txsFor(taskOrTagPart: string): FakeChainTx[] {
    return this.chain.filter((t) => t.metadataTag.includes(taskOrTagPart));
  }

  async send(args: {
    toAddress: string;
    lovelace: string;
    metadataTag: string;
  }): Promise<{ txHash: string }> {
    this.sendCalls++;
    this.inFlight++;
    this.maxInFlight = Math.max(this.maxInFlight, this.inFlight);
    try {
      if (this.sendDelayMs > 0) await new Promise((r) => setTimeout(r, this.sendDelayMs));
      const fault = this.faults.shift();
      if (fault === "insufficient_funds") {
        throw new AppError("dependency_unavailable", "Wallet cannot fund the transfer.", undefined, {
          reason: "insufficient_funds",
          notSent: true,
        });
      }
      if (fault === "timeout_before_send") throw timeout();
      if (fault === "crash_before_send") throw new Error("simulated crash before send");
      const needed = BigInt(args.lovelace) + this.fee;
      if (this.balanceValue < needed) {
        throw new AppError("dependency_unavailable", "Wallet cannot fund the transfer.", undefined, {
          reason: "insufficient_funds",
          notSent: true,
        });
      }
      this.balanceValue -= needed;
      const txHash = fakeTxHash("fake", this.chain.length + 1);
      this.chain.push({
        txHash,
        toAddress: args.toAddress,
        lovelace: args.lovelace,
        metadataTag: args.metadataTag,
        atMs: this.clock.nowMs(),
      });
      if (fault === "timeout_after_send") throw timeout();
      if (fault === "crash_after_send") throw new Error("simulated crash after send");
      return { txHash };
    } finally {
      this.inFlight--;
    }
  }

  find(args: { metadataTag: string; sinceIso: string }): Promise<{ txHash: string } | null> {
    if (this.findFails) return Promise.reject(timeout());
    const since = Date.parse(args.sinceIso);
    const hit = this.chain.find((t) => t.metadataTag === args.metadataTag && t.atMs >= since - 60_000);
    return Promise.resolve(hit ? { txHash: hit.txHash } : null);
  }

  confirmations(txHash: string): Promise<number> {
    if (this.rejected.has(txHash)) return Promise.resolve(-1);
    return Promise.resolve(this.chain.some((t) => t.txHash === txHash) ? this.conf : 0);
  }

  balance(): Promise<string> {
    return Promise.resolve(this.balanceValue.toString());
  }
}

function timeout(): AppError {
  return new AppError("dependency_unavailable", "Timed out.", undefined, { reason: "timeout" });
}

export function fakeTxHash(kind: string, n: number): string {
  return `${kind}_tx_${String(n).padStart(6, "0")}`;
}

// ---------------------------------------------------------------- verify client
export interface FakeVerdictOptions {
  pass?: boolean;
  /** Failing gates with their reason codes. Defaults to code_match / code_mismatch. */
  failures?: { gate: GateResult["name"]; reasonCode: ReasonCode }[];
  workerMessage?: string;
}

/** Scripted verdict shaped like a real VerifyResponse. */
export function fakeVerdict(req: VerifyRequest, opts: FakeVerdictOptions = {}): VerifyResponse {
  const pass = opts.pass ?? true;
  const failures = pass
    ? []
    : (opts.failures ?? [{ gate: "code_match" as const, reasonCode: "code_mismatch" as const }]);
  const names = req.task.outcome === "OBSERVED" ? GATES_OBSERVED : GATES_OUT_OF_STOCK;
  const gates: GateResult[] = names.map((name) => {
    const f = failures.find((x) => x.gate === name);
    return f ? { name, pass: false, reasonCode: f.reasonCode } : { name, pass: true };
  });
  return {
    submissionId: req.submissionId,
    outcome: req.task.outcome,
    pass,
    gates,
    failedGates: gates.filter((g) => !g.pass).map((g) => g.name),
    extraction: { fake: true },
    workerMessage: opts.workerMessage ?? (pass ? "Verified. (fake)" : "Not accepted. (fake)"),
    model: { provider: "fake", id: "fake", latencyMs: 0 },
    cached: false,
  };
}

export interface FakeVerifyClientOptions {
  /** Decide the verdict per request; throw an AppError to simulate a failure. */
  script?: (req: VerifyRequest, key: string) => VerifyResponse | Promise<VerifyResponse>;
}

/** Scripted, idempotent per key (the same key never "pays" twice). */
export class FakeVerifyClient implements VerifyClient {
  readonly calls: { key: string; req: VerifyRequest }[] = [];
  private readonly results = new Map<string, { verdict: VerifyResponse; txHash: string }>();
  private readonly failures: Error[] = [];

  constructor(private readonly opts: FakeVerifyClientOptions = {}) {}

  /** Make the next verify() throw (consumed once). */
  failNext(err: Error = new AppError("dependency_unavailable", "Verifier unavailable.")): void {
    this.failures.push(err);
  }

  get paidCount(): number {
    return this.results.size;
  }

  async verify(
    req: VerifyRequest,
    key: string,
  ): Promise<{ verdict: VerifyResponse; txHash: string; receipt: unknown }> {
    this.calls.push({ key, req });
    const failure = this.failures.shift();
    if (failure !== undefined) throw failure;
    const hit = this.results.get(key);
    if (hit) {
      return { verdict: { ...hit.verdict, cached: true }, txHash: hit.txHash, receipt: { fake: true } };
    }
    const verdict = this.opts.script ? await this.opts.script(req, key) : fakeVerdict(req);
    const txHash = fakeTxHash("fake_verify", this.results.size + 1);
    this.results.set(key, { verdict, txHash });
    return { verdict, txHash, receipt: { fake: true } };
  }
}

/** Stable fake hash derived from a key (for engines that want determinism across restarts). */
export function fakeTxHashForKey(key: string): string {
  return `fake_tx_${createHash("sha256").update(key).digest("hex").slice(0, 24)}`;
}

