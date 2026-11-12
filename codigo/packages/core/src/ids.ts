import { z } from "zod";

/** Id prefixes (contracts: "IDs are prefixed strings"). */
export const ID_PREFIXES = {
  order: "ord",
  job: "job",
  task: "tsk",
  claim: "clm",
  submission: "sub",
  verdict: "vrd",
  payout: "pay",
  settlement: "stl",
  worker: "wrk",
} as const;

export type IdKind = keyof typeof ID_PREFIXES;
export type IdPrefix = (typeof ID_PREFIXES)[IdKind];

const body = "[A-Za-z0-9]+";

export const JobIdSchema = z
  .string()
  .regex(new RegExp(`^job_${body}$`))
  .brand<"JobId">();
export const TaskIdSchema = z
  .string()
  .regex(new RegExp(`^tsk_${body}$`))
  .brand<"TaskId">();
export const ClaimIdSchema = z
  .string()
  .regex(new RegExp(`^clm_${body}$`))
  .brand<"ClaimId">();
export const SubmissionIdSchema = z
  .string()
  .regex(new RegExp(`^sub_${body}$`))
  .brand<"SubmissionId">();
export const VerdictIdSchema = z
  .string()
  .regex(new RegExp(`^vrd_${body}$`))
  .brand<"VerdictId">();
export const PayoutIdSchema = z
  .string()
  .regex(new RegExp(`^pay_${body}$`))
  .brand<"PayoutId">();
export const SettlementIdSchema = z
  .string()
  .regex(new RegExp(`^stl_${body}$`))
  .brand<"SettlementId">();
/** A worker id is chosen by the phone (random id in local storage), so only the prefix is fixed. */
export const WorkerIdSchema = z
  .string()
  .regex(new RegExp(`^wrk_${body}$`))
  .brand<"WorkerId">();

export type JobId = z.infer<typeof JobIdSchema>;
export type TaskId = z.infer<typeof TaskIdSchema>;
export type ClaimId = z.infer<typeof ClaimIdSchema>;
export type SubmissionId = z.infer<typeof SubmissionIdSchema>;
export type VerdictId = z.infer<typeof VerdictIdSchema>;
export type PayoutId = z.infer<typeof PayoutIdSchema>;
export type SettlementId = z.infer<typeof SettlementIdSchema>;
export type WorkerId = z.infer<typeof WorkerIdSchema>;

export interface IdGenerator {
  /** Returns a fresh id such as `job_a1b2c3d4e5f6` (random) or `job_01` (deterministic). */
  next(prefix: IdPrefix): string;
}

/** Random ids (6 random bytes, hex). */
export const randomIdGenerator: IdGenerator = {
  next: (prefix) =>
    `${prefix}_${Array.from(globalThis.crypto.getRandomValues(new Uint8Array(6)), (b) => b.toString(16).padStart(2, "0")).join("")}`,
};

/**
 * Deterministic generator for tests and demos: `job_01`, `job_02`, `tsk_01` ...
 * One counter per prefix, so ids match the examples in contracts.md.
 */
export class SequentialIdGenerator implements IdGenerator {
  private readonly counters = new Map<string, number>();

  next(prefix: IdPrefix): string {
    const n = (this.counters.get(prefix) ?? 0) + 1;
    this.counters.set(prefix, n);
    return `${prefix}_${String(n).padStart(2, "0")}`;
  }
}

export function newJobId(gen: IdGenerator): JobId {
  return JobIdSchema.parse(gen.next(ID_PREFIXES.job));
}
export function newTaskId(gen: IdGenerator): TaskId {
  return TaskIdSchema.parse(gen.next(ID_PREFIXES.task));
}
export function newClaimId(gen: IdGenerator): ClaimId {
  return ClaimIdSchema.parse(gen.next(ID_PREFIXES.claim));
}
export function newSubmissionId(gen: IdGenerator): SubmissionId {
  return SubmissionIdSchema.parse(gen.next(ID_PREFIXES.submission));
}
export function newVerdictId(gen: IdGenerator): VerdictId {
  return VerdictIdSchema.parse(gen.next(ID_PREFIXES.verdict));
}
export function newPayoutId(gen: IdGenerator): PayoutId {
  return PayoutIdSchema.parse(gen.next(ID_PREFIXES.payout));
}
export function newSettlementId(gen: IdGenerator): SettlementId {
  return SettlementIdSchema.parse(gen.next(ID_PREFIXES.settlement));
}

/** Alphabet without confusable characters (domain-model section 5). */
export const CHALLENGE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const CHALLENGE_LENGTH = 6;

/**
 * Challenge code `ABC-123` style (`XXX-XXX`). `randomInt(n)` must return an integer in [0, n) and
 * be CSPRNG-backed in production (`crypto.randomInt`); tests inject a deterministic one.
 */
export function makeChallengeCode(randomInt: (maxExclusive: number) => number): string {
  let raw = "";
  for (let i = 0; i < CHALLENGE_LENGTH; i++) {
    raw += CHALLENGE_ALPHABET.charAt(randomInt(CHALLENGE_ALPHABET.length));
  }
  return `${raw.slice(0, 3)}-${raw.slice(3)}`;
}

/** Uppercase, strip spaces and hyphen (verifier-rules G2 normalisation). */
export function normalizeChallengeCode(code: string): string {
  return code.toUpperCase().replace(/[\s-]/g, "");
}

/**
 * Gesture challenge (ADR-19): 2-5 raised fingers, hand left or right of the tag in the photo.
 * 8 combinations; freshness comes from the late reveal plus the short answer window (G6).
 */
export function makeGestureChallenge(randomInt: (maxExclusive: number) => number): {
  fingers: number;
  side: "left" | "right";
} {
  return { fingers: 2 + randomInt(4), side: randomInt(2) === 0 ? "left" : "right" };
}
