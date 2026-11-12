import { createHash, randomInt } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  AppError,
  CaptureLocationSchema,
  brandAccounts,
  ClaimIdSchema,
  ClaimRequestSchema,
  CreateJobRequestSchema,
  DecisionQuerySchema,
  JobIdSchema,
  LedgerQuerySchema,
  MarkPaidRequestSchema,
  OverrideRequestSchema,
  PayoutAddressSchema,
  PayoutIdSchema,
  PayoutsQuerySchema,
  SettlementEventRequestSchema,
  SubmissionIdSchema,
  SubmitPhotoRequestSchema,
  TaskIdSchema,
  TasksQuerySchema,
  VerifyResponseSchema,
  addSeconds,
  isTerminal,
  makeChallengeCode,
  makeGestureChallenge,
  newClaimId,
  newJobId,
  newSettlementId,
  newSubmissionId,
  newTaskId,
  newVerdictId,
  parseOrThrow,
  transition,
  verifyIdempotencyKey,
} from "@shelfie/core";
import type {
  CaptureLocation,
  CatalogResponse,
  ChallengeMode,
  Claim,
  RevealChallengeResponse,
  Clock,
  ConfigResponse,
  EngineEnv,
  FeedEvent,
  HealthResponse,
  IdGenerator,
  IntakeReason,
  Job,
  JobInput,
  JobView,
  Logger,
  Outcome,
  Payout,
  PayoutQueue,
  Settlement,
  Submission,
  SubmissionView,
  Task,
  TaskListItem,
  Verdict,
  VerifyClient,
  VerifyRequest,
  VerifyResponse,
} from "@shelfie/core";
import { shortAddress, txUrl } from "@shelfie/evidence";
import type { AppendInput, Ledger } from "@shelfie/evidence";
import type { Catalog } from "./catalog.js";
import { Feed } from "./feed.js";
import { CITY_BOXES, cityIdFromName, precheckLocation, resolveCity } from "./geo.js";
import { DEFAULT_IMAGE_LIMITS, cleanJpeg, decodeBase64Strict } from "./jpeg.js";
import type { EnginePack } from "./pack.js";
import type { HealthProbe, PayoutQueueAdmin } from "./seams.js";
import type { Store } from "./store.js";

const MAX_VERIFY_RETRIES = 2;
const DISPLAY_NAME = /^[\p{L}\p{N} ._'-]{1,60}$/u;

export interface EngineDeps {
  env: EngineEnv;
  clock: Clock;
  ids: IdGenerator;
  logger: Logger;
  store: Store;
  ledger: Ledger;
  catalog: Catalog;
  pack: EnginePack;
  verifyClient: VerifyClient;
  payoutQueue: PayoutQueue & PayoutQueueAdmin;
  probe: HealthProbe;
  /** Directory for stored (cleaned) photos; outside the web root, git-ignored. */
  imageDir: string;
  fakes: { payments: boolean; verifier: boolean };
  /** CSPRNG integer in [0, n). Injectable for deterministic challenge codes. */
  randomInt?: (n: number) => number;
  sleep?: (ms: number) => Promise<void>;
  payoutPollMs?: number;
  verifyBackoffMs?: readonly number[];
  evidenceRunLocked?: boolean;
}

export interface Reply<T> {
  status: number;
  body: T;
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((r) => {
    setTimeout(r, ms);
  });

const sha256Hex = (s: string): string => createHash("sha256").update(s).digest("hex");

export class Engine {
  readonly feed = new Feed();
  private readonly d: EngineDeps;
  private rand: (n: number) => number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly inflight = new Set<Promise<unknown>>();
  private verifyChain: Promise<void> = Promise.resolve();
  private pendingVerifications = 0;
  private readonly watching = new Set<string>();
  private readonly waiters = new Map<string, Set<() => void>>();

  constructor(deps: EngineDeps) {
    this.d = deps;
    this.rand = deps.randomInt ?? ((n) => randomInt(n));
    this.sleep = deps.sleep ?? defaultSleep;
    mkdirSync(deps.imageDir, { recursive: true, mode: 0o700 });
  }

  // ------------------------------------------------------------------ helpers
  private get env(): EngineEnv {
    return this.d.env;
  }

  private flags(extra: Record<string, boolean> = {}): Record<string, boolean> {
    return {
      ...(this.d.fakes.payments ? { fakePayments: true } : {}),
      ...(this.d.fakes.verifier ? { fakeVerifier: true } : {}),
      ...(this.env.VERIFIER_PAYMENT === "off" ? { dryVerifier: true } : {}),
      ...(this.env.LOCATION_CHECK === "off" ? { locationCheckOff: true } : {}),
      ...(this.env.ALLOW_TEST_UPLOAD ? { testUploadAllowed: true } : {}),
      ...extra,
    };
  }

  private led(input: AppendInput): void {
    const fakeOrder =
      input.refs?.["jobId"] &&
      this.d.store.orders
        .all()
        .some(
          (order) => order.fake && order.jobs.some((row) => row.jobId === input.refs?.["jobId"]),
        );
    this.d.ledger.append({
      ...input,
      flags: this.flags({ ...(fakeOrder ? { fakeSokosumi: true } : {}), ...input.flags }),
    });
  }

  private track(p: Promise<unknown>): void {
    this.inflight.add(p);
    const done = (): void => {
      this.inflight.delete(p);
    };
    p.then(done, done);
  }

  /** Resolves when all background work (verifications, payout watchers) has finished. */
  async idle(): Promise<void> {
    while (this.inflight.size > 0) {
      await Promise.allSettled([...this.inflight]);
    }
  }

  private notify(jobId: string): void {
    for (const w of this.waiters.get(jobId) ?? []) w();
  }

  private store(): Store {
    return this.d.store;
  }

  private jobOf(task: Task): Job {
    const job = this.d.store.jobs.get(task.jobId);
    if (!job) throw new AppError("internal", "Task without job.");
    return job;
  }

  private cityOfStore(storeId: string): string | null {
    const s = this.d.catalog.store(storeId);
    return s ? cityIdFromName(s.city) : null;
  }

  private setTask(task: Task, patch: Partial<Task>): Task {
    const next = { ...task, ...patch };
    this.d.store.tasks.put(next);
    return next;
  }

  private setJob(job: Job, patch: Partial<Job>): Job {
    const next = { ...job, ...patch };
    this.d.store.jobs.put(next);
    return next;
  }

  private cutoffMs(job: Job): number {
    return (
      Date.parse(job.windowEndsAt) - (this.env.CLAIM_TTL_SEC + this.env.VERIFY_BUDGET_SEC) * 1000
    );
  }

  private taskItem(task: Task, job: Job): TaskListItem {
    const store = this.d.catalog.store(task.spec.storeId);
    const product = this.d.catalog.product(task.spec.productEan);
    return {
      id: task.id,
      jobId: task.jobId,
      storeId: task.spec.storeId,
      storeName: store?.name ?? "",
      storeAddress: store?.address ?? "",
      productName: product?.name ?? "",
      payoutAmount: task.payoutAmount,
      windowEndsAt: job.windowEndsAt,
    };
  }

  private emitOpened(task: Task, job: Job): void {
    this.d.logger.info("task_opened", { jobId: job.id, taskId: task.id });
    this.feed.publish(
      { type: "task_opened", task: this.taskItem(task, job) },
      this.cityOfStore(task.spec.storeId),
    );
  }

  private emitClosed(task: Task, reason: "claimed" | "done" | "expired"): void {
    this.feed.publish({ type: "task_closed", taskId: task.id, reason }, null);
  }

  private latestVerdict(submissionId: string): Verdict | undefined {
    const all = this.d.store.verdicts.all().filter((v) => v.submissionId === submissionId);
    return all[all.length - 1];
  }

  private payoutOfTask(taskId: string): Payout | undefined {
    return this.d.store.payouts.all().find((p) => p.taskId === taskId);
  }

  // ------------------------------------------------------------------ jobs
  intakeReasons(input: JobInput): IntakeReason[] {
    const reasons: IntakeReason[] = [];
    if (input.stores.length > this.d.pack.config.jobInput.maxStores) {
      reasons.push({ code: "multi_store_unsupported", field: "input.stores" });
    }
    input.stores.forEach((s, i) => {
      const store = this.d.catalog.store(s.id);
      if (!store) reasons.push({ code: "unknown_store", field: `input.stores[${i}].id` });
      else if (store.city !== this.d.pack.config.jobInput.city) {
        reasons.push({ code: "city_not_supported", field: `input.stores[${i}].id` });
      }
    });
    if (!this.d.catalog.product(input.productEan)) {
      reasons.push({ code: "unknown_product", field: "input.productEan" });
    }
    return reasons;
  }

  createJob(body: unknown, source: "shell" | "admin"): Reply<unknown> {
    this.sweep();
    const req = parseOrThrow(CreateJobRequestSchema, body);
    if (req.packId !== this.env.PACK_ID) {
      throw new AppError("invalid_request", "Unknown pack.", undefined, { packId: req.packId });
    }
    const n = req.input.stores.length;
    const k = req.input.k ?? n;
    if (k > n) {
      throw new AppError(
        "input_schema_violation",
        "k must not exceed the number of stores.",
        undefined,
        {
          issues: [{ path: "input.k", code: "too_big", message: "k exceeds n" }],
        },
      );
    }
    // Order correlation is trusted only after matching the reserved store/product and bound Task id.
    const order = req.orderRef ? this.d.store.orders.get(req.orderRef.orderId) : undefined;
    const orderRow = order?.jobs.find((j) => j.storeId === req.orderRef?.storeId);
    if (
      req.orderRef &&
      (!order ||
        !orderRow ||
        req.input.stores.length !== 1 ||
        req.input.stores[0]?.id !== orderRow.storeId ||
        req.input.productEan !== order.productEan ||
        req.source !== "shell" ||
        (orderRow.sokosumiTaskId !== null && orderRow.sokosumiTaskId !== req.externalRef))
    ) {
      throw new AppError(
        "input_schema_violation",
        "Order correlation does not match the reserved check.",
      );
    }
    const existing = this.d.store.jobs.all().find((j) => j.externalRef === req.externalRef);
    if (existing) {
      if (order && orderRow) {
        if (
          existing.input.productEan !== order.productEan ||
          existing.input.stores.length !== 1 ||
          existing.input.stores[0]?.id !== orderRow.storeId
        ) {
          throw new AppError("input_schema_violation", "Existing job does not match order.");
        }
        this.d.store.orders.put({
          ...order,
          jobs: order.jobs.map((j) =>
            j.storeId === orderRow.storeId
              ? { ...j, sokosumiTaskId: req.externalRef, jobId: existing.id }
              : j,
          ),
        });
      }
      if (existing.state === "REJECTED_INPUT")
        this.throwIntake(existing.id, this.intakeReasons(existing.input));
      return { status: 200, body: this.createResponse(existing) };
    }

    const now = this.d.clock.nowIso();
    const windowSec = req.windowSec ?? this.env.JOB_WINDOW_SEC;
    const reasons = this.intakeReasons(req.input);
    const jobId = newJobId(this.d.ids);

    if (reasons.length > 0) {
      const rejected: Job = {
        id: jobId,
        packId: req.packId,
        input: req.input,
        source: req.source,
        externalRef: req.externalRef,
        k,
        n,
        windowEndsAt: now,
        state: transition("job", "RECEIVED", "intake_rejected"),
        decision: null,
        reportMd: null,
        createdAt: now,
      };
      this.d.store.jobs.put(rejected);
      this.led({
        kind: "INTAKE_REJECTED",
        refs: { jobId, externalRef: req.externalRef },
        note: reasons.map((r) => r.code).join(","),
      });
      this.throwIntake(jobId, reasons);
    }

    if (windowSec * 1000 <= (this.env.CLAIM_TTL_SEC + this.env.VERIFY_BUDGET_SEC) * 1000) {
      throw new AppError(
        "input_schema_violation",
        "windowSec is too short for the claim cutoff.",
        undefined,
        {
          issues: [
            {
              path: "windowSec",
              code: "too_small",
              message: "must exceed CLAIM_TTL_SEC + VERIFY_BUDGET_SEC",
            },
          ],
        },
      );
    }

    const job: Job = {
      id: jobId,
      packId: req.packId,
      input: req.input,
      source: req.source,
      externalRef: req.externalRef,
      k,
      n,
      windowEndsAt: addSeconds(now, windowSec),
      state: transition("job", "RECEIVED", "tasks_planned"),
      decision: null,
      reportMd: null,
      createdAt: now,
    };
    this.d.store.jobs.put(job);
    if (order && orderRow) {
      this.d.store.orders.put({
        ...order,
        jobs: order.jobs.map((j) =>
          j.storeId === orderRow.storeId
            ? { ...j, sokosumiTaskId: req.externalRef, jobId: job.id }
            : j,
        ),
      });
    }
    const settlement: Settlement = {
      id: newSettlementId(this.d.ids),
      jobId,
      decision: "WITHHOLD",
      passed: 0,
      k,
      n,
      resultHash: null,
      shellAction: null,
      escrowRefs: { lockTx: null, settleTx: null, refundTx: null },
      state: "PENDING",
    };
    this.d.store.settlements.put(settlement);
    this.led({
      kind: "JOB_CREATED",
      refs: { jobId, externalRef: req.externalRef },
      note: `source=${req.source} n=${n} k=${k} windowSec=${windowSec}${source === "admin" ? " via admin" : ""}`,
    });
    const tasks: Task[] = req.input.stores.map((s) => {
      const task: Task = {
        id: newTaskId(this.d.ids),
        jobId,
        spec: { storeId: s.id, productEan: req.input.productEan },
        state: "OPEN",
        attempts: 0,
        maxAttempts: this.env.MAX_ATTEMPTS,
        currentClaimId: null,
        acceptedSubmissionId: null,
        acceptedOutcome: null,
        payoutAmount: this.env.PAYOUT_LOVELACE,
      };
      this.d.store.tasks.put(task);
      this.led({ kind: "TASK_OPENED", refs: { jobId, taskId: task.id, after: "initial" } });
      return task;
    });
    this.d.logger.info("job_created", { jobId, tasks: tasks.length });
    for (const t of tasks) this.emitOpened(t, job);
    return { status: 201, body: this.createResponse(job) };
  }

  private throwIntake(jobId: string, reasons: IntakeReason[]): never {
    const msg = reasons.find((r) => r.code === "unknown_store")
      ? "Store is not in the supported Munich catalog."
      : reasons.find((r) => r.code === "unknown_product")
        ? "Product is not in the supported catalog."
        : reasons.find((r) => r.code === "city_not_supported")
          ? "Store is not in a supported city."
          : "Only one store per job is supported.";
    throw new AppError("intake_rejected", msg, undefined, { reasons, jobId });
  }

  private tasksOf(jobId: string): Task[] {
    return this.d.store.tasks.all().filter((t) => t.jobId === jobId);
  }

  private createResponse(job: Job): unknown {
    return {
      job: { id: job.id, state: job.state, n: job.n, k: job.k, windowEndsAt: job.windowEndsAt },
      tasks: this.tasksOf(job.id).map((t) => ({
        id: t.id,
        state: t.state,
        spec: this.specView(t),
      })),
    };
  }

  private specView(t: Task): Record<string, unknown> {
    const store = this.d.catalog.store(t.spec.storeId);
    const product = this.d.catalog.product(t.spec.productEan);
    return {
      storeId: t.spec.storeId,
      productEan: t.spec.productEan,
      storeName: store?.name ?? null,
      productName: product?.name ?? null,
    };
  }

  private mustJob(id: string): Job {
    const parsed = JobIdSchema.safeParse(id);
    const job = parsed.success ? this.d.store.jobs.get(parsed.data) : undefined;
    if (!job) throw new AppError("not_found", "Job not found.");
    return job;
  }

  private mustTask(id: string): Task {
    const parsed = TaskIdSchema.safeParse(id);
    const task = parsed.success ? this.d.store.tasks.get(parsed.data) : undefined;
    if (!task) throw new AppError("not_found", "Task not found.");
    return task;
  }

  private jobHead(j: Job): JobView["job"] {
    return {
      id: j.id,
      packId: j.packId,
      source: j.source,
      externalRef: j.externalRef,
      state: j.state,
      n: j.n,
      k: j.k,
      windowEndsAt: j.windowEndsAt,
      createdAt: j.createdAt,
      reportMd: j.reportMd,
    };
  }

  getJob(id: string): JobView {
    this.sweep();
    const job = this.mustJob(id);
    const tasks = this.tasksOf(job.id);
    const passed = tasks.filter((t) => t.state === "ACCEPTED" || t.state === "PAID").length;
    const failed = tasks.filter((t) => t.state === "FAILED").length;
    const open = tasks.filter((t) =>
      ["OPEN", "CLAIMED", "SUBMITTED", "VERIFYING"].includes(t.state),
    ).length;
    const st = this.d.store.settlements.all().find((s) => s.jobId === job.id);
    return {
      job: this.jobHead(job),
      tasks: tasks.map((t) => ({
        id: t.id,
        state: t.state,
        spec: this.specView(t),
        attempts: t.attempts,
        acceptedOutcome: t.acceptedOutcome,
      })),
      counts: { passed, failed, open },
      decision: job.decision,
      settlement: st
        ? { state: st.state, resultHash: st.resultHash, txHashes: { ...st.escrowRefs } }
        : null,
    };
  }

  listJobs(): { jobs: JobView["job"][] } {
    this.sweep();
    const jobs = this.d.store.jobs.all().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return { jobs: jobs.map((j) => this.jobHead(j)) };
  }

  async decision(id: string, query: unknown): Promise<unknown> {
    const { waitSec } = parseOrThrow(DecisionQuerySchema, query, "invalid_request");
    this.sweep();
    let job = this.mustJob(id);
    if (waitSec > 0 && this.isPending(job)) {
      await this.waitFor(job.id, waitSec * 1000);
      this.sweep();
      job = this.mustJob(id);
    }
    return this.decisionBody(job);
  }

  private isPending(job: Job): boolean {
    return job.state === "RECEIVED" || job.state === "COLLECTING" || job.state === "DECIDING";
  }

  private waitFor(jobId: string, ms: number): Promise<void> {
    return new Promise((resolve) => {
      const set = this.waiters.get(jobId) ?? new Set<() => void>();
      this.waiters.set(jobId, set);
      const finish = (): void => {
        clearTimeout(timer);
        set.delete(finish);
        resolve();
      };
      const timer = setTimeout(finish, ms);
      set.add(finish);
    });
  }

  private decisionBody(job: Job): unknown {
    const tasks = this.tasksOf(job.id);
    const passed = tasks.filter((t) => t.state === "ACCEPTED" || t.state === "PAID");
    if (job.state === "DELIVERABLE" || job.state === "DELIVERED" || job.state === "SETTLED") {
      const reportMd = job.reportMd ?? "";
      const outcomes = [
        ...new Set(passed.map((t) => t.acceptedOutcome).filter((o): o is Outcome => o !== null)),
      ];
      return {
        jobId: job.id,
        status: "DELIVER",
        outcomes,
        passed: passed.length,
        k: job.k,
        n: job.n,
        reportMd,
        reportSha256: sha256Hex(reportMd),
      };
    }
    if (this.isPending(job)) return { jobId: job.id, status: "PENDING" };
    const reason =
      job.state === "CANCELLED"
        ? "cancelled"
        : job.state === "REJECTED_INPUT"
          ? "intake_rejected"
          : "no_passing_photo";
    return { jobId: job.id, status: "WITHHOLD", passed: passed.length, k: job.k, n: job.n, reason };
  }

  cancelJob(id: string): { job: { id: string; state: Job["state"] } } {
    this.sweep();
    const job = this.mustJob(id);
    const next = transition("job", job.state, "admin_cancel");
    for (const t of this.tasksOf(job.id)) this.expireTask(t, "expired");
    const saved = this.setJob(job, { state: next });
    this.led({ kind: "ADMIN_ACTION", refs: { action: "cancel", jobId: job.id } });
    this.notify(job.id);
    return { job: { id: saved.id, state: saved.state } };
  }

  finalizeJob(id: string): Reply<unknown> {
    this.sweep();
    const job = this.mustJob(id);
    const closed = transition("job", job.state, "window_closed");
    for (const t of this.tasksOf(job.id)) this.expireTask(t, "expired");
    const saved = this.setJob(job, { state: closed });
    this.led({ kind: "ADMIN_ACTION", refs: { action: "finalize", jobId: job.id } });
    this.decide(saved);
    return { status: 200, body: this.decisionBody(this.mustJob(id)) };
  }

  // ------------------------------------------------------------------ sweeping and decisions
  /** Expire claims past their TTL, close windows, decide jobs. Idempotent; call often. */
  sweep(): void {
    const nowMs = this.d.clock.nowMs();
    for (const c of this.d.store.claims.all()) {
      if (c.state === "ACTIVE" && nowMs >= Date.parse(c.expiresAt)) this.expireClaim(c);
    }
    for (const job of this.d.store.jobs.all()) {
      if (job.state !== "COLLECTING") continue;
      const tasks = this.tasksOf(job.id);
      const inFlight = tasks.some((t) => t.state === "SUBMITTED" || t.state === "VERIFYING");
      if (nowMs >= Date.parse(job.windowEndsAt)) {
        if (inFlight) continue; // wait for the running verification (claim cutoff leaves budget)
        for (const t of tasks) this.expireTask(t, "expired");
        const saved = this.setJob(job, { state: transition("job", job.state, "window_closed") });
        this.decide(saved);
      } else if (tasks.length > 0 && tasks.every((t) => isTerminal("task", t.state))) {
        const saved = this.setJob(job, {
          state: transition("job", job.state, "all_tasks_terminal"),
        });
        this.decide(saved);
      }
    }
  }

  private expireClaim(c: Claim): void {
    const task = this.d.store.tasks.get(c.taskId);
    this.d.store.claims.put({ ...c, state: transition("claim", c.state, "ttl_passed") });
    if (task && task.state === "CLAIMED") {
      const reopened = this.setTask(task, {
        state: transition("task", task.state, "claim_expired"),
        currentClaimId: null,
      });
      const job = this.jobOf(reopened);
      this.led({ kind: "TASK_OPENED", refs: { jobId: job.id, taskId: task.id, after: c.id } });
      if (job.state === "COLLECTING") this.emitOpened(reopened, job);
    }
  }

  private expireTask(t: Task, reason: "expired"): void {
    if (t.state !== "OPEN" && t.state !== "CLAIMED") return;
    if (t.state === "CLAIMED" && t.currentClaimId) {
      const c = this.d.store.claims.get(t.currentClaimId);
      if (c && c.state === "ACTIVE")
        this.d.store.claims.put({ ...c, state: transition("claim", c.state, "ttl_passed") });
    }
    this.setTask(t, { state: transition("task", t.state, "window_closed"), currentClaimId: null });
    this.emitClosed(t, reason);
  }

  /** DECIDING -> DELIVERABLE | WITHHELD. The decision never flips afterwards. */
  private decide(job: Job): void {
    if (job.state !== "DECIDING") return;
    const tasks = this.tasksOf(job.id);
    const passed = tasks.filter((t) => t.state === "ACCEPTED" || t.state === "PAID");
    const st = this.d.store.settlements.all().find((s) => s.jobId === job.id);
    if (passed.length >= job.k) {
      const reportMd = passed.map((t) => this.reportFor(job, t)).join("\n---\n\n");
      const saved = this.setJob(job, {
        state: transition("job", "DECIDING", "decide_deliver"),
        decision: "DELIVER",
        reportMd,
      });
      if (st) {
        this.d.store.settlements.put({
          ...st,
          decision: "DELIVER",
          passed: passed.length,
          state: transition("settlement", st.state, "decide_deliver"),
        });
      }
      this.led({
        kind: "JOB_DECIDED",
        refs: { jobId: job.id },
        note: `DELIVER passed=${passed.length} k=${job.k} n=${job.n}`,
      });
      this.d.logger.info("job_decided", { jobId: job.id, decision: "DELIVER" });
      this.notify(saved.id);
    } else {
      const saved = this.setJob(job, {
        state: transition("job", "DECIDING", "decide_withhold"),
        decision: "WITHHOLD",
      });
      if (st) {
        this.d.store.settlements.put({
          ...st,
          decision: "WITHHOLD",
          passed: passed.length,
          state: transition("settlement", st.state, "decide_withhold"),
        });
      }
      this.led({
        kind: "JOB_DECIDED",
        refs: { jobId: job.id },
        note: `WITHHOLD no_passing_photo passed=${passed.length} k=${job.k} n=${job.n}`,
      });
      this.d.logger.info("job_decided", { jobId: job.id, decision: "WITHHOLD" });
      this.notify(saved.id);
    }
  }

  private reportFor(job: Job, task: Task): string {
    const store = this.d.catalog.store(task.spec.storeId);
    const product = this.d.catalog.product(task.spec.productEan);
    const sub = task.acceptedSubmissionId
      ? this.d.store.submissions.get(task.acceptedSubmissionId)
      : undefined;
    const verdict = sub ? this.latestVerdict(sub.id) : undefined;
    if (!store || !product || !sub || !verdict)
      return `# Shelf check report\n\n- Job: ${job.id}\n- Result unavailable.\n`;
    return this.d.pack.renderReport({
      job,
      store,
      product,
      outcome: task.acceptedOutcome ?? sub.outcome,
      verdict,
      decidedAt: this.d.clock.nowIso(),
      verifyTx: verdict.verifierTx,
      payoutTx: this.payoutOfTask(task.id)?.txHash ?? null,
      overridden: verdict.source === "MANUAL_OVERRIDE",
      fakePayments: this.d.fakes.payments,
      explorerTxBase: this.env.EXPLORER_TX_BASE,
      payoutLovelace: task.payoutAmount,
    });
  }

  // ------------------------------------------------------------------ tasks and claims
  private cityForFeed(query: {
    lat?: number | undefined;
    lon?: number | undefined;
  }): string | null {
    if (this.env.LOCATION_CHECK === "off") return null;
    if (query.lat === undefined || query.lon === undefined) {
      throw new AppError("location_required", "Location is required to see tasks.");
    }
    return resolveCity({ lat: query.lat, lon: query.lon })?.id ?? "__none__";
  }

  listTasks(query: unknown): { tasks: TaskListItem[] } {
    this.sweep();
    const q = parseOrThrow(TasksQuerySchema, query, "invalid_request");
    const city = this.cityForFeed(q);
    const out: TaskListItem[] = [];
    for (const t of this.d.store.tasks.all()) {
      if (t.state !== "OPEN") continue;
      const job = this.jobOf(t);
      if (job.state !== "COLLECTING") continue;
      if (city !== null && this.cityOfStore(t.spec.storeId) !== city) continue;
      out.push(this.taskItem(t, job));
    }
    return { tasks: out };
  }

  /** City filter for an SSE connection (throws 403 `location_required` like the list). */
  streamCity(query: unknown): string | null {
    const q = parseOrThrow(TasksQuerySchema.omit({ status: true }), query, "invalid_request");
    return this.cityForFeed(q);
  }

  claimTask(taskId: string, body: unknown): Reply<unknown> {
    this.sweep();
    const task = this.mustTask(taskId);
    const req = parseOrThrow(ClaimRequestSchema, body);
    const job = this.jobOf(task);

    const mine = this.d.store.claims
      .all()
      .find((c) => c.taskId === task.id && c.workerId === req.workerId && c.state === "ACTIVE");
    if (mine) return { status: 200, body: this.claimResponse(mine, task) };

    if (task.state !== "OPEN" || job.state !== "COLLECTING") {
      throw new AppError("task_not_open", "Another worker was faster.");
    }
    if (this.d.clock.nowMs() >= this.cutoffMs(job)) {
      throw new AppError("claim_window_closed", "This task can no longer be claimed.");
    }
    if (!PayoutAddressSchema.safeParse(req.payoutAddress).success) {
      throw new AppError(
        "invalid_payout_address",
        "Enter a Cardano preprod address (addr_test1...).",
      );
    }
    if (req.displayName !== undefined && !DISPLAY_NAME.test(req.displayName)) {
      throw new AppError(
        "input_schema_violation",
        "Display name has invalid characters.",
        undefined,
        {
          issues: [
            {
              path: "displayName",
              code: "invalid_format",
              message: "letters, digits, space, . _ ' -",
            },
          ],
        },
      );
    }
    let locationSource: Claim["locationSource"] = "disabled";
    const store = this.d.catalog.store(task.spec.storeId);
    if (this.env.LOCATION_CHECK === "on") {
      if (!req.location)
        throw new AppError("location_required", "Allow location access to take this task.");
      const city = resolveCity(req.location);
      const storeCity = store?.city ?? "";
      if (!city || city.id !== cityIdFromName(storeCity)) {
        throw new AppError("wrong_city", "You are not in the city of this store.", undefined, {
          storeCity,
        });
      }
      locationSource = "browser";
    }
    const busy = this.d.store.claims
      .all()
      .some(
        (c) =>
          c.state === "ACTIVE" &&
          (c.workerId === req.workerId || c.payoutAddress === req.payoutAddress),
      );
    if (busy) throw new AppError("claim_already_active", "You already have an active task.");

    // --- atomic: no await between the check above and the writes below (single-threaded) ---
    const now = this.d.clock.nowIso();
    const claim: Claim = {
      id: newClaimId(this.d.ids),
      taskId: task.id,
      workerId: req.workerId,
      ...(req.displayName !== undefined ? { displayName: req.displayName } : {}),
      payoutAddress: req.payoutAddress,
      challengeCode: this.newChallengeCode(),
      ...(this.challengeMode() === "gesture" ? { gesture: makeGestureChallenge(this.rand) } : {}),
      issuedAt: now,
      expiresAt: addSeconds(now, this.env.CLAIM_TTL_SEC),
      state: "ACTIVE",
      cityMatch: locationSource === "browser",
      locationSource,
      locationTries: 0,
    };
    const claimed = this.setTask(task, {
      state: transition("task", task.state, "claim"),
      currentClaimId: claim.id,
    });
    this.d.store.claims.put(claim);
    // ---
    this.led({
      kind: "TASK_CLAIMED",
      refs: { jobId: job.id, taskId: task.id, claimId: claim.id },
      note: `payout to ${shortAddress(claim.payoutAddress)}`,
      flags: locationSource === "disabled" ? { locationCheckBypassed: true } : {},
    });
    this.emitClosed(claimed, "claimed");
    this.d.logger.info("task_claimed", { jobId: job.id, taskId: task.id, claimId: claim.id });
    return { status: 201, body: this.claimResponse(claim, claimed) };
  }

  private newChallengeCode(): string {
    const active = new Set(
      this.d.store.claims
        .all()
        .filter((c) => c.state === "ACTIVE")
        .map((c) => c.challengeCode),
    );
    for (let i = 0; i < 20; i++) {
      const code = makeChallengeCode(this.rand);
      if (!active.has(code)) return code;
    }
    throw new AppError("internal", "Could not generate a unique challenge code.");
  }

  /** Env `CHALLENGE_MODE` overrides the pack (kill switch back to codes, ADR-19). */
  private challengeMode(): ChallengeMode {
    return this.env.CHALLENGE_MODE ?? this.d.pack.config.worker.challenge?.mode ?? "handwritten";
  }

  /** Gesture answer window in seconds: pack rule `timing.maxSecondsAfterReveal`, default 90. */
  private answerWithinSec(): number {
    const v = this.d.pack.config.rules.find((r) => r.name === "timing")?.params[
      "maxSecondsAfterReveal"
    ];
    return typeof v === "number" && Number.isInteger(v) && v > 0 ? v : 90;
  }

  private claimResponse(claim: Claim, task: Task): unknown {
    const store = this.d.catalog.store(task.spec.storeId);
    const product = this.d.catalog.product(task.spec.productEan);
    const gesture = claim.gesture !== undefined;
    return {
      claim: {
        id: claim.id,
        taskId: claim.taskId,
        expiresAt: claim.expiresAt,
        ttlSec: this.env.CLAIM_TTL_SEC,
      },
      // Gesture mode: the gesture itself is only sent by revealChallenge (late reveal, ADR-19).
      challenge: gesture
        ? {
            code: "",
            mode: "gesture",
            instruction: `Open the camera when you stand at the product: it shows a hand sign, then you have ${this.answerWithinSec()} s for the photo.`,
          }
        : {
            code: claim.challengeCode,
            mode: this.challengeMode(),
            instruction: "Write this code on paper and hold it next to the price tag.",
          },
      task: { product: product?.name ?? "", store: store?.name ?? "" },
    };
  }

  /**
   * POST /api/claims/{claimId}/challenge: reveal the gesture of an active claim. The first call
   * stores the reveal time (engine clock); later calls return the same gesture and time, so a
   * worker cannot re-roll the gesture or restart the answer window.
   */
  revealChallenge(claimId: string): RevealChallengeResponse {
    this.sweep();
    const parsed = ClaimIdSchema.safeParse(claimId);
    const found = parsed.success ? this.d.store.claims.get(parsed.data) : undefined;
    if (!found) throw new AppError("not_found", "Claim not found.");
    if (found.state === "USED")
      throw new AppError("already_submitted", "This claim already has a photo.");
    if (found.state !== "ACTIVE")
      throw new AppError("claim_expired", "Claim expired, claim the task again.");
    if (!found.gesture) throw new AppError("invalid_request", "This claim has no hand sign.");
    let claim = found;
    if (!claim.challengeRevealedAt) {
      claim = { ...claim, challengeRevealedAt: this.d.clock.nowIso() };
      this.d.store.claims.put(claim);
      this.d.logger.info("challenge_revealed", { taskId: claim.taskId, claimId: claim.id });
    }
    const { fingers, side } = claim.gesture!;
    return {
      claimId: claim.id,
      gesture: { fingers, side },
      revealedAt: claim.challengeRevealedAt!,
      answerWithinSec: this.answerWithinSec(),
      instruction: `Hold up ${fingers} fingers, hand on the ${side} side.`,
    };
  }

  releaseClaim(claimId: string): { claim: { id: string; state: Claim["state"] } } {
    this.sweep();
    const parsed = ClaimIdSchema.safeParse(claimId);
    const claim = parsed.success ? this.d.store.claims.get(parsed.data) : undefined;
    if (!claim) throw new AppError("not_found", "Claim not found.");
    if (claim.state === "RELEASED") return { claim: { id: claim.id, state: claim.state } };
    if (claim.state === "USED")
      throw new AppError("already_submitted", "This claim already has a photo.");
    if (claim.state === "EXPIRED")
      throw new AppError("claim_expired", "Claim expired, claim the task again.");
    this.releaseActive(claim, "worker_released");
    return { claim: { id: claim.id, state: "RELEASED" } };
  }

  private releaseActive(claim: Claim, event: "worker_released" | "location_tries_exhausted"): void {
    const task = this.d.store.tasks.get(claim.taskId);
    this.d.store.claims.put({ ...claim, state: transition("claim", claim.state, event) });
    if (task && task.state === "CLAIMED") {
      const reopened = this.setTask(task, {
        state: transition("task", task.state, "claim_released"),
        currentClaimId: null,
      });
      const job = this.jobOf(reopened);
      this.led({ kind: "TASK_OPENED", refs: { jobId: job.id, taskId: task.id, after: claim.id } });
      if (job.state === "COLLECTING") this.emitOpened(reopened, job);
    }
  }

  // ------------------------------------------------------------------ submissions
  submitPhoto(taskId: string, body: unknown, opts: { adminAuthed: boolean }): Reply<unknown> {
    this.sweep();
    const task = this.mustTask(taskId);
    const looseSchema = SubmitPhotoRequestSchema.extend({
      location: CaptureLocationSchema.optional(),
    });
    const req = parseOrThrow(looseSchema, body);
    const claim = this.d.store.claims.get(req.claimId);
    if (!claim || claim.taskId !== task.id) throw new AppError("not_found", "Claim not found.");
    if (claim.state === "EXPIRED" || claim.state === "RELEASED") {
      throw new AppError("claim_expired", "Claim expired, claim the task again.");
    }

    const mode = req.clientMeta.captureMode;
    const adminTest = mode === "admin-test" && opts.adminAuthed && this.env.ALLOW_TEST_UPLOAD;
    if (mode !== "getUserMedia" && !adminTest) {
      throw new AppError(
        "capture_mode_not_allowed",
        "Take the photo with the live camera in the app.",
      );
    }
    const checkLocation = this.env.LOCATION_CHECK === "on";
    if (checkLocation && !req.location) {
      throw new AppError("location_required", "Allow location access to submit the photo.");
    }

    // Gesture mode: no photo before the reveal, so a throwaway submission cannot fish for the
    // gesture in a rejection and the answer window always starts at the reveal (ADR-19).
    if (claim.state === "ACTIVE" && claim.gesture && !claim.challengeRevealedAt) {
      throw new AppError("challenge_not_revealed", "Open the camera first to see your hand sign.");
    }

    const bytes = decodeBase64Strict(req.imageBase64, this.env.MAX_IMAGE_BYTES);

    if (claim.state === "USED") {
      // one submission per claim: same image -> the existing submission, anything else -> 409
      const clean = this.clean(bytes);
      const prior = this.d.store.submissions.all().find((s) => s.claimId === claim.id);
      if (prior && prior.imageSha256 === clean.sha256) {
        return { status: 202, body: this.submissionAck(prior) };
      }
      throw new AppError("already_submitted", "This claim already has a photo.");
    }

    // --- capture-time geofence precheck: before any verifier call, no fee, no attempt ---
    const job = this.jobOf(task);
    const store = this.d.catalog.store(task.spec.storeId);
    let stored: Submission["captureLocation"] = null;
    if (checkLocation && req.location && store) {
      stored = this.locationPrecheck(claim, req.location, store);
    }

    const clean = this.clean(bytes);
    const dup = this.d.store.submissions.all().find((s) => s.imageSha256 === clean.sha256);
    if (dup)
      throw new AppError("duplicate_image", "This photo was already submitted. Take a new photo.");

    const subId = newSubmissionId(this.d.ids);
    const imageRef = `${subId}.jpg`;
    writeFileSync(join(this.d.imageDir, imageRef), clean.bytes, { flag: "wx", mode: 0o600 });
    const now = this.d.clock.nowIso();
    const sub: Submission = {
      id: subId,
      claimId: claim.id,
      taskId: task.id,
      receivedAt: now,
      outcome: req.outcome,
      imageSha256: clean.sha256,
      imageRef,
      clientMeta: {
        ...req.clientMeta,
        ...(req.clientMeta.userAgent !== undefined
          ? { userAgent: req.clientMeta.userAgent.slice(0, 200) }
          : {}),
      },
      captureLocation: stored,
      exifPresent: clean.exifPresent,
      verifyIdempotencyKey: verifyIdempotencyKey(subId),
      state: "RECEIVED",
    };
    this.d.store.submissions.put(sub);
    this.d.store.claims.put({
      ...claim,
      state: transition("claim", claim.state, "submission_received"),
    });
    const received = this.setTask(task, {
      state: transition("task", task.state, "photo_received"),
    });
    this.setTask(received, { state: transition("task", received.state, "verify_started") });
    this.d.store.submissions.put({
      ...sub,
      state: transition("submission", sub.state, "verify_started"),
    });
    this.led({
      kind: "SUBMISSION_RECEIVED",
      refs: { jobId: job.id, taskId: task.id, submissionId: subId },
      note: `outcome=${req.outcome} sha256=${clean.sha256.slice(0, 12)} bytes=${clean.bytes.length}${clean.exifPresent ? " exifPresent" : ""}`,
      flags: adminTest ? { adminTestUpload: true } : {},
    });
    this.d.logger.info("submission_received", {
      jobId: job.id,
      taskId: task.id,
      submissionId: subId,
      bytes: clean.bytes.length,
    });
    const position = ++this.pendingVerifications;
    this.track(this.enqueueVerification(subId));
    return {
      status: 202,
      body: { submission: { id: subId, state: "VERIFYING", queuePosition: position } },
    };
  }

  private clean(bytes: Buffer): ReturnType<typeof cleanJpeg> {
    return cleanJpeg(bytes, { ...DEFAULT_IMAGE_LIMITS, maxBytes: this.env.MAX_IMAGE_BYTES });
  }

  private submissionAck(s: Submission): unknown {
    return {
      submission: {
        id: s.id,
        state: s.state === "RECEIVED" ? "VERIFYING" : s.state,
        queuePosition: 0,
      },
    };
  }

  private locationPrecheck(
    claim: Claim,
    loc: CaptureLocation,
    store: NonNullable<ReturnType<Catalog["store"]>>,
  ): NonNullable<Submission["captureLocation"]> {
    const cfg = this.d.pack.config.location;
    const res = precheckLocation(loc, store, {
      defaultGeofenceM: this.env.DEFAULT_GEOFENCE_M,
      accuracyCapM: this.env.ACCURACY_CAP_M,
      maxAccuracyM: cfg.maxAccuracyM,
      maxFixAgeMs: cfg.maxFixAgeMs,
    });
    const tries = claim.locationTries + (res.ok ? 0 : 1);
    this.led({
      kind: "LOCATION_CHECKED",
      refs: { claimId: claim.id, try: String(claim.locationTries + 1) },
      note: `${res.ok ? "pass" : res.code} distanceM=${res.distanceM} allowedM=${res.allowedM}`,
    });
    if (res.ok) {
      return { distanceM: res.distanceM, accuracyM: loc.accuracyM, withinGeofence: true };
    }
    const updated: Claim = { ...claim, locationTries: tries };
    this.d.store.claims.put(updated);
    let released = false;
    if (tries >= this.env.LOCATION_MAX_TRIES) {
      this.releaseActive(updated, "location_tries_exhausted");
      released = true;
    }
    const message =
      res.code === "location_inaccurate"
        ? "Wait for a better GPS signal and try again."
        : "You do not seem to be at the store. Move to the shelf and try again.";
    throw new AppError(res.code, message, undefined, {
      ...(res.code === "location_mismatch"
        ? { distanceM: res.distanceM, allowedM: res.allowedM }
        : {}),
      triesLeft: Math.max(0, this.env.LOCATION_MAX_TRIES - tries),
      claimReleased: released,
    });
  }

  // ------------------------------------------------------------------ verification
  private enqueueVerification(subId: string): Promise<void> {
    const run = this.verifyChain.then(() => this.runVerification(subId));
    this.verifyChain = run.catch(() => undefined);
    return run.finally(() => {
      this.pendingVerifications = Math.max(0, this.pendingVerifications - 1);
    });
  }

  private buildVerifyRequest(sub: Submission): VerifyRequest {
    const task = this.d.store.tasks.get(sub.taskId);
    const claim = this.d.store.claims.get(sub.claimId);
    if (!task || !claim) throw new Error("submission without task or claim");
    const job = this.jobOf(task);
    const store = this.d.catalog.store(task.spec.storeId);
    const product = this.d.catalog.product(task.spec.productEan);
    if (!store || !product) throw new Error("catalog entry vanished");
    const bytes = readFileSync(join(this.d.imageDir, sub.imageRef));
    const previous = this.d.store.submissions
      .all()
      .filter(
        (s) =>
          s.id !== sub.id &&
          s.state === "PASSED" &&
          this.jobOf(this.mustTask(s.taskId)).id === job.id,
      )
      .map((s) => s.imageSha256);
    return {
      packId: job.packId,
      submissionId: sub.id,
      task: {
        taskId: task.id,
        product: {
          name: product.name,
          ean: product.ean,
          aliases: product.aliases,
          priceMinEur: product.priceMinEur,
          priceMaxEur: product.priceMaxEur,
        },
        store: { id: store.id, name: store.name },
        expectedCode: claim.challengeCode,
        ...(claim.gesture
          ? {
              expectedGesture: claim.gesture,
              // submitPhoto refuses unrevealed claims; the fallback only keeps the type total
              challengeRevealedAt: claim.challengeRevealedAt ?? claim.issuedAt,
            }
          : {}),
        outcome: sub.outcome,
        claimIssuedAt: claim.issuedAt,
        claimExpiresAt: claim.expiresAt,
        taskWindowEndsAt: job.windowEndsAt,
        receivedAt: sub.receivedAt,
      },
      image: { mimeType: "image/jpeg", base64: bytes.toString("base64"), sha256: sub.imageSha256 },
      previousImageSha256: previous,
    };
  }

  private async runVerification(subId: string): Promise<void> {
    let sub = this.d.store.submissions.get(SubmissionIdSchema.parse(subId));
    if (!sub) return;
    const backoff = this.d.verifyBackoffMs ?? [500, 2000];
    let response: { verdict: VerifyResponse; txHash: string } | null = null;
    for (let attempt = 0; attempt <= MAX_VERIFY_RETRIES; attempt++) {
      sub = this.d.store.submissions.get(sub.id) ?? sub;
      try {
        const req = this.buildVerifyRequest(sub);
        const r = await this.d.verifyClient.verify(req, sub.verifyIdempotencyKey);
        response = {
          verdict: parseOrThrow(VerifyResponseSchema, r.verdict, "dependency_unavailable"),
          txHash: r.txHash,
        };
        break;
      } catch (err) {
        this.d.logger.warn("verify_transport_error", {
          submissionId: sub.id,
          attempt,
          code: err instanceof AppError ? err.code : "error",
        });
        sub = this.setSubmission(sub, transition("submission", sub.state, "transport_error"));
        if (attempt === MAX_VERIFY_RETRIES) {
          this.verifyErrorFinal(sub);
          return;
        }
        await this.sleep(backoff[attempt] ?? 1000);
        sub = this.setSubmission(sub, transition("submission", sub.state, "retry"));
      }
    }
    if (response) this.applyVerdict(sub, response.verdict, response.txHash);
  }

  private setSubmission(sub: Submission, state: Submission["state"]): Submission {
    const next = { ...sub, state };
    this.d.store.submissions.put(next);
    return next;
  }

  private verifyErrorFinal(sub: Submission): void {
    const final = this.setSubmission(sub, transition("submission", sub.state, "retries_exhausted"));
    const task = this.d.store.tasks.get(final.taskId);
    if (task && task.state === "VERIFYING") {
      const reopened = this.setTask(task, {
        state: transition("task", task.state, "verify_error_final"),
        currentClaimId: null,
      });
      const job = this.jobOf(reopened);
      this.led({
        kind: "ADMIN_ACTION",
        refs: { action: "verify_error_final", submissionId: final.id },
        flags: { operatorAlert: true },
      });
      this.led({
        kind: "TASK_OPENED",
        refs: { jobId: job.id, taskId: task.id, after: final.claimId },
      });
      if (job.state === "COLLECTING") this.emitOpened(reopened, job);
    }
    this.d.logger.error("verify_error_final", { submissionId: final.id });
  }

  private applyVerdict(sub: Submission, v: VerifyResponse, txHash: string): void {
    const task = this.d.store.tasks.get(sub.taskId);
    if (!task) return;
    const job = this.jobOf(task);
    const verdict: Verdict = {
      id: newVerdictId(this.d.ids),
      submissionId: sub.id,
      pass: v.pass,
      gates: v.gates,
      failedGates: v.failedGates,
      extraction: v.extraction,
      outcome: v.outcome,
      workerMessage: v.workerMessage,
      verifierTx: txHash.length > 0 ? txHash : null,
      source: "GATE",
      overrideReason: null,
      modelId: v.model.id,
      latencyMs: v.model.latencyMs,
      supersedesVerdictId: null,
      createdAt: this.d.clock.nowIso(),
    };
    this.d.store.verdicts.put(verdict);
    if (verdict.verifierTx) {
      this.led({
        kind: "VERIFY_PAID",
        refs: { jobId: job.id, submissionId: sub.id },
        txHash: verdict.verifierTx,
      });
    }
    this.led({
      kind: "VERDICT",
      refs: { jobId: job.id, taskId: task.id, submissionId: sub.id, verdictId: verdict.id },
      note: `${v.pass ? "PASS" : "FAIL"} outcome=${v.outcome}${v.failedGates.length ? ` failed=${v.failedGates.join(",")}` : ""}${v.cached ? " cached" : ""}`,
    });

    const late = job.state !== "COLLECTING"; // decision already made: it never flips
    const attempts = task.attempts + 1;
    if (v.pass && !late) {
      this.setSubmission(sub, transition("submission", "VERIFYING", "verdict_pass"));
      this.accept(task, sub, attempts, v.outcome);
    } else {
      this.setSubmission(sub, transition("submission", "VERIFYING", "verdict_fail"));
      if (!late && attempts < task.maxAttempts) {
        const reopened = this.setTask(task, {
          state: transition("task", task.state, "verdict_fail_retry"),
          attempts,
          currentClaimId: null,
        });
        this.led({
          kind: "TASK_OPENED",
          refs: { jobId: job.id, taskId: task.id, after: sub.claimId },
        });
        this.emitOpened(reopened, job);
      } else {
        const failed = this.setTask(task, {
          state: transition("task", task.state, "verdict_fail_final"),
          attempts,
        });
        this.emitClosed(failed, "done");
        if (late)
          this.led({
            kind: "ADMIN_ACTION",
            refs: { action: "late_verdict", submissionId: sub.id },
            note: "verdict arrived after the decision; ignored",
          });
      }
    }
    this.sweep();
  }

  private accept(task: Task, sub: Submission, attempts: number, outcome: Outcome): void {
    const claim = this.d.store.claims.get(sub.claimId);
    const accepted = this.setTask(task, {
      state: transition("task", task.state, "verdict_pass"),
      attempts,
      acceptedSubmissionId: sub.id,
      acceptedOutcome: outcome,
    });
    this.emitClosed(accepted, "done");
    if (!claim) return;
    this.track(this.startPayout(accepted, claim));
  }

  // ------------------------------------------------------------------ payouts
  private async startPayout(task: Task, claim: Claim): Promise<void> {
    const job = this.jobOf(task);
    let payout: Payout;
    try {
      payout = await this.d.payoutQueue.enqueue({
        taskId: task.id,
        toAddress: claim.payoutAddress,
        lovelace: task.payoutAmount,
      });
    } catch (err) {
      this.d.logger.error("payout_enqueue_failed", {
        taskId: task.id,
        code: err instanceof AppError ? err.code : "error",
      });
      this.led({
        kind: "ADMIN_ACTION",
        refs: { action: "payout_enqueue_failed", taskId: task.id },
        flags: { operatorAlert: true },
      });
      return;
    }
    this.d.store.payouts.put(payout);
    this.led({
      kind: "PAYOUT_QUEUED",
      refs: { jobId: job.id, taskId: task.id, payoutId: payout.id },
      note: `to ${shortAddress(payout.toAddress)} lovelace=${payout.amount}`,
    });
    await this.watchPayout(payout.id);
  }

  private async watchPayout(payoutId: string): Promise<void> {
    if (this.watching.has(payoutId)) return;
    this.watching.add(payoutId);
    try {
      const pollMs = this.d.payoutPollMs ?? 2000;
      for (let i = 0; i < 600; i++) {
        await this.sleep(pollMs);
        const p = await this.d.payoutQueue.get(payoutId);
        const prev = this.d.store.payouts.get(p.id);
        this.d.store.payouts.put(p);
        const job = this.jobOf(this.mustTask(p.taskId));
        if (p.state === "SUBMITTED" && p.txHash) {
          this.led({
            kind: "PAYOUT_SUBMITTED",
            refs: { jobId: job.id, taskId: p.taskId, payoutId: p.id },
            txHash: p.txHash,
          });
        }
        if (p.state === "CONFIRMED" && p.txHash) {
          this.led({
            kind: "PAYOUT_SUBMITTED",
            refs: { jobId: job.id, taskId: p.taskId, payoutId: p.id },
            txHash: p.txHash,
          });
          this.led({
            kind: "PAYOUT_CONFIRMED",
            refs: { jobId: job.id, taskId: p.taskId, payoutId: p.id },
            txHash: p.txHash,
          });
          this.markTaskPaid(p.taskId);
          return;
        }
        if (p.state === "FAILED_FINAL" || p.state === "UNKNOWN") {
          if (prev?.state !== p.state) {
            this.led({
              kind: "ADMIN_ACTION",
              refs: { action: `payout_${p.state.toLowerCase()}`, payoutId: p.id },
              flags: { operatorAlert: true },
            });
          }
          return; // operator reconciles / retries
        }
      }
    } finally {
      this.watching.delete(payoutId);
    }
  }

  private markTaskPaid(taskId: string): void {
    const task = this.d.store.tasks.get(TaskIdSchema.parse(taskId));
    if (task && task.state === "ACCEPTED") {
      this.setTask(task, { state: transition("task", task.state, "payout_confirmed") });
    }
    this.sweep();
  }

  listPayouts(query: unknown): { payouts: unknown[] } {
    const q = parseOrThrow(PayoutsQuerySchema, query, "invalid_request");
    const rows = this.d.store.payouts.all().filter((p) => {
      if (!q.jobId) return true;
      const t = this.d.store.tasks.get(p.taskId);
      return t?.jobId === q.jobId;
    });
    return { payouts: rows.map((p) => this.payoutRow(p)) };
  }

  private payoutRow(p: Payout): Record<string, unknown> {
    return {
      id: p.id,
      taskId: p.taskId,
      state: p.state,
      amount: p.amount,
      txHash: p.txHash,
      explorerUrl: p.txHash ? (txUrl(p.txHash, this.env.EXPLORER_TX_BASE) ?? null) : null,
    };
  }

  private mustPayout(id: string): Payout {
    const parsed = PayoutIdSchema.safeParse(id);
    const p = parsed.success ? this.d.store.payouts.get(parsed.data) : undefined;
    if (!p) throw new AppError("not_found", "Payout not found.");
    return p;
  }

  async adminReconcile(id: string): Promise<{ payout: unknown }> {
    const p = this.mustPayout(id);
    const next = await this.d.payoutQueue.reconcile(p.id);
    this.d.store.payouts.put(next);
    this.led({
      kind: "PAYOUT_RECONCILED",
      refs: { payoutId: p.id, state: next.state, at: this.d.clock.nowIso() },
      ...(next.txHash ? { txHash: next.txHash } : {}),
    });
    this.track(this.watchPayout(p.id));
    return { payout: this.payoutRow(next) };
  }

  async adminRetry(id: string): Promise<{ payout: unknown }> {
    const p = this.mustPayout(id);
    transition("payout", p.state, "operator_retry"); // legality only; throws 409 otherwise
    if (!this.d.payoutQueue.retry) {
      throw new AppError("dependency_unavailable", "The payout queue does not support retry yet."); // TODO(integration) @shelfie/payments
    }
    const next = await this.d.payoutQueue.retry(p.id);
    this.d.store.payouts.put(next);
    this.led({
      kind: "ADMIN_ACTION",
      refs: { action: "payout_retry", payoutId: p.id, at: this.d.clock.nowIso() },
    });
    this.track(this.watchPayout(p.id));
    return { payout: this.payoutRow(next) };
  }

  async adminMarkPaid(id: string, body: unknown): Promise<{ payout: unknown }> {
    const { txHash } = parseOrThrow(MarkPaidRequestSchema, body);
    const p = this.mustPayout(id);
    const state = transition("payout", p.state, "operator_mark_paid");
    const next: Payout = this.d.payoutQueue.markPaid
      ? await this.d.payoutQueue.markPaid(p.id, txHash)
      : { ...p, state, txHash };
    this.d.store.payouts.put(next);
    const task = this.mustTask(next.taskId);
    this.led({
      kind: "PAYOUT_MARKED_PAID",
      refs: { jobId: task.jobId, taskId: task.id, payoutId: p.id },
      txHash,
      flags: { operatorMarkedPaid: true },
    });
    this.markTaskPaid(task.id);
    return { payout: this.payoutRow(next) };
  }

  // ------------------------------------------------------------------ views
  getSubmission(id: string): SubmissionView {
    this.sweep();
    const parsed = SubmissionIdSchema.safeParse(id);
    const sub = parsed.success ? this.d.store.submissions.get(parsed.data) : undefined;
    if (!sub) throw new AppError("not_found", "Submission not found.");
    const task = this.mustTask(sub.taskId);
    const verdict = this.latestVerdict(sub.id);
    const ex = verdict?.extraction;
    const priceText = textOf(ex?.["price"]);
    const productText = textOf(ex?.["product"]);
    const payout = task.acceptedSubmissionId === sub.id ? this.payoutOfTask(task.id) : undefined;
    return {
      id: sub.id,
      state: sub.state === "RECEIVED" ? "VERIFYING" : sub.state,
      verdict: verdict
        ? {
            outcome: verdict.outcome,
            pass: verdict.pass,
            failedGates: verdict.failedGates,
            workerMessage: verdict.workerMessage,
            extraction: {
              ...(priceText ? { priceText } : {}),
              ...(productText ? { productText } : {}),
            },
          }
        : null,
      task: {
        id: task.id,
        state: task.state,
        attemptsLeft: Math.max(0, task.maxAttempts - task.attempts),
      },
      payout: payout
        ? {
            state: payout.state,
            txHash: payout.txHash,
            explorerUrl: payout.txHash
              ? (txUrl(payout.txHash, this.env.EXPLORER_TX_BASE) ?? null)
              : null,
          }
        : null,
    };
  }

  catalogView(): CatalogResponse {
    const byCity = new Map<
      string,
      { id: string; name: string; stores: CatalogResponse["cities"][number]["stores"] }
    >();
    for (const s of this.d.catalog.stores) {
      const id = cityIdFromName(s.city);
      const c = byCity.get(id) ?? { id, name: s.city, stores: [] };
      c.stores.push({
        id: s.id,
        name: s.name,
        chain: s.chain,
        address: s.address,
        lat: s.lat,
        lon: s.lon,
        ...(s.aliases?.length ? { aliases: s.aliases } : {}),
      });
      byCity.set(id, c);
    }
    const products = this.d.catalog.products.map((p) => ({ ean: p.ean, name: p.name }));
    return { cities: [...byCity.values()].map((c) => ({ ...c, products })) };
  }

  configView(secureContext: boolean): ConfigResponse {
    const env = this.env;
    const brands = brandAccounts(env).length > 0;
    const verifierMode = env.VERIFY_CLIENT ?? (env.FAKE_PAYMENTS ? "fake" : "real");
    const fakeReady =
      env.SOKOSUMI_CLIENT === "fake" &&
      env.FAKE_PAYMENTS &&
      verifierMode === "fake" &&
      !env.EVIDENCE_RUN_LOCKED;
    // Real orders (ADR-22): everything RealSokosumiClient needs, plus real payments and verifier.
    const realReady =
      env.SOKOSUMI_CLIENT === "real" &&
      Boolean(env.SOKOSUMI_API_URL) &&
      Boolean(env.SOKOSUMI_API_TOKEN) &&
      Boolean(env.SOKOSUMI_COWORKER_ID) &&
      Boolean(env.SOKOSUMI_ORGANIZATION_SLUG) &&
      !env.FAKE_PAYMENTS &&
      verifierMode === "real";
    return {
      packId: this.d.pack.config.id,
      ui: this.d.pack.config.ui,
      explorerTxBase: this.env.EXPLORER_TX_BASE,
      explorerAddressBase: this.env.EXPLORER_ADDRESS_BASE,
      challengeMode: this.d.pack.config.worker.challenge ? this.challengeMode() : "none",
      secureContext,
      demoOverrideEnabled: this.env.ALLOW_DEMO_OVERRIDE,
      orders: {
        fake: this.env.SOKOSUMI_CLIENT === "fake",
        enabled: brands && (fakeReady || realReady),
        realReady: brands && realReady,
        maxStores: this.env.ORDER_MAX_STORES,
        maxCreditsPerTask: this.env.SOKOSUMI_MAX_CREDITS_PER_TASK,
      },
    };
  }

  async health(): Promise<HealthResponse> {
    const [pay, vbuy, up] = await Promise.all([
      this.d.probe.payBalanceLovelace().catch(() => "0"),
      // null = balance unknown (no address configured or lookup failed): never reported as empty.
      this.d.probe.vbuyBalanceLovelace().catch(() => null),
      this.d.probe.verifierUp().catch(() => false),
    ]);
    return {
      ok: up || this.d.fakes.verifier,
      packId: this.d.pack.config.id,
      network: "preprod",
      wallets: {
        vbuy: vbuy === null ? { balanceLovelace: "0", unknown: true } : { balanceLovelace: vbuy },
        pay: { balanceLovelace: pay, queueDepth: this.d.probe.payQueueDepth() },
      },
      verifier: up || this.d.fakes.verifier ? "up" : "down",
      fakes: { payments: this.d.fakes.payments, verifier: this.d.fakes.verifier },
    };
  }

  ledgerView(query: unknown): { entries: unknown[] } {
    const q = parseOrThrow(LedgerQuerySchema, query, "invalid_request");
    return { entries: this.d.ledger.read(q.afterSeq, q.limit) };
  }

  get ledger(): Ledger {
    return this.d.ledger;
  }

  // ------------------------------------------------------------------ shell settlement events
  settlementEvent(jobId: string, body: unknown): Reply<unknown> {
    this.sweep();
    const job = this.mustJob(jobId);
    const ev = parseOrThrow(SettlementEventRequestSchema, body);
    const st = this.d.store.settlements.all().find((s) => s.jobId === job.id);
    const txHash = ev.txHash ?? undefined;
    const refs = { jobId: job.id, ...(ev.ref ? { ref: ev.ref.slice(0, 80) } : {}) };
    const note = ev.note.slice(0, 300);
    const put = (patch: Partial<Settlement>): void => {
      if (st) this.d.store.settlements.put({ ...st, ...patch });
    };
    switch (ev.event) {
      case "ESCROW_LOCKED":
        put({
          escrowRefs: {
            ...(st?.escrowRefs ?? { lockTx: null, settleTx: null, refundTx: null }),
            lockTx: txHash ?? null,
          },
        });
        this.led({ kind: "ESCROW_LOCKED", refs, note, ...(txHash ? { txHash } : {}) });
        break;
      case "INTAKE_REJECTED":
        this.led({ kind: "INTAKE_REJECTED", refs: { ...refs, source: "shell" }, note });
        break;
      case "RESULT_SUBMITTED": {
        if (st && (st.state === "RESULT_SUBMITTED" || st.state === "SETTLED")) break; // repeat: no-op
        const next = transition("job", job.state, "shell_submitted");
        this.setJob(job, { state: next });
        put({
          state: transition("settlement", st?.state ?? "DELIVER", "result_submitted"),
          shellAction: "RESULT_SUBMITTED",
          resultHash: sha256Hex(job.reportMd ?? ""),
        });
        this.led({ kind: "RESULT_SUBMITTED", refs, note, ...(txHash ? { txHash } : {}) });
        break;
      }
      case "SETTLED": {
        if (st?.state === "SETTLED") break;
        this.setJob(job, { state: transition("job", job.state, "settlement_observed") });
        put({
          state: transition("settlement", st?.state ?? "RESULT_SUBMITTED", "settled"),
          escrowRefs: {
            ...(st?.escrowRefs ?? { lockTx: null, settleTx: null, refundTx: null }),
            settleTx: txHash ?? null,
          },
        });
        this.led({ kind: "SETTLED", refs, note, ...(txHash ? { txHash } : {}) });
        break;
      }
      case "WITHHELD": {
        if (st && (st.state === "WITHHELD" || st.state === "REFUNDED")) break;
        if (job.state !== "WITHHELD")
          throw new AppError("invalid_transition", "The job was not withheld.", undefined, {
            state: job.state,
          });
        put({
          state: transition("settlement", st?.state ?? "WITHHOLD", "withheld"),
          shellAction: "WITHHELD",
        });
        this.led({ kind: "WITHHELD", refs, note, ...(txHash ? { txHash } : {}) });
        break;
      }
      case "REFUND_OBSERVED": {
        if (st?.state === "REFUNDED") break;
        this.setJob(job, { state: transition("job", job.state, "refund_observed") });
        put({
          state: transition("settlement", st?.state ?? "WITHHELD", "refunded"),
          escrowRefs: {
            ...(st?.escrowRefs ?? { lockTx: null, settleTx: null, refundTx: null }),
            refundTx: txHash ?? null,
          },
        });
        this.led({ kind: "REFUND_OBSERVED", refs, note, ...(txHash ? { txHash } : {}) });
        break;
      }
    }
    return { status: 200, body: { ok: true, jobState: this.mustJob(job.id).state } };
  }

  // ------------------------------------------------------------------ admin
  adminOverride(submissionId: string, body: unknown): Reply<unknown> {
    if (!this.env.ALLOW_DEMO_OVERRIDE) {
      throw new AppError("override_disabled", "Demo override is disabled.");
    }
    const req = parseOrThrow(OverrideRequestSchema, body);
    const parsed = SubmissionIdSchema.safeParse(submissionId);
    const sub = parsed.success ? this.d.store.submissions.get(parsed.data) : undefined;
    if (!sub) throw new AppError("not_found", "Submission not found.");
    const prev = this.latestVerdict(sub.id);
    if (!prev) throw new AppError("unprocessable", "The submission has no verdict yet.");
    if (prev.pass === req.pass)
      throw new AppError("unprocessable", "The verdict already has this result.");
    const task = this.mustTask(sub.taskId);
    const job = this.jobOf(task);
    if (!req.pass)
      throw new AppError("unprocessable", "Overriding a pass to a fail is not supported."); // verify Friday
    if (job.state !== "COLLECTING" || task.state !== "OPEN") {
      throw new AppError(
        "invalid_transition",
        "Override needs an open task in a running job.",
        undefined,
        { task: task.state, job: job.state },
      );
    }
    const verdict: Verdict = {
      ...prev,
      id: newVerdictId(this.d.ids),
      pass: true,
      failedGates: [],
      workerMessage: "Accepted by an operator (demo override).",
      source: "MANUAL_OVERRIDE",
      overrideReason: req.reason.slice(0, 200),
      supersedesVerdictId: prev.id,
      createdAt: this.d.clock.nowIso(),
    };
    this.d.store.verdicts.put(verdict);
    this.led({
      kind: "OVERRIDE",
      refs: { jobId: job.id, submissionId: sub.id, verdictId: verdict.id },
      note: `override pass: ${verdict.overrideReason ?? ""}`,
      flags: { demoOverride: true },
    });
    // Replay the legal path to ACCEPTED through the state machine (no direct state edit).
    let t = this.setTask(task, { state: transition("task", task.state, "claim") });
    t = this.setTask(t, { state: transition("task", t.state, "photo_received") });
    t = this.setTask(t, { state: transition("task", t.state, "verify_started") });
    this.accept(t, sub, task.attempts, verdict.outcome);
    this.sweep();
    return {
      status: 200,
      body: { verdict: { id: verdict.id, pass: true, source: verdict.source } },
    };
  }

  adminReset(): { ok: true } {
    if (this.env.NODE_ENV === "production" || this.d.evidenceRunLocked === true) {
      throw new AppError("forbidden", "Reset is refused in production and during evidence runs.");
    }
    this.d.store.clear();
    this.led({
      kind: "ADMIN_ACTION",
      refs: { action: "reset", at: this.d.clock.nowIso() },
      flags: { reset: true },
    });
    return { ok: true };
  }

  // ------------------------------------------------------------------ lifecycle
  /** Timer entry point (main.ts calls it every second). */
  tick(): void {
    this.sweep();
  }

  /** Re-attach payout watchers and unfinished verifications after a restart. */
  resume(): void {
    for (const p of this.d.store.payouts.all()) {
      if (["QUEUED", "SENDING", "SUBMITTED", "UNKNOWN"].includes(p.state))
        this.track(this.watchPayout(p.id));
    }
    for (const s of this.d.store.submissions.all()) {
      if (
        (s.state === "VERIFYING" || s.state === "VERIFY_RETRY") &&
        existsSync(join(this.d.imageDir, s.imageRef))
      ) {
        this.pendingVerifications++;
        this.track(this.enqueueVerification(s.id));
      }
    }
  }

  cityBoxes(): readonly { id: string; name: string }[] {
    return CITY_BOXES;
  }
}

function textOf(v: unknown): string | null {
  if (v !== null && typeof v === "object") {
    const t = (v as Record<string, unknown>)["text"];
    if (typeof t === "string" && t.length > 0) return t.slice(0, 80);
  }
  return null;
}

export type { FeedEvent };
