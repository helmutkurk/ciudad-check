import { createHash, timingSafeEqual } from "node:crypto";
import express from "express";
import type { ErrorRequestHandler, NextFunction, Request, RequestHandler, Response } from "express";
import { z } from "zod";
import {
  AppError,
  ERROR_STATUS,
  ImageMimeTypeSchema,
  OutcomeSchema,
  VerifyRequestSchema,
  isAppError,
} from "@shelfie/core";
import type {
  ErrorBody,
  Clock,
  Logger,
  VerifierEnv,
  VerifyRequest,
  VerifyResponse,
} from "@shelfie/core";
import { findExtraKeys } from "@shelfie/vision";
import type { Evaluator } from "./evaluate.js";
import type { IdempotencyCache } from "./idempotency.js";
import { IdempotencyConflict } from "./idempotency.js";
import type { ImageService } from "./image.js";
import { X402_NETWORK } from "./payment.js";
import type { PaymentSetup } from "./payment.js";

// HTTP surface of the verifier (contracts.md section 3). Express 4. Validation sits BEFORE the
// payment middleware, so a malformed request is never charged. The paid handler may run more
// than once (retries): it goes through the idempotency cache.

export interface AppDeps {
  env: Pick<
    VerifierEnv,
    | "PACK_ID"
    | "ADMIN_TOKEN"
    | "ENGINE_TOKEN"
    | "X_ENGINE_TOKEN_REQUIRED"
    | "ENABLE_DRY"
    | "VERIFY_PRICE_LOVELACE"
    | "SELLER_ADDRESS"
  >;
  gate: Evaluator;
  images: ImageService;
  cache: IdempotencyCache;
  payment: PaymentSetup;
  logger: Logger;
  clock: Clock;
  visionConfigured: boolean;
  /** Decoded image size limit (pack image_ok.maxBytes). */
  maxImageBytes: number;
}

const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;
const SAFE_ID = /^[A-Za-z0-9_.:-]{1,128}$/;

function safeEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

const ExtractRequestSchema = z.object({
  image: z.object({ mimeType: ImageMimeTypeSchema, base64: z.string().min(1) }),
  outcome: OutcomeSchema.default("OBSERVED"),
});

const wrap =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<void>): RequestHandler =>
  (req, res, next) => {
    fn(req, res, next).catch(next);
  };

export function createApp(deps: AppDeps): express.Express {
  const { env, logger } = deps;
  const app = express();
  app.disable("x-powered-by");
  app.set("etag", false);

  // JSON body limit: base64 expands bytes by 4/3, plus room for the task fields.
  const bodyLimit = Math.ceil((deps.maxImageBytes * 4) / 3) + 64 * 1024;
  const json = express.json({ limit: bodyLimit, strict: true, type: "application/json" });

  const requireAdmin: RequestHandler = (req, _res, next) => {
    const sent = req.header("x-admin-token");
    if (!sent || !safeEqual(sent, env.ADMIN_TOKEN)) {
      next(new AppError("unauthorized", "Admin token missing or wrong."));
      return;
    }
    next();
  };

  const requireEngineToken: RequestHandler = (req, _res, next) => {
    if (env.X_ENGINE_TOKEN_REQUIRED) {
      const sent = req.header("x-engine-token");
      if (!sent || !env.ENGINE_TOKEN || !safeEqual(sent, env.ENGINE_TOKEN)) {
        next(new AppError("unauthorized", "Engine token missing or wrong."));
        return;
      }
    }
    next();
  };

  /** Everything cheap that must fail before x402 settles. Leaves the parsed request in locals. */
  const prepare = (opts: { rejectUndecodable: boolean }): RequestHandler =>
    wrap(async (req, res, next) => {
      const parsed = VerifyRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError(
          "invalid_request",
          "Request body does not match the schema.",
          undefined,
          {
            issues: parsed.error.issues.map((i) => ({
              path: i.path.join("."),
              message: i.message,
            })),
          },
        );
      }
      const extras = findExtraKeys(req.body, parsed.data);
      if (extras.length > 0) {
        throw new AppError("invalid_request", "Unexpected fields in request.", undefined, {
          paths: extras.slice(0, 10),
        });
      }
      const body: VerifyRequest = parsed.data;
      if (body.packId !== env.PACK_ID) {
        throw new AppError("invalid_request", "Unknown packId.", undefined, {
          packId: body.packId,
        });
      }
      if (!SAFE_ID.test(body.submissionId) || !SAFE_ID.test(body.task.taskId)) {
        throw new AppError("invalid_request", "Malformed id.");
      }
      const key = req.header("idempotency-key");
      if (!key || key !== `verify:${body.submissionId}`) {
        throw new AppError(
          "invalid_request",
          "Idempotency-Key header must be verify:<submissionId>.",
        );
      }
      if (!BASE64.test(body.image.base64)) {
        throw new AppError("invalid_request", "image.base64 is not valid base64.");
      }
      const decodedLen = Math.floor((body.image.base64.length * 3) / 4);
      if (decodedLen > deps.maxImageBytes + 3) {
        throw new AppError("image_too_large", "Image is larger than the allowed size.", undefined, {
          maxBytes: deps.maxImageBytes,
        });
      }
      const bytes = Buffer.from(body.image.base64, "base64");
      if (bytes.byteLength > deps.maxImageBytes) {
        throw new AppError("image_too_large", "Image is larger than the allowed size.", undefined, {
          maxBytes: deps.maxImageBytes,
        });
      }
      const sha = createHash("sha256").update(bytes).digest("hex");
      if (sha !== body.image.sha256.toLowerCase()) {
        throw new AppError("invalid_request", "image.sha256 does not match the image bytes.");
      }
      if (opts.rejectUndecodable) {
        const info = await deps.images.inspect(bytes, body.image.mimeType);
        if (!info.ok) throw new AppError("image_not_decodable", "The image could not be decoded.");
      }
      res.locals["verifyBody"] = body;
      res.locals["idempotencyKey"] = key;
      next();
    });

  const verifyHandler: RequestHandler = wrap(async (_req, res) => {
    const body = res.locals["verifyBody"] as VerifyRequest;
    const key = res.locals["idempotencyKey"] as string;
    const bodyHash = createHash("sha256")
      .update(
        JSON.stringify([
          body.packId,
          body.submissionId,
          body.image.sha256.toLowerCase(),
          body.task.taskId,
          body.task.outcome,
          body.task.expectedCode,
          body.task.expectedGesture ?? null,
          body.task.challengeRevealedAt ?? null,
          body.task.product.ean,
          body.task.receivedAt,
          body.previousImageSha256,
        ]),
      )
      .digest("hex");
    let verdict: VerifyResponse;
    try {
      verdict = await deps.cache.run(key, bodyHash, () =>
        deps.gate.evaluate(body.task, body.image, {
          packId: body.packId,
          submissionId: body.submissionId,
          previousImageSha256: body.previousImageSha256,
        }),
      );
    } catch (err) {
      if (err instanceof IdempotencyConflict) {
        throw new AppError(
          "unprocessable",
          "Idempotency-Key was already used with a different request.",
        );
      }
      throw err;
    }
    logger.info("verify", {
      submissionId: body.submissionId,
      taskId: body.task.taskId,
      outcome: verdict.outcome,
      pass: verdict.pass,
      failedGates: verdict.failedGates,
      cached: verdict.cached,
      provider: verdict.model.provider,
    });
    res.status(200).json(verdict);
  });

  // ---- free routes
  app.get("/health", (_req, res) => {
    res.json({ ok: true, packId: env.PACK_ID, visionConfigured: deps.visionConfigured });
  });

  app.get("/v1/price", (_req, res) => {
    res.json({
      scheme: "exact",
      network: X402_NETWORK,
      price: { amount: env.VERIFY_PRICE_LOVELACE, asset: "lovelace" },
      payTo: env.SELLER_ADDRESS ?? "none",
    });
  });

  // ---- paid route: validation, then x402, then the idempotent handler
  const chain: RequestHandler[] = [requireEngineToken, json, prepare({ rejectUndecodable: true })];
  if (deps.payment.middleware) chain.push(deps.payment.middleware);
  else {
    chain.push((_req, res, next) => {
      res.setHeader("x-shelfie-payment", "off");
      next();
    });
  }
  chain.push(verifyHandler);
  app.post("/v1/verify", ...chain);

  // ---- dry routes (admin, no payment); absent unless ENABLE_DRY
  if (env.ENABLE_DRY) {
    app.post(
      "/v1/verify-dry",
      requireAdmin,
      json,
      prepare({ rejectUndecodable: false }),
      (_req, res, next) => {
        res.setHeader("x-shelfie-dry", "1");
        next();
      },
      verifyHandler,
    );
    app.post(
      "/v1/extract",
      requireAdmin,
      json,
      wrap(async (req, res) => {
        const parsed = ExtractRequestSchema.safeParse(req.body);
        if (!parsed.success) {
          throw new AppError("invalid_request", "Request body does not match the schema.");
        }
        if (!BASE64.test(parsed.data.image.base64)) {
          throw new AppError("invalid_request", "image.base64 is not valid base64.");
        }
        const out = await deps.gate.extractOnly(parsed.data.image, parsed.data.outcome);
        res.setHeader("x-shelfie-dry", "1");
        res.json(out);
      }),
    );
  }

  app.use((_req, _res, next) => {
    next(new AppError("not_found", "Not found."));
  });

  const errorHandler: ErrorRequestHandler = (err: unknown, _req, res, _next) => {
    let appErr: AppError;
    if (isAppError(err)) appErr = err;
    else if (isBodyParserError(err)) {
      appErr =
        err.type === "entity.too.large"
          ? new AppError("image_too_large", "Request body is too large.")
          : new AppError("invalid_request", "Request body is not valid JSON.");
    } else {
      logger.error("unhandled error", { name: err instanceof Error ? err.name : "unknown" });
      appErr = new AppError("internal", "Internal error.");
    }
    if (appErr.status >= 500 && appErr.code !== "vision_unavailable") {
      logger.error("request failed", { code: appErr.code });
    }
    // A status >= 400 makes the x402 middleware cancel settlement: nothing is charged.
    res.status(appErr.status ?? ERROR_STATUS[appErr.code]).json(publicErrorBody(appErr));
  };
  app.use(errorHandler);
  return app;
}

/**
 * Response body for an AppError. `vision_unavailable` keeps only its fixed `reason`: the
 * provider's status and error text are for logs and eval reports, never for the engine or the
 * paying buyer (security rule: error responses carry no upstream messages).
 */
export function publicErrorBody(err: AppError): ErrorBody {
  if (err.code !== "vision_unavailable") return err.toBody();
  const reason = err.details["reason"];
  return {
    error: {
      code: err.code,
      message: err.message,
      details: typeof reason === "string" ? { reason } : {},
    },
  };
}

function isBodyParserError(err: unknown): err is { type: string } {
  return typeof err === "object" && err !== null && "type" in err && typeof err.type === "string";
}
