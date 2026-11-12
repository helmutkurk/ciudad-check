import type { Payout } from "./entities.js";
import type { ImageMimeType } from "./common.js";
import type { VerifyImage, VerifyRequest, VerifyResponse, VerifyTask } from "./verify.js";

// Ports: interfaces the components meet at. Types only; implementations live in the owning
// packages (contracts.md sections 3.3 and 4, verifier-rules.md section 3).

// ---- Verifier gate: the seam between B (route, x402, idempotency) and C (rules)
export interface VerifyContext {
  packId: string;
  submissionId: string;
  /** sha256 of other accepted photos in the same job (G7). */
  previousImageSha256: readonly string[];
}

/** `evaluate(task, image) -> VerifyResponse`. B calls it from the route; C implements it. */
export interface VerifierGate {
  evaluate(task: VerifyTask, image: VerifyImage, ctx: VerifyContext): Promise<VerifyResponse>;
}
export type EvaluateFn = VerifierGate["evaluate"];

// ---- Vision (packages/vision)
export type JsonSchema = Record<string, unknown>;

export interface VisionRequest {
  image: { mimeType: ImageMimeType; base64: string };
  /** Pack prompt. Never contains the expected code or price. */
  prompt: string;
  /** Enforced via structured output / tool schema where the provider supports it. */
  outputSchema: JsonSchema;
  timeoutMs: number;
}

export interface VisionResult {
  /** Parsed JSON, not yet validated against the extraction schema (the caller does that). */
  json: unknown;
  model: { provider: string; id: string };
  latencyMs: number;
}

export interface VisionClient {
  /** Throws AppError `vision_unavailable` after the retry/repair budget is exhausted. */
  extract(req: VisionRequest): Promise<VisionResult>;
}

// ---- Payments (packages/payments), contracts.md sections 3.3 and 4
export interface PayoutAdapter {
  send(args: {
    toAddress: string;
    lovelace: string;
    metadataTag: string;
  }): Promise<{ txHash: string }>;
  find(args: { metadataTag: string; sinceIso: string }): Promise<{ txHash: string } | null>;
  confirmations(txHash: string): Promise<number>;
  balance(): Promise<string>;
}

export interface PayoutQueue {
  /** Idempotent on taskId. */
  enqueue(p: { taskId: string; toAddress: string; lovelace: string }): Promise<Payout>;
  get(id: string): Promise<Payout>;
  reconcile(id: string): Promise<Payout>;
}

export interface VerifyClient {
  verify(
    req: VerifyRequest,
    key: string,
  ): Promise<{ verdict: VerifyResponse; txHash: string; receipt: unknown }>;
}
