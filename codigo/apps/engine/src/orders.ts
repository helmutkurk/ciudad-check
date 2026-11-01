import { createHash } from "node:crypto";
import {
  AppError,
  BrandIdSchema,
  BrandProfileSchema,
  CreateOrderRequestSchema,
  DEMO_BRAND_ID,
  OrderIdSchema,
  OrderIdempotencyKeySchema,
  parseOrThrow,
} from "@shelfie/core";
import type {
  BrandProfile,
  BrandSummary,
  BrandTransaction,
  Clock,
  EngineEnv,
  IdGenerator,
  JobView,
  OrderRecord,
  OrderResult,
  OrderView,
} from "@shelfie/core";
import { txUrl } from "@shelfie/evidence";
import type { Engine } from "./engine.js";
import type { SokosumiClient } from "./sokosumi.js";
import type { Store } from "./store.js";

interface OrderDeps {
  engine: Engine;
  env: EngineEnv;
  store: Store;
  clock: Clock;
  ids: IdGenerator;
  client: SokosumiClient;
}

/** Owner of an order; records written before per-brand codes belong to the demo brand. */
const ownerOf = (order: OrderRecord): string => order.brandId ?? DEMO_BRAND_ID;

type CheckKind = "passed" | "failed" | "timed_out" | "open" | "other";

/**
 * One store check as the brand sees it: passed (decision DELIVER), failed (withheld and a photo was
 * rejected), timed out (withheld with no rejected photo), open (still running), other (cancelled
 * or rejected input; not counted).
 */
function classify(view: JobView): CheckKind {
  const state = view.job.state;
  if (state === "DELIVERABLE" || state === "DELIVERED" || state === "SETTLED") return "passed";
  if (state === "WITHHELD" || state === "REFUNDED")
    return view.tasks.some((t) => t.state === "FAILED") ? "failed" : "timed_out";
  if (state === "CANCELLED" || state === "REJECTED_INPUT") return "other";
  return "open";
}

export class Orders {
  private readonly active = new Set<string>();
  /** Last price lookup per store check (`orderId:storeId`, epoch ms). */
  private readonly priceLookups = new Map<string, number>();
  constructor(private readonly d: OrderDeps) {}

  async create(body: unknown, key: string | undefined, brandId: string): Promise<OrderView> {
    const req = parseOrThrow(CreateOrderRequestSchema, body);
    const brand = parseOrThrow(BrandIdSchema, brandId);
    if (
      this.d.env.SOKOSUMI_CLIENT === "fake" &&
      (!this.d.env.FAKE_PAYMENTS ||
        (this.d.env.VERIFY_CLIENT ?? "fake") !== "fake" ||
        this.d.env.EVIDENCE_RUN_LOCKED)
    ) {
      throw new AppError(
        "forbidden",
        "Fake orders require fake payments and verifier, outside evidence runs.",
      );
    }
    const requestHash = createHash("sha256")
      .update(
        JSON.stringify({
          productEan: req.productEan,
          storeIds: [...req.storeIds].sort(),
          note: req.note ?? "",
        }),
      )
      .digest("hex");
    if (key !== undefined) {
      parseOrThrow(OrderIdempotencyKeySchema, key);
      const prior = this.d.store.orders.all().find((o) => o.idempotencyKey === key);
      if (prior) {
        // A key used by another brand is treated like a key used for a different order.
        if (ownerOf(prior) !== brand || prior.requestHash !== requestHash)
          throw new AppError(
            "invalid_request",
            "Idempotency key already used for a different order.",
            409,
          );
        if (
          prior.jobs.some((j) => j.status === "SOKOSUMI_UNAVAILABLE" || j.status === "SUBMITTING")
        )
          throw this.unavailable(prior.id);
        return this.get(prior.id, brand);
      }
    }
    if (req.storeIds.length > this.d.env.ORDER_MAX_STORES)
      throw new AppError("order_cap_reached", "Too many stores in one order.");
    const rejected = req.storeIds
      .map((storeId) => ({
        storeId,
        reasons: this.d.engine.intakeReasons({
          productEan: req.productEan,
          stores: [{ id: storeId }],
        }),
      }))
      .filter((s) => s.reasons.length > 0);
    if (rejected.length > 0)
      throw new AppError(
        "intake_rejected",
        "Some stores or the product are outside the supported catalog.",
        422,
        { stores: rejected },
      );
    const now = this.d.clock.nowIso();
    const day = now.slice(0, 10);
    // BigInt prevents arithmetic overflow near the safe-integer env limit.
    const reserve = BigInt(req.storeIds.length) * BigInt(this.d.env.SOKOSUMI_MAX_CREDITS_PER_TASK);
    const spent = this.d.store.orders
      .all()
      .filter((o) => o.createdAt.slice(0, 10) === day)
      .reduce((sum, o) => sum + BigInt(o.reservedCredits), 0n);
    if (spent + reserve > BigInt(this.d.env.ORDER_DAILY_CREDIT_CAP))
      throw new AppError("daily_cap_reached", "Daily order credit cap reached.");
    let id: string;
    do {
      id = OrderIdSchema.parse(this.d.ids.next("ord"));
    } while (this.d.store.orders.get(id));
    const order: OrderRecord = {
      id,
      productEan: req.productEan,
      createdAt: now,
      fake: this.d.env.SOKOSUMI_CLIENT === "fake",
      idempotencyKey: key ?? `order-${id}`,
      requestHash,
      reservedCredits: Number(reserve),
      jobs: req.storeIds.map((storeId) => ({
        storeId,
        sokosumiTaskId: null,
        jobId: null,
        status: "SUBMITTING",
      })),
      brandId: brand,
    };
    // Synchronous durable reservation before the first await; concurrent requests see this spend.
    this.d.store.orders.put(order);
    this.active.add(id);
    for (const storeId of req.storeIds) {
      try {
        const { taskId, credits } = await this.d.client.createTask(
          {
            orderId: id,
            storeId,
            productEan: req.productEan,
            maxCredits: this.d.env.SOKOSUMI_MAX_CREDITS_PER_TASK,
          },
          (taskId) => {
            const current = this.must(id);
            this.d.store.orders.put({
              ...current,
              jobs: current.jobs.map((j) =>
                j.storeId === storeId ? { ...j, sokosumiTaskId: taskId } : j,
              ),
            });
          },
        );
        const current = this.must(id);
        const row = current.jobs.find((j) => j.storeId === storeId)!;
        if (row.sokosumiTaskId && row.sokosumiTaskId !== taskId) throw this.unavailable(id);
        this.d.store.orders.put({
          ...current,
          jobs: current.jobs.map((j) =>
            j.storeId === storeId
              ? {
                  ...j,
                  sokosumiTaskId: taskId,
                  status: "AWAITING_SHELL",
                  ...(credits !== undefined ? { credits } : {}),
                }
              : j,
          ),
        });
      } catch {
        const current = this.must(id);
        this.d.store.orders.put({
          ...current,
          jobs: current.jobs.map((j) =>
            j.status === "SUBMITTING" ? { ...j, status: "SOKOSUMI_UNAVAILABLE" } : j,
          ),
        });
        this.active.delete(id);
        throw this.unavailable(id);
      }
    }
    this.active.delete(id);
    return this.get(id, brand);
  }

  private unavailable(id: string): AppError {
    return new AppError(
      "sokosumi_unavailable",
      "Order outcome needs reconciliation. Do not place it again.",
      502,
      { orderId: id },
    );
  }
  private must(id: string): OrderRecord {
    const parsed = OrderIdSchema.safeParse(id);
    const order = parsed.success ? this.d.store.orders.get(parsed.data) : undefined;
    if (!order) throw new AppError("not_found", "Order not found.");
    return order;
  }
  /** Another brand's order is indistinguishable from a missing one (ADR-21). */
  private owned(id: string, brandId: string): OrderRecord {
    const order = this.must(id);
    if (ownerOf(order) !== brandId) throw new AppError("not_found", "Order not found.");
    return order;
  }
  get(id: string, brandId: string): OrderView {
    const order = this.owned(id, brandId);
    return {
      orderId: order.id,
      productEan: order.productEan,
      createdAt: order.createdAt,
      fake: order.fake,
      jobs: order.jobs.map((row) => {
        // Read-time derivation also sweeps job windows, using the engine's existing lifecycle.
        const job =
          row.jobId && this.d.store.jobs.get(row.jobId)
            ? this.d.engine.getJob(row.jobId)
            : undefined;
        const active = job?.job.state === "COLLECTING" ? job.tasks[0]?.state : undefined;
        return {
          ...row,
          ...(job ? { result: this.resultOf(job) } : {}),
          status:
            active ??
            job?.job.state ??
            (row.status === "SUBMITTING" && !this.active.has(id)
              ? "SOKOSUMI_UNAVAILABLE"
              : row.status),
        };
      }),
    };
  }
  /** Outcome of one store check, for the order view. Only ids and plain words, no photo data. */
  private resultOf(view: JobView): OrderResult {
    const kind = classify(view);
    const reportReady = view.job.reportMd !== null && view.job.reportMd !== "";
    if (kind === "passed") {
      const oos = view.tasks.some((t) => t.acceptedOutcome === "OUT_OF_STOCK");
      const priceEur = oos ? undefined : this.acceptedPrice(view);
      return {
        outcome: oos ? "out_of_stock" : "passed",
        ...(priceEur !== undefined ? { priceEur } : {}),
        reportReady,
      };
    }
    if (kind === "failed") {
      const reason = this.failureReason(view);
      return { outcome: "failed", ...(reason ? { reason } : {}), reportReady };
    }
    return { outcome: kind === "timed_out" ? "timed_out" : "open", reportReady };
  }

  private acceptedPrice(view: JobView): number | undefined {
    for (const t of view.tasks) {
      const task = this.d.store.tasks.get(t.id);
      const subId = task?.acceptedSubmissionId;
      if (!subId) continue;
      const verdicts = this.d.store.verdicts.all().filter((v) => v.submissionId === subId);
      const raw: unknown = verdicts[verdicts.length - 1]?.extraction["price"];
      const price =
        typeof raw === "object" && raw !== null
          ? (raw as { value?: unknown; currency?: unknown })
          : null;
      if (
        price &&
        typeof price.value === "number" &&
        Number.isFinite(price.value) &&
        price.value >= 0 &&
        price.value <= 100_000 &&
        (price.currency === null || price.currency === undefined || price.currency === "EUR")
      )
        return price.value;
    }
    return undefined;
  }

  private failureReason(view: JobView): string | undefined {
    const failed = view.tasks.filter((t) => t.state === "FAILED").map((t) => t.id as string);
    const verdicts = this.d.store.verdicts
      .all()
      .filter(
        (v) =>
          !v.pass && failed.includes(this.d.store.submissions.get(v.submissionId)?.taskId ?? ""),
      );
    const msg = verdicts[verdicts.length - 1]?.workerMessage.trim();
    return msg ? msg.slice(0, 240) : undefined;
  }

  /**
   * The price recorded at create time is 0 or missing: Sokosumi prices the Task seconds later, when
   * the coworker requests the payment (verified.md). Once the shell has linked a job the Task is
   * priced, so read it from Sokosumi in the background, at most once a minute per store check;
   * the next read shows it. The daily cap uses `reservedCredits` and is not affected.
   */
  private refreshPrices(orders: readonly OrderRecord[]): void {
    const client = this.d.client;
    if (!client.taskCredits) return;
    const now = this.d.clock.nowMs();
    for (const order of orders) {
      for (const row of order.jobs) {
        const taskId = row.sokosumiTaskId;
        if (!row.jobId || !taskId || (row.credits ?? 0) > 0) continue;
        const key = `${order.id}:${row.storeId}`;
        const last = this.priceLookups.get(key);
        if (last !== undefined && now - last < 60_000) continue;
        this.priceLookups.set(key, now);
        void client
          .taskCredits(taskId)
          .then((credits) => {
            if (credits === undefined || credits <= 0) return;
            const fresh = this.d.store.orders.get(order.id);
            if (!fresh) return;
            this.d.store.orders.put({
              ...fresh,
              jobs: fresh.jobs.map((j) =>
                j.storeId === row.storeId && j.sokosumiTaskId === taskId ? { ...j, credits } : j,
              ),
            });
          })
          .catch(() => undefined);
      }
    }
  }

  list(brandId: string): { orders: OrderView[] } {
    this.refreshPrices(this.d.store.orders.all().filter((o) => ownerOf(o) === brandId));
    return {
      orders: this.d.store.orders
        .all()
        .filter((o) => ownerOf(o) === brandId)
        .slice()
        .reverse()
        .map((o) => this.get(o.id, brandId)),
    };
  }

  /**
   * GET /api/brand/me (ADR-21). Credits reserved today are this brand's orders on the current UTC
   * day; the caps are global (one daily cap for the engine), shown here for the brand's view.
   */
  profile(brand: { id: string; name: string; walletAddress: string | null }): BrandProfile {
    const day = this.d.clock.nowIso().slice(0, 10);
    const reservedToday = this.d.store.orders
      .all()
      .filter((o) => ownerOf(o) === brand.id && o.createdAt.slice(0, 10) === day)
      .reduce((sum, o) => sum + BigInt(o.reservedCredits), 0n);
    return BrandProfileSchema.parse({
      brandId: brand.id,
      name: brand.name,
      walletAddress: brand.walletAddress,
      creditsReservedToday: Number(reservedToday),
      dailyCreditCap: this.d.env.ORDER_DAILY_CREDIT_CAP,
      maxCreditsPerTask: this.d.env.SOKOSUMI_MAX_CREDITS_PER_TASK,
      maxStores: this.d.env.ORDER_MAX_STORES,
      fake: this.d.env.SOKOSUMI_CLIENT === "fake",
    });
  }
  /**
   * GET /api/brand/summary: spend and check counts, derived only from this brand's order rows and
   * their jobs. Settled (delivered) = paid; withheld or refunded = refunded. Credits are the
   * recorded Sokosumi price per row; rows without one are counted, never estimated.
   */
  summary(brandId: string): BrandSummary {
    this.refreshPrices(this.d.store.orders.all().filter((o) => ownerOf(o) === brandId));
    let spent = 0;
    let refunded = 0;
    let unpriced = 0;
    const checks = { passed: 0, failed: 0, timedOut: 0, open: 0 };
    for (const order of this.d.store.orders.all().filter((o) => ownerOf(o) === brandId)) {
      for (const stored of order.jobs) {
        const job =
          stored.jobId && this.d.store.jobs.get(stored.jobId)
            ? this.d.engine.getJob(stored.jobId)
            : undefined;
        const kind = job ? classify(job) : "open";
        if (kind === "passed") checks.passed += 1;
        else if (kind === "failed") checks.failed += 1;
        else if (kind === "timed_out") checks.timedOut += 1;
        else if (kind === "open") checks.open += 1;
        const state = job?.job.state;
        const paid = state === "DELIVERED" || state === "SETTLED";
        const back = state === "WITHHELD" || state === "REFUNDED";
        if (paid || back) {
          if (stored.credits === undefined) unpriced += 1;
          else if (paid) spent += stored.credits;
          else refunded += stored.credits;
        }
      }
    }
    return { credits: { spent, refunded, unpricedChecks: unpriced }, checks };
  }

  /**
   * GET /api/brand/transactions: on-chain transactions of this brand's own store checks only
   * (escrow lock, result, settlement, refund, verifier x402 fee, worker payout). The job ids come
   * from the brand's order rows, so another brand's jobs are never selected.
   */
  transactions(brandId: string): { transactions: BrandTransaction[] } {
    const out: BrandTransaction[] = [];
    const ledger = this.d.engine.ledger.all();
    const kinds: Partial<Record<string, BrandTransaction["kind"]>> = {
      ESCROW_LOCKED: "escrow_lock",
      RESULT_SUBMITTED: "result_submitted",
      SETTLED: "settlement",
      REFUND_OBSERVED: "refund",
      VERIFY_PAID: "verifier_fee",
      PAYOUT_SUBMITTED: "worker_payout",
      PAYOUT_CONFIRMED: "worker_payout",
      PAYOUT_MARKED_PAID: "worker_payout",
    };
    const orders = this.d.store.orders
      .all()
      .filter((o) => ownerOf(o) === brandId)
      .slice()
      .reverse();
    for (const order of orders) {
      for (const row of order.jobs) {
        const jobId = row.jobId;
        if (!jobId) continue;
        const seen = new Set<string>();
        const add = (
          kind: BrandTransaction["kind"],
          txHash: string,
          ts: string | undefined,
          explorerUrl: string | undefined,
        ): void => {
          const key = `${kind}:${txHash}`;
          if (seen.has(key)) return;
          seen.add(key);
          const url = order.fake
            ? undefined
            : (explorerUrl ?? txUrl(txHash, this.d.env.EXPLORER_TX_BASE));
          out.push({
            orderId: order.id,
            storeId: row.storeId,
            jobId,
            kind,
            txHash,
            ...(url ? { explorerUrl: url } : {}),
            ...(ts ? { ts } : {}),
          });
        };
        for (const e of ledger) {
          const kind = kinds[e.kind];
          if (kind && e.txHash && e.refs["jobId"] === jobId)
            add(kind, e.txHash, e.ts, e.explorerUrl);
        }
        const st = this.d.store.settlements.all().find((s) => s.jobId === jobId);
        if (st) {
          if (st.escrowRefs.lockTx) add("escrow_lock", st.escrowRefs.lockTx, undefined, undefined);
          if (st.escrowRefs.settleTx)
            add("settlement", st.escrowRefs.settleTx, undefined, undefined);
          if (st.escrowRefs.refundTx) add("refund", st.escrowRefs.refundTx, undefined, undefined);
        }
        const taskIds = new Set(
          this.d.store.tasks
            .all()
            .filter((t) => t.jobId === jobId)
            .map((t) => t.id as string),
        );
        for (const p of this.d.store.payouts.all()) {
          if (p.txHash && taskIds.has(p.taskId))
            add("worker_payout", p.txHash, undefined, undefined);
        }
      }
    }
    return { transactions: out };
  }
}
