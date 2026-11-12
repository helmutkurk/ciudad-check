import { AppError } from "@shelfie/core";
import type { Logger, VisionClient, VisionRequest, VisionResult } from "@shelfie/core";

export type ValidateFn = (
  req: VisionRequest,
  json: unknown,
) => { ok: true; data: unknown } | { ok: false; issues: { path: string; message: string }[] };

export interface VisionChainOptions {
  clients: readonly VisionClient[];
  /** Schema enforcement. On failure the same client is asked once more, then the next one. */
  validate?: ValidateFn;
  logger?: Logger;
  /** Per-run cap on extract() calls (VISION_RUN_CAP, security V6). Reached = 503, no outbound call. */
  runCap?: number;
}

/**
 * Fallback chain (design: primary, then fallback on `vision_unavailable`). A reply that parses
 * but fails the schema counts as unavailable for that client after one corrective retry.
 * Returns the validated data in `json` when `validate` is given.
 */
export class VisionChain implements VisionClient {
  constructor(private readonly opts: VisionChainOptions) {
    if (opts.clients.length === 0) throw new Error("VisionChain needs at least one client");
  }

  private calls = 0;

  async extract(req: VisionRequest): Promise<VisionResult> {
    if (this.opts.runCap !== undefined && this.calls >= this.opts.runCap) {
      throw new AppError("vision_unavailable", "Vision call cap reached.", undefined, {
        reason: "run_cap_reached",
        cap: this.opts.runCap,
      });
    }
    this.calls++;
    let last: unknown = null;
    for (const [i, client] of this.opts.clients.entries()) {
      try {
        return await this.tryClient(client, req);
      } catch (err) {
        last = err;
        this.opts.logger?.warn("vision client failed", {
          index: i,
          reason: err instanceof AppError ? (err.details["reason"] ?? err.code) : "unknown",
          status: err instanceof AppError ? err.details["status"] : undefined,
          providerMessage: err instanceof AppError ? err.details["providerMessage"] : undefined,
          willFallback: i < this.opts.clients.length - 1,
        });
      }
    }
    if (last instanceof AppError && last.code === "vision_unavailable") throw last;
    throw new AppError("vision_unavailable", "Vision provider unavailable.", undefined, {
      reason: "all_clients_failed",
    });
  }

  private async tryClient(client: VisionClient, req: VisionRequest): Promise<VisionResult> {
    const validate = this.opts.validate;
    let result = await client.extract(req);
    if (!validate) return result;
    let check = validate(req, result.json);
    if (check.ok) return { ...result, json: check.data };

    const issueText = check.issues
      .slice(0, 8)
      .map((i) => `${i.path || "(root)"}: ${i.message}`)
      .join("; ");
    this.opts.logger?.warn("vision reply failed schema, retrying once", {
      issues: check.issues.length,
    });
    result = await client.extract({
      ...req,
      prompt: `${req.prompt}\n\nYour previous reply did not match the schema (${issueText}). Reply again with ONE JSON object that matches the schema exactly, with no extra keys.`,
    });
    check = validate(req, result.json);
    if (check.ok) return { ...result, json: check.data };
    throw new AppError("vision_unavailable", "Vision provider unavailable.", undefined, {
      reason: "schema_violation",
      issues: check.issues.length,
    });
  }
}
