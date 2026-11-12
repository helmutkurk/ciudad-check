import { createHash } from "node:crypto";
import type { VisionClient, VisionRequest, VisionResult } from "@shelfie/core";

// Deterministic, fixture-driven client for VERIFIER_MODE=stub and tests. No network, no keys.
// Selection order: (1) fixture keyed by the sha256 (hex) of the image's base64 string,
// (2) `resolve(req)` if given, (3) `defaultExtraction`. Fixtures may be a value or a function;
// a fixture of `Error` is thrown, to simulate provider failures.

export type StubFixture = unknown;

export interface StubVisionOptions {
  fixtures?: Record<string, StubFixture>;
  resolve?: (req: VisionRequest) => StubFixture;
  defaultExtraction?: StubFixture;
  /** Reported in VisionResult.model. */
  modelId?: string;
  /** Reported latency, fixed so results are reproducible. */
  latencyMs?: number;
}

export function imageKey(base64: string): string {
  return createHash("sha256").update(base64).digest("hex");
}

export class StubVisionClient implements VisionClient {
  readonly calls: VisionRequest[] = [];

  constructor(private readonly opts: StubVisionOptions = {}) {}

  extract(req: VisionRequest): Promise<VisionResult> {
    this.calls.push(req);
    const fixture =
      this.opts.fixtures?.[imageKey(req.image.base64)] ??
      this.opts.resolve?.(req) ??
      this.opts.defaultExtraction;
    if (fixture === undefined) {
      return Promise.reject(new Error("StubVisionClient: no fixture and no default extraction"));
    }
    if (fixture instanceof Error) return Promise.reject(fixture);
    const json = typeof fixture === "function" ? (fixture as (r: VisionRequest) => unknown)(req) : fixture;
    return Promise.resolve({
      json: structuredClone(json),
      model: { provider: "stub", id: this.opts.modelId ?? "stub" },
      latencyMs: this.opts.latencyMs ?? 1,
    });
  }

  get callCount(): number {
    return this.calls.length;
  }
}
