import { z } from "zod";
import {
  BrandIdSchema,
  BrandWalletAddressSchema,
  CaptureLocationSchema,
  ClaimLocationSchema,
  ImageMimeTypeSchema,
  IsoTimestampSchema,
  JobSourceSchema,
  LovelaceSchema,
  OutcomeSchema,
} from "./common.js";
import {
  ChallengeModeSchema,
  ClientMetaSchema,
  DecisionSchema,
  JobInputSchema,
  LedgerEventSchema,
  SettlementEventNameSchema,
} from "./entities.js";
import {
  ClaimIdSchema,
  JobIdSchema,
  PayoutIdSchema,
  SubmissionIdSchema,
  TaskIdSchema,
  WorkerIdSchema,
} from "./ids.js";
import {
  ClaimStateSchema,
  JobStateSchema,
  PayoutStateSchema,
  SubmissionStateSchema,
  TaskStateSchema,
} from "./states.js";
import { ExtractionSchema, GateNameSchema, GestureChallengeSchema } from "./verify.js";

// Request/response schemas for contracts.md sections 1 (engine). Verifier schemas: ./verify.ts.

// ---------------------------------------------------------------- Orders (ADR-20)
export const OrderIdSchema = z.string().regex(/^ord_[A-Za-z0-9]+$/);
export const OrderStoreIdSchema = z
  .string()
  .min(1)
  .max(160)
  .regex(/^[A-Za-z0-9_-]+$/);
export const OrderRefSchema = z.strictObject({
  orderId: OrderIdSchema,
  storeId: OrderStoreIdSchema,
});
export const CreateOrderRequestSchema = z.strictObject({
  productEan: z.string().regex(/^\d{8,14}$/),
  storeIds: z
    .array(OrderStoreIdSchema)
    .min(1)
    .max(100)
    .refine((ids) => new Set(ids).size === ids.length, "Duplicate stores"),
  note: z.string().max(500).optional(),
});
export type CreateOrderRequest = z.infer<typeof CreateOrderRequestSchema>;
export const OrderIdempotencyKeySchema = z
  .string()
  .min(8)
  .max(100)
  .regex(/^[A-Za-z0-9_-]+$/);
export const OrderPurchaseStatusSchema = z.enum([
  "SUBMITTING",
  "AWAITING_SHELL",
  "SOKOSUMI_UNAVAILABLE",
]);
/** Per-store outcome shown to the brand; derived by the engine from the job, never stored. */
export const OrderResultSchema = z.strictObject({
  outcome: z.enum(["passed", "out_of_stock", "failed", "timed_out", "open"]),
  /** Price read from the accepted photo (EUR), only for a passed price check. */
  priceEur: z.number().nonnegative().max(100_000).optional(),
  /** Plain-words reason for a failed check. */
  reason: z.string().max(240).optional(),
  /** True once the job has a report (opened from the job detail). */
  reportReady: z.boolean(),
});
export type OrderResult = z.infer<typeof OrderResultSchema>;
export const OrderJobSchema = z.strictObject({
  storeId: OrderStoreIdSchema,
  sokosumiTaskId: z
    .string()
    .min(1)
    .max(200)
    .regex(/^[A-Za-z0-9_-]+$/)
    .nullable(),
  jobId: JobIdSchema.nullable(),
  /** Sokosumi price of this store's Task, recorded when the Task was created; absent if unknown. */
  credits: z.number().nonnegative().max(1_000_000_000).optional(),
  result: OrderResultSchema.optional(),
  status: z.enum([
    ...OrderPurchaseStatusSchema.options,
    ...JobStateSchema.options,
    ...TaskStateSchema.options,
  ]),
});
export const OrderViewSchema = z.strictObject({
  orderId: OrderIdSchema,
  productEan: z.string().regex(/^\d{8,14}$/),
  createdAt: IsoTimestampSchema,
  fake: z.boolean(),
  jobs: z.array(OrderJobSchema),
});
export type OrderView = z.infer<typeof OrderViewSchema>;
export const OrderListResponseSchema = z.strictObject({ orders: z.array(OrderViewSchema) });
/** Durable purchase reservations; note deliberately not retained. */
export const OrderRecordSchema = z.strictObject({
  id: OrderIdSchema,
  productEan: z.string().regex(/^\d{8,14}$/),
  createdAt: IsoTimestampSchema,
  fake: z.boolean(),
  idempotencyKey: OrderIdempotencyKeySchema,
  requestHash: z.string().regex(/^[a-f0-9]{64}$/),
  reservedCredits: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  jobs: z.array(OrderJobSchema),
  // ADR-21: owner of the order. Records written before per-brand access codes lack it (= demo).
  brandId: BrandIdSchema.optional(),
});
export type OrderRecord = z.infer<typeof OrderRecordSchema>;

/** GET /api/brand/me (ADR-21). Never carries the access code. */
export const BrandProfileSchema = z.strictObject({
  brandId: BrandIdSchema,
  name: z.string().min(1).max(60),
  walletAddress: BrandWalletAddressSchema.nullable(),
  creditsReservedToday: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  dailyCreditCap: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  maxCreditsPerTask: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  maxStores: z.number().int().positive(),
  fake: z.boolean(),
});
export type BrandProfile = z.infer<typeof BrandProfileSchema>;

/**
 * GET /api/brand/summary: spend and check counts over the calling brand's own orders. Credits count
 * only rows whose Sokosumi price was recorded; `unpricedChecks` says how many settled or refunded
 * checks have no recorded price (never estimated).
 */
export const BrandSummarySchema = z.strictObject({
  credits: z.strictObject({
    spent: z.number().nonnegative(),
    refunded: z.number().nonnegative(),
    unpricedChecks: z.number().int().nonnegative(),
  }),
  checks: z.strictObject({
    passed: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
    timedOut: z.number().int().nonnegative(),
    open: z.number().int().nonnegative(),
  }),
});
export type BrandSummary = z.infer<typeof BrandSummarySchema>;

/** One on-chain transaction that belongs to one of the calling brand's store checks. */
export const BrandTransactionKindSchema = z.enum([
  "escrow_lock",
  "result_submitted",
  "settlement",
  "refund",
  "verifier_fee",
  "worker_payout",
]);
export const BrandTransactionSchema = z.strictObject({
  orderId: OrderIdSchema,
  storeId: OrderStoreIdSchema,
  jobId: JobIdSchema,
  kind: BrandTransactionKindSchema,
  txHash: z.string().min(1).max(200),
  explorerUrl: z.string().max(400).optional(),
  ts: IsoTimestampSchema.optional(),
});
export type BrandTransaction = z.infer<typeof BrandTransactionSchema>;
export const BrandTransactionsResponseSchema = z.strictObject({
  transactions: z.array(BrandTransactionSchema),
});
export type BrandTransactionsResponse = z.infer<typeof BrandTransactionsResponseSchema>;

// ---------------------------------------------------------------- 1.1 Jobs
/** POST /api/jobs. Strict: free-text fields (product.name, store.address ...) are a 422. */
export const CreateJobRequestSchema = z.strictObject({
  packId: z.string().min(1),
  source: JobSourceSchema,
  externalRef: z.string().min(1),
  input: JobInputSchema,
  orderRef: OrderRefSchema.optional(),
  windowSec: z.number().int().positive().optional(),
});
export type CreateJobRequest = z.infer<typeof CreateJobRequestSchema>;

export const CreateJobResponseSchema = z.object({
  job: z.object({
    id: JobIdSchema,
    state: JobStateSchema,
    n: z.number().int().positive(),
    k: z.number().int().positive(),
    windowEndsAt: IsoTimestampSchema,
  }),
  tasks: z.array(
    z.object({ id: TaskIdSchema, state: TaskStateSchema, spec: z.record(z.string(), z.unknown()) }),
  ),
});
export type CreateJobResponse = z.infer<typeof CreateJobResponseSchema>;

export const JobCountsSchema = z.object({
  passed: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  open: z.number().int().nonnegative(),
});

/** GET /api/jobs/{jobId}. Shape beyond "job with tasks, counts, decision, settlement" is a reading. // verify Friday */
export const JobViewSchema = z.object({
  job: z.object({
    id: JobIdSchema,
    packId: z.string(),
    source: JobSourceSchema,
    externalRef: z.string(),
    state: JobStateSchema,
    n: z.number().int().positive(),
    k: z.number().int().positive(),
    windowEndsAt: IsoTimestampSchema,
    createdAt: IsoTimestampSchema,
    reportMd: z.string().nullable(),
  }),
  tasks: z.array(
    z.object({
      id: TaskIdSchema,
      state: TaskStateSchema,
      spec: z.record(z.string(), z.unknown()),
      attempts: z.number().int().nonnegative(),
      acceptedOutcome: OutcomeSchema.nullable(),
    }),
  ),
  counts: JobCountsSchema,
  decision: DecisionSchema.nullable(),
  settlement: z
    .object({
      state: z.string(),
      resultHash: z.string().nullable(),
      txHashes: z.record(z.string(), z.string().nullable()).default({}),
    })
    .nullable(),
});
export type JobView = z.infer<typeof JobViewSchema>;

export const JobListResponseSchema = z.object({ jobs: z.array(JobViewSchema.shape.job) });

/** GET /api/jobs/{jobId}/decision?waitSec=25 (long poll). */
export const DecisionQuerySchema = z.object({
  waitSec: z.coerce.number().int().min(0).max(60).default(25),
});

export const DecisionPendingSchema = z.object({
  jobId: JobIdSchema,
  status: z.literal("PENDING"),
});
export const DecisionDeliverSchema = z.object({
  jobId: JobIdSchema,
  status: z.literal("DELIVER"),
  outcomes: z.array(OutcomeSchema),
  passed: z.number().int().nonnegative(),
  k: z.number().int().positive(),
  n: z.number().int().positive(),
  reportMd: z.string(),
  reportSha256: z.string(),
});
export const DecisionWithholdSchema = z.object({
  jobId: JobIdSchema,
  status: z.literal("WITHHOLD"),
  passed: z.number().int().nonnegative(),
  k: z.number().int().positive(),
  n: z.number().int().positive(),
  reason: z.string(), // for example "no_passing_photo"
});
export const DecisionResponseSchema = z.discriminatedUnion("status", [
  DecisionPendingSchema,
  DecisionDeliverSchema,
  DecisionWithholdSchema,
]);
export type DecisionResponse = z.infer<typeof DecisionResponseSchema>;

/** POST /api/jobs/{jobId}/settlement-events (shell). */
export const SettlementEventRequestSchema = z.object({
  event: SettlementEventNameSchema,
  txHash: z.string().nullable().optional(),
  ref: z.string().optional(),
  note: z.string().default(""),
});
export type SettlementEventRequest = z.infer<typeof SettlementEventRequestSchema>;

// ---------------------------------------------------------------- 1.2 Tasks and claims
/** GET /api/tasks?status=OPEN&lat=..&lon=.. (coordinates are coarse). */
export const TasksQuerySchema = z.object({
  status: z.literal("OPEN").default("OPEN"),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lon: z.coerce.number().min(-180).max(180).optional(),
});
export type TasksQuery = z.infer<typeof TasksQuerySchema>;

/** GET /api/tasks/stream?lat=..&lon=.. */
export const TasksStreamQuerySchema = z.object({
  lat: z.coerce.number().min(-90).max(90).optional(),
  lon: z.coerce.number().min(-180).max(180).optional(),
});

/** Task as shown to workers: no codes, no other workers' ids. */
export const TaskListItemSchema = z.object({
  id: TaskIdSchema,
  jobId: JobIdSchema,
  /** Catalog store id (public); lets the worker map place the task. */
  storeId: z.string(),
  storeName: z.string(),
  storeAddress: z.string(),
  productName: z.string(),
  payoutAmount: LovelaceSchema,
  windowEndsAt: IsoTimestampSchema,
});
export type TaskListItem = z.infer<typeof TaskListItemSchema>;

export const TaskListResponseSchema = z.object({ tasks: z.array(TaskListItemSchema) });

/** SSE feed events (contracts section 1.2): `task_opened`, `task_closed`, `ping`. */
export const TaskClosedReasonSchema = z.enum(["claimed", "done", "expired"]);
export const TaskOpenedEventSchema = z.object({
  type: z.literal("task_opened"),
  task: TaskListItemSchema,
});
export const TaskClosedEventSchema = z.object({
  type: z.literal("task_closed"),
  taskId: TaskIdSchema,
  reason: TaskClosedReasonSchema,
});
export const PingEventSchema = z.object({ type: z.literal("ping") });
export const FeedEventSchema = z.discriminatedUnion("type", [
  TaskOpenedEventSchema,
  TaskClosedEventSchema,
  PingEventSchema,
]);
export type FeedEvent = z.infer<typeof FeedEventSchema>;
export type TaskClosedEvent = z.infer<typeof TaskClosedEventSchema>;
export type TaskOpenedEvent = z.infer<typeof TaskOpenedEventSchema>;

/** SSE event names on the wire (`event: <name>`; data payload = the event without `type`). */
export const FEED_EVENT_NAMES = ["task_opened", "task_closed", "ping"] as const;

/** POST /api/tasks/{taskId}/claim */
export const ClaimRequestSchema = z.object({
  workerId: WorkerIdSchema,
  displayName: z.string().max(60).optional(),
  payoutAddress: z.string(), // validated by the engine: 422 invalid_payout_address (PayoutAddressSchema)
  location: ClaimLocationSchema.optional(), // missing -> 403 location_required
});
export type ClaimRequest = z.infer<typeof ClaimRequestSchema>;

export const ClaimResponseSchema = z.object({
  claim: z.object({
    id: ClaimIdSchema,
    taskId: TaskIdSchema,
    expiresAt: IsoTimestampSchema,
    ttlSec: z.number().int().positive(),
  }),
  challenge: z.object({
    code: z.string(),
    mode: ChallengeModeSchema,
    instruction: z.string(),
  }),
  task: z.object({ product: z.string(), store: z.string() }),
});
export type ClaimResponse = z.infer<typeof ClaimResponseSchema>;

/**
 * POST /api/claims/{claimId}/challenge (gesture mode, ADR-19). Reveals the gesture once; later
 * calls return the same gesture and reveal time (no re-roll). The photo must reach the engine
 * within `answerWithinSec` of `revealedAt` (G6 `challenge_stale`).
 */
export const RevealChallengeResponseSchema = z.object({
  claimId: ClaimIdSchema,
  gesture: GestureChallengeSchema,
  revealedAt: IsoTimestampSchema,
  answerWithinSec: z.number().int().positive(),
  instruction: z.string(),
});
export type RevealChallengeResponse = z.infer<typeof RevealChallengeResponseSchema>;

/** POST /api/claims/{claimId}/release. Response shape not fixed in contracts. // verify Friday */
export const ReleaseClaimResponseSchema = z.object({
  claim: z.object({ id: ClaimIdSchema, state: ClaimStateSchema }),
});

// ---------------------------------------------------------------- 1.3 Submissions
/** POST /api/tasks/{taskId}/submissions */
export const SubmitPhotoRequestSchema = z.object({
  claimId: ClaimIdSchema,
  outcome: OutcomeSchema.default("OBSERVED"),
  imageBase64: z.string().min(1), // no data: prefix
  mimeType: ImageMimeTypeSchema,
  location: CaptureLocationSchema, // missing -> 403 location_required (engine maps the zod miss)
  clientMeta: ClientMetaSchema, // captureMode checked by the engine
});
export type SubmitPhotoRequest = z.infer<typeof SubmitPhotoRequestSchema>;

export const SubmitPhotoResponseSchema = z.object({
  submission: z.object({
    id: SubmissionIdSchema,
    state: SubmissionStateSchema,
    queuePosition: z.number().int().nonnegative(),
  }),
});
export type SubmitPhotoResponse = z.infer<typeof SubmitPhotoResponseSchema>;

export const PayoutViewSchema = z.object({
  state: PayoutStateSchema,
  txHash: z.string().nullable(),
  explorerUrl: z.string().nullable(),
});
export type PayoutView = z.infer<typeof PayoutViewSchema>;

/** GET /api/submissions/{submissionId} */
export const SubmissionViewSchema = z.object({
  id: SubmissionIdSchema,
  state: SubmissionStateSchema,
  verdict: z
    .object({
      outcome: OutcomeSchema,
      pass: z.boolean(),
      failedGates: z.array(GateNameSchema),
      workerMessage: z.string(),
      extraction: ExtractionSchema.optional(),
    })
    .nullable(),
  task: z.object({
    id: TaskIdSchema,
    state: TaskStateSchema,
    attemptsLeft: z.number().int().nonnegative(),
  }),
  payout: PayoutViewSchema.nullable(),
});
export type SubmissionView = z.infer<typeof SubmissionViewSchema>;

// ---------------------------------------------------------------- 1.4 Payouts, ledger, health, config
export const PayoutsQuerySchema = z.object({ jobId: JobIdSchema.optional() });
export const PayoutListItemSchema = z.object({
  id: PayoutIdSchema,
  taskId: TaskIdSchema,
  state: PayoutStateSchema,
  amount: LovelaceSchema,
  txHash: z.string().nullable(),
  explorerUrl: z.string().nullable(),
});
export const PayoutListResponseSchema = z.object({ payouts: z.array(PayoutListItemSchema) });

export const LedgerQuerySchema = z.object({
  afterSeq: z.coerce.number().int().nonnegative().default(0),
  limit: z.coerce.number().int().min(1).max(1000).default(200),
});
export const LedgerListResponseSchema = z.object({ entries: z.array(LedgerEventSchema) });

const WalletHealthSchema = z.object({
  balanceLovelace: LovelaceSchema,
  queueDepth: z.number().int().nonnegative().optional(),
  /** True when the balance could not be read; `balanceLovelace` is then a placeholder. */
  unknown: z.boolean().optional(),
});
export const HealthResponseSchema = z.object({
  ok: z.boolean(),
  packId: z.string(),
  network: z.literal("preprod"),
  wallets: z.object({ vbuy: WalletHealthSchema, pay: WalletHealthSchema }),
  verifier: z.enum(["up", "down"]),
  fakes: z.object({ payments: z.boolean(), verifier: z.boolean() }),
});
export type HealthResponse = z.infer<typeof HealthResponseSchema>;

/** GET /api/config. Exact fields beyond the contract's list are a reading. // verify Friday */
export const ConfigResponseSchema = z.object({
  packId: z.string(),
  ui: z.record(z.string(), z.string()),
  explorerTxBase: z.string(),
  explorerAddressBase: z.string(),
  challengeMode: ChallengeModeSchema,
  secureContext: z.boolean(),
  demoOverrideEnabled: z.boolean(),
  orders: z
    .strictObject({
      fake: z.boolean(),
      enabled: z.boolean(),
      realReady: z.boolean().optional(),
      maxStores: z.number().int().positive(),
      maxCreditsPerTask: z.number().int().positive(),
    })
    .optional(),
});
export type ConfigResponse = z.infer<typeof ConfigResponseSchema>;

// ---------------------------------------------------------------- 1.5 Admin
export const OverrideResponseSchema = z.strictObject({
  verdict: z.strictObject({
    id: z.string(),
    pass: z.boolean(),
    source: z.literal("MANUAL_OVERRIDE"),
  }),
});
export const OverrideRequestSchema = z.object({ pass: z.boolean(), reason: z.string().min(1) });
export const MarkPaidRequestSchema = z.object({ txHash: z.string().min(1) });
export const AdminPayoutResponseSchema = z.object({ payout: PayoutListItemSchema });
export const CancelJobResponseSchema = z.object({
  job: z.object({ id: JobIdSchema, state: JobStateSchema }),
});
