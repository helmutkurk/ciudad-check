import { createHash } from "node:crypto";
import { AppError, ObservedExtractionSchema, OosExtractionSchema, gatesFor } from "@shelfie/core";
import type {
  GateName,
  GateResult,
  Logger,
  ObservedExtraction,
  OosExtraction,
  VerifierGate,
  VerifyContext,
  VerifyImage,
  VerifyResponse,
  VerifyTask,
  VisionClient,
} from "@shelfie/core";
import {
  buildExtractPrompt,
  extractionJsonSchema,
  shelfPack,
  thresholdsFromPack,
  workerMessage,
} from "@shelfie/domain-shelf";
import type { Lang, Thresholds } from "@shelfie/domain-shelf";
import { enforceSchema } from "@shelfie/vision";
import {
  gateChallenge,
  gateNotScreen,
  gateImageOk,
  gateLabelMatch,
  gateLabelVisible,
  gateNotDuplicate,
  gatePriceSanity,
  gateProductMatch,
  gateReadable,
  gateSlotEmpty,
  gateTiming,
} from "./gates.js";
import { SharpImageService } from "./image.js";
import type { ImageInfo, ImageService } from "./image.js";

// evaluate(task, image, ctx) -> VerifyResponse. The vision call is the only impure step and is
// injected (VisionClient). All gates of the selected set are evaluated and reported; G1 failing
// skips the vision call, so the gates that need an extraction are not run in that case.
// The model never sees the expected code, product name or price (verifier-rules.md section 3).

export interface EvaluatorDeps {
  vision: VisionClient;
  images?: ImageService;
  thresholds?: Thresholds;
  visionTimeoutMs?: number;
  lang?: Lang;
  logger?: Logger;
  /** Used for latency of the whole call only; defaults to performance.now-based monotonic time. */
  nowMs?: () => number;
}

/**
 * Perceptual hashes seen by this process, keyed by sha256: a lookup only. G7 compares just the
 * photos named in `previousImageSha256` (the engine sends the job's PASSED photos), so a failed
 * attempt never blocks a similar retry. After a restart, near-duplicates of older photos are
 * missed; exact sha256 duplicates are still caught.
 */
const AHASH_LIMIT = 5000;

export interface Evaluator extends VerifierGate {
  /** Vision extraction only (POST /v1/extract). Validated, not gated. */
  extractOnly(
    image: Pick<VerifyImage, "mimeType" | "base64">,
    outcome: VerifyTask["outcome"],
  ): Promise<{ extraction: ObservedExtraction | OosExtraction; model: VerifyResponse["model"] }>;
}

export function createEvaluator(deps: EvaluatorDeps): Evaluator {
  const images = deps.images ?? new SharpImageService();
  const t = deps.thresholds ?? thresholdsFromPack(shelfPack);
  const timeoutMs = deps.visionTimeoutMs ?? 20_000;
  const lang = deps.lang ?? "en";
  const nowMs = deps.nowMs ?? (() => performance.now());
  const knownAhash = new Map<string, string>();

  const remember = (sha: string, ahash: string): void => {
    if (knownAhash.size >= AHASH_LIMIT) {
      const oldest = knownAhash.keys().next();
      if (!oldest.done) knownAhash.delete(oldest.value);
    }
    knownAhash.set(sha, ahash);
  };

  async function callVision(
    bytes: Uint8Array,
    mimeType: VerifyImage["mimeType"],
    outcome: VerifyTask["outcome"],
  ): Promise<{ extraction: ObservedExtraction | OosExtraction; model: VerifyResponse["model"] }> {
    const prepared = await images.prepareForVision(bytes, mimeType);
    const started = nowMs();
    const result = await deps.vision.extract({
      image: prepared,
      prompt: buildExtractPrompt(outcome),
      outputSchema: extractionJsonSchema(outcome),
      timeoutMs,
    });
    const latencyMs = Math.max(0, Math.round(nowMs() - started));
    const checked =
      outcome === "OBSERVED"
        ? enforceSchema(ObservedExtractionSchema, result.json)
        : enforceSchema(OosExtractionSchema, result.json);
    if (!checked.ok) {
      deps.logger?.warn("extraction failed schema", { issues: checked.issues.length });
      throw new AppError("vision_unavailable", "Vision provider unavailable.", undefined, {
        reason: "schema_violation",
      });
    }
    return {
      extraction: checked.data,
      model: {
        provider: result.model.provider,
        id: result.model.id,
        latencyMs: result.latencyMs || latencyMs,
      },
    };
  }

  async function evaluate(
    task: VerifyTask,
    image: VerifyImage,
    ctx: VerifyContext,
  ): Promise<VerifyResponse> {
    const bytes = Buffer.from(image.base64, "base64");
    // The hash we trust is the one we compute, not the one the caller sent.
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const info: ImageInfo =
      bytes.byteLength > 0 && bytes.byteLength <= t.image.maxBytes
        ? await images.inspect(bytes, image.mimeType)
        : { ok: false, reason: "undecodable" };

    const results = new Map<GateName, GateResult>();
    results.set("image_ok", gateImageOk({ byteLength: bytes.byteLength, info }, t));
    const g1Ok = results.get("image_ok")?.pass === true;

    let extraction: ObservedExtraction | OosExtraction | null = null;
    let model: VerifyResponse["model"] = { provider: "none", id: "none", latencyMs: 0 };
    const verifierNotes: string[] = [];
    let priceValue: number | null = null;

    if (g1Ok) {
      const called = await callVision(bytes, image.mimeType, task.outcome);
      extraction = called.extraction;
      model = called.model;

      results.set("code_match", gateChallenge(task, extraction, t));
      results.set("not_screen", gateNotScreen(extraction.advisory, t));
      if (task.outcome === "OBSERVED") {
        const x = extraction as ObservedExtraction;
        const g3 = gateReadable(x, t);
        results.set("readable", g3.gate);
        results.set("product_match", gateProductMatch(x, task.product, t));
        priceValue = g3.parsed.ok ? g3.parsed.value : null;
        results.set("price_sanity", gatePriceSanity(priceValue, task.product, t));
        if (g3.parseDisagreement) verifierNotes.push("parse_disagreement");
      } else {
        const x = extraction as OosExtraction;
        results.set("label_visible", gateLabelVisible(x, t));
        results.set("label_match", gateLabelMatch(x, task.product, t));
        results.set("slot_empty", gateSlotEmpty(x, t));
      }
      if (extraction.scene.peopleVisible === true) verifierNotes.push("people_visible");
    }

    results.set("timing", gateTiming(task, t));
    const ahash = info.ok ? info.ahash : null;
    results.set(
      "not_duplicate",
      gateNotDuplicate(
        {
          sha256,
          ahash,
          previousImageSha256: ctx.previousImageSha256,
          previousAhash: knownAhash,
        },
        t,
      ),
    );
    if (ahash !== null) remember(sha256, ahash);

    // Report in the order of the gate set (verifier-rules tables).
    const order = gatesFor(task.outcome);
    const gates = order.flatMap((name) => {
      const r = results.get(name);
      return r ? [r] : [];
    });
    const failedGates = gates.filter((g) => !g.pass).map((g) => g.name);
    const pass = failedGates.length === 0;
    const firstFailed = failedGates[0] ?? null;

    const extractionOut: Record<string, unknown> =
      extraction === null
        ? {}
        : {
            ...(extraction as unknown as Record<string, unknown>),
            ...(verifierNotes.length ? { verifierNotes } : {}),
          };
    if (priceValue !== null) extractionOut["verifierPriceValue"] = priceValue;

    return {
      submissionId: ctx.submissionId,
      outcome: task.outcome,
      pass,
      gates,
      failedGates,
      extraction: extractionOut,
      workerMessage: workerMessage(
        firstFailed,
        {
          // gesture mode: the message never names the gesture (ADR-19)
          expected: task.expectedGesture ? "" : task.expectedCode,
          product: task.product.name,
        },
        lang,
        task.expectedGesture !== undefined,
      ),
      model,
      cached: false,
    };
  }

  return {
    evaluate,
    async extractOnly(image, outcome) {
      const bytes = Buffer.from(image.base64, "base64");
      return callVision(bytes, image.mimeType, outcome);
    },
  };
}
