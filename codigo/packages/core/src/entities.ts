import { z } from "zod";
import {
  IsoTimestampSchema,
  JobSourceSchema,
  LovelaceSchema,
  OutcomeSchema,
  PayoutAddressSchema,
  Sha256Schema,
  StoredCaptureLocationSchema,
} from "./common.js";
import {
  ClaimIdSchema,
  JobIdSchema,
  PayoutIdSchema,
  SettlementIdSchema,
  SubmissionIdSchema,
  TaskIdSchema,
  VerdictIdSchema,
  WorkerIdSchema,
} from "./ids.js";
import {
  ClaimStateSchema,
  JobStateSchema,
  PayoutStateSchema,
  SettlementStateSchema,
  SubmissionStateSchema,
  TaskStateSchema,
} from "./states.js";
import {
  ExtractionSchema,
  GateNameSchema,
  GateResultSchema,
  GestureChallengeSchema,
} from "./verify.js";

// Entities (domain-model.md section 1). Persisted by the engine behind a Store interface.

/** Job input: ids only, no free text (ADR-17). Strict so free-text fields are rejected. */
export const JobInputSchema = z.strictObject({
  productEan: z.string().regex(/^\d{8,14}$/),
  stores: z.array(z.strictObject({ id: z.string().min(1) })).min(1),
  k: z.number().int().positive().optional(),
});
export type JobInput = z.infer<typeof JobInputSchema>;

export const DecisionSchema = z.enum(["DELIVER", "WITHHOLD"]);
export type Decision = z.infer<typeof DecisionSchema>;

export const JobSchema = z.object({
  id: JobIdSchema,
  packId: z.string(),
  input: JobInputSchema,
  source: JobSourceSchema,
  externalRef: z.string(),
  k: z.number().int().positive(),
  n: z.number().int().positive(),
  windowEndsAt: IsoTimestampSchema,
  state: JobStateSchema,
  decision: DecisionSchema.nullable(),
  reportMd: z.string().nullable(),
  createdAt: IsoTimestampSchema,
});
export type Job = z.infer<typeof JobSchema>;

export const TaskSpecSchema = z.object({
  storeId: z.string(),
  productEan: z.string(),
});
export type TaskSpec = z.infer<typeof TaskSpecSchema>;

export const TaskSchema = z.object({
  id: TaskIdSchema,
  jobId: JobIdSchema,
  spec: TaskSpecSchema,
  state: TaskStateSchema,
  attempts: z.number().int().nonnegative(),
  maxAttempts: z.number().int().positive(),
  currentClaimId: ClaimIdSchema.nullable(),
  acceptedSubmissionId: SubmissionIdSchema.nullable(),
  acceptedOutcome: OutcomeSchema.nullable(),
  payoutAmount: LovelaceSchema,
});
export type Task = z.infer<typeof TaskSchema>;

export const ChallengeModeSchema = z.enum(["gesture", "handwritten", "card-pool", "none"]);
export type ChallengeMode = z.infer<typeof ChallengeModeSchema>;

export const ChallengeCodeSchema = z.object({
  code: z.string().regex(/^[A-Z0-9]{3}-[A-Z0-9]{3}$/),
  claimId: ClaimIdSchema,
  issuedAt: IsoTimestampSchema,
  expiresAt: IsoTimestampSchema,
  usedBySubmissionId: SubmissionIdSchema.nullable(),
  cardPoolId: z.string().optional(),
});
export type ChallengeCode = z.infer<typeof ChallengeCodeSchema>;

export const LocationSourceSchema = z.enum(["browser", "disabled", "admin"]);
export type LocationSource = z.infer<typeof LocationSourceSchema>;

export const ClaimSchema = z.object({
  id: ClaimIdSchema,
  taskId: TaskIdSchema,
  workerId: WorkerIdSchema,
  displayName: z.string().optional(),
  payoutAddress: PayoutAddressSchema,
  challengeCode: z.string(),
  /** Gesture mode (ADR-19): drawn at claim, shown only after `challengeRevealedAt`. */
  gesture: GestureChallengeSchema.optional(),
  challengeRevealedAt: IsoTimestampSchema.optional(),
  issuedAt: IsoTimestampSchema,
  expiresAt: IsoTimestampSchema,
  state: ClaimStateSchema,
  /** Only the city decision is kept, not coordinates (contracts section 1.2). */
  cityMatch: z.boolean(),
  locationSource: LocationSourceSchema,
  locationTries: z.number().int().nonnegative(),
});
export type Claim = z.infer<typeof ClaimSchema>;

export const CaptureModeSchema = z.enum(["getUserMedia", "file", "capture-input", "admin-test"]);
export type CaptureMode = z.infer<typeof CaptureModeSchema>;

export const ClientMetaSchema = z.object({
  captureMode: z.string(), // checked by the engine (422 capture_mode_not_allowed), not by the schema
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  userAgent: z.string().optional(),
  streamStartedToShutterMs: z.number().nonnegative().optional(),
  deviceLabelPresent: z.boolean().optional(),
});
export type ClientMeta = z.infer<typeof ClientMetaSchema>;

export const SubmissionSchema = z.object({
  id: SubmissionIdSchema,
  claimId: ClaimIdSchema,
  taskId: TaskIdSchema,
  receivedAt: IsoTimestampSchema,
  outcome: OutcomeSchema,
  imageSha256: Sha256Schema,
  imageRef: z.string(),
  clientMeta: ClientMetaSchema,
  captureLocation: StoredCaptureLocationSchema.nullable(),
  exifPresent: z.boolean().optional(),
  verifyIdempotencyKey: z.string(),
  state: SubmissionStateSchema,
});
export type Submission = z.infer<typeof SubmissionSchema>;

export const VerdictSourceSchema = z.enum(["GATE", "MANUAL_OVERRIDE"]);
export type VerdictSource = z.infer<typeof VerdictSourceSchema>;

/** Immutable once written; an override creates a new Verdict that supersedes. */
export const VerdictSchema = z.object({
  id: VerdictIdSchema,
  submissionId: SubmissionIdSchema,
  pass: z.boolean(),
  gates: z.array(GateResultSchema),
  failedGates: z.array(GateNameSchema),
  extraction: ExtractionSchema,
  outcome: OutcomeSchema,
  workerMessage: z.string(),
  verifierTx: z.string().nullable(),
  source: VerdictSourceSchema,
  overrideReason: z.string().nullable(),
  modelId: z.string().nullable(),
  latencyMs: z.number().nonnegative().nullable(),
  supersedesVerdictId: VerdictIdSchema.nullable(),
  createdAt: IsoTimestampSchema,
});
export type Verdict = z.infer<typeof VerdictSchema>;

export const PayoutSchema = z.object({
  id: PayoutIdSchema,
  taskId: TaskIdSchema,
  idempotencyKey: z.string().regex(/^payout:/),
  toAddress: PayoutAddressSchema,
  amount: LovelaceSchema,
  state: PayoutStateSchema,
  txHash: z.string().nullable(),
  metadataTag: z.string(),
  attempts: z.number().int().nonnegative(),
  lastError: z.string().nullable(),
  walletId: z.string(),
  /** Set when the write-ahead record was written (reconcile looks for txs after it). */
  sendingSince: IsoTimestampSchema.nullable().optional(),
});
export type Payout = z.infer<typeof PayoutSchema>;

export const ShellActionSchema = z.enum(["RESULT_SUBMITTED", "WITHHELD"]);
export const SettlementSchema = z.object({
  id: SettlementIdSchema,
  jobId: JobIdSchema,
  decision: DecisionSchema,
  passed: z.number().int().nonnegative(),
  k: z.number().int().positive(),
  n: z.number().int().positive(),
  resultHash: z.string().nullable(),
  shellAction: ShellActionSchema.nullable(),
  escrowRefs: z.object({
    lockTx: z.string().nullable(),
    settleTx: z.string().nullable(),
    refundTx: z.string().nullable(),
  }),
  state: SettlementStateSchema,
});
export type Settlement = z.infer<typeof SettlementSchema>;

/** Shell observations posted to /settlement-events (contracts section 1.1). */
export const SettlementEventNameSchema = z.enum([
  "ESCROW_LOCKED",
  "INTAKE_REJECTED",
  "RESULT_SUBMITTED",
  "SETTLED",
  "WITHHELD",
  "REFUND_OBSERVED",
]);
export type SettlementEventName = z.infer<typeof SettlementEventNameSchema>;

/**
 * Ledger entry kinds. Known from the design: LOCATION_CHECKED, PAYOUT_QUEUED, PAYOUT_SUBMITTED,
 * PAYOUT_CONFIRMED, VERIFY_PAID, INTAKE_REJECTED, RESULT_SUBMITTED, REFUND_OBSERVED. The rest are
 * the obvious lifecycle events; the engine owner may extend this list. // verify Friday
 */
export const LedgerKindSchema = z.enum([
  "JOB_CREATED",
  "INTAKE_REJECTED",
  "TASK_OPENED",
  "TASK_CLAIMED",
  "LOCATION_CHECKED",
  "SUBMISSION_RECEIVED",
  "VERIFY_PAID",
  "VERDICT",
  "OVERRIDE",
  "PAYOUT_QUEUED",
  "PAYOUT_SUBMITTED",
  "PAYOUT_CONFIRMED",
  "PAYOUT_RECONCILED",
  "PAYOUT_MARKED_PAID",
  "JOB_DECIDED",
  "ESCROW_LOCKED",
  "RESULT_SUBMITTED",
  "SETTLED",
  "WITHHELD",
  "REFUND_OBSERVED",
  "ADMIN_ACTION",
]);
export type LedgerKind = z.infer<typeof LedgerKindSchema>;

/** Hash-chained, append-only, one JSONL line (EvidenceEntry in domain-model). */
export const LedgerEventSchema = z.object({
  seq: z.number().int().nonnegative(),
  ts: IsoTimestampSchema,
  kind: LedgerKindSchema,
  refs: z.record(z.string(), z.string()),
  txHash: z.string().optional(),
  explorerUrl: z.string().optional(),
  payloadHash: z.string(),
  prevHash: z.string(),
  note: z.string(),
  flags: z.record(z.string(), z.boolean()).default({}),
});
export type LedgerEvent = z.infer<typeof LedgerEventSchema>;
