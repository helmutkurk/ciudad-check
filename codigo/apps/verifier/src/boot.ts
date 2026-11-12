import {
  ObservedExtractionSchema,
  OosExtractionSchema,
  VerifierEnvSchema,
  collectSecretValues,
  createLogger,
  loadEnv,
  systemClock,
} from "@shelfie/core";
import { promptOutcome, shelfPack, thresholdsFromPack } from "@shelfie/domain-shelf";
import { createVisionClient, enforceSchema, isVisionConfigured } from "@shelfie/vision";
import { createApp } from "./app.js";
import { createEvaluator } from "./evaluate.js";
import { IdempotencyCache } from "./idempotency.js";
import { SharpImageService } from "./image.js";
import { setupPayment } from "./payment.js";
import { stubVisionOptions, withStubTask } from "./stub-reader.js";

// Wiring from env. Binds 127.0.0.1 only (the tunnel never
// forwards the verifier). VERIFIER_PAYMENT=off serves /v1/verify without x402 (dev only) and
// implies ENABLE_DRY unless set explicitly.

export function bootVerifier(source: Record<string, string | undefined> = process.env) {
  const env = loadEnv(VerifierEnvSchema, source);
  const { VERIFIER_PAYMENT, VISION_RUN_CAP } = env;
  const logger = createLogger({
    level: env.LOG_LEVEL,
    base: { component: "verifier" },
    secretValues: collectSecretValues(source),
  });

  const thresholds = thresholdsFromPack(shelfPack);
  const stub = env.VERIFIER_MODE === "stub";
  const vision = createVisionClient(env, logger, {
    validate: (req, json) =>
      promptOutcome(req.prompt) === "OBSERVED"
        ? enforceSchema(ObservedExtractionSchema, json)
        : enforceSchema(OosExtractionSchema, json),
    ...(stub ? { stub: stubVisionOptions() } : {}),
    ...(VISION_RUN_CAP !== undefined ? { runCap: VISION_RUN_CAP } : {}),
  });
  if (stub) logger.warn("VERIFIER_MODE=stub: perfect-reader stub, results are not evidence");

  const base = createEvaluator({
    vision,
    images: new SharpImageService(),
    thresholds,
    visionTimeoutMs: env.VISION_TIMEOUT_MS,
    logger,
  });
  const gate = stub ? withStubTask(base) : base;

  const app = createApp({
    env,
    gate,
    images: new SharpImageService(),
    cache: new IdempotencyCache({
      clock: systemClock,
      ttlSec: env.IDEMPOTENCY_TTL_SEC,
      path: env.IDEMPOTENCY_CACHE_PATH,
      logger,
    }),
    payment: setupPayment(VERIFIER_PAYMENT, env, logger),
    logger,
    clock: systemClock,
    visionConfigured: isVisionConfigured(env),
    maxImageBytes: thresholds.image.maxBytes,
  });
  return { app, env, logger };
}
