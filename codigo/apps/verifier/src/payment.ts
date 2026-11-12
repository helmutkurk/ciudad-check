import { AppError } from "@shelfie/core";
import type { Logger, VerifierEnv } from "@shelfie/core";
import { ExactCardanoScheme } from "@x402/cardano/exact/server";
import { HTTPFacilitatorClient } from "@x402/core/server";
import { paymentMiddleware, x402ResourceServer } from "@x402/express";
import type { RequestHandler } from "express";

// x402 seller wrapper (x402-runbook.md section 3, template seller.ts). The seller holds no keys:
// it only knows SELLER_ADDRESS (W-SELL). Route key is exactly "POST /v1/verify" (contracts 3.1).
// Behaviour confirmed in @x402/express 2.26.0 source: the handler runs after payment verify and
// before settle; a handler response with status >= 400 cancels settlement (no charge).

export const X402_NETWORK = "cardano:preprod" as const; // preprod only (network guard in core env)
export const ROUTE_KEY = "POST /v1/verify";
/** L1 confirmations before the paid response (@x402/cardano default is 1). */
export const SETTLE_L1_CONFIRMATIONS = 0;

export interface SellerPaymentOptions {
  facilitatorUrl: string;
  payTo: string;
  priceLovelace: string;
  /** Contact the facilitator at start-up (/supported). Tests turn this off. Default true. */
  syncFacilitatorOnStart?: boolean;
}

export function createSellerMiddleware(opts: SellerPaymentOptions): RequestHandler {
  const resourceServer = new x402ResourceServer(
    new HTTPFacilitatorClient({ url: opts.facilitatorUrl }),
  );
  resourceServer.register(X402_NETWORK, new ExactCardanoScheme());
  return paymentMiddleware(
    {
      [ROUTE_KEY]: {
        accepts: [
          {
            scheme: "exact",
            network: X402_NETWORK,
            price: { amount: opts.priceLovelace, asset: "lovelace" },
            payTo: opts.payTo,
            // Answer once the facilitator has submitted the payment tx, without waiting for a block
            // (default 1 confirmation took ~96 s on preprod, verified.md). Risk is on the seller only:
            // a tx that never lands leaves W-SELL without the fee, the buyer keeps its funds. A
            // production verifier chooses its own policy (ADR-18).
            extra: { confirmationPolicy: { l1Confirmations: SETTLE_L1_CONFIRMATIONS } },
          },
        ],
        description: "One shelf-photo verification",
        mimeType: "application/json",
      },
    },
    resourceServer,
    undefined,
    undefined,
    opts.syncFacilitatorOnStart ?? true,
  ) as RequestHandler;
}

export type PaymentMode = "on" | "off";

export interface PaymentSetup {
  mode: PaymentMode;
  middleware: RequestHandler | null;
}

/** `VERIFIER_PAYMENT=off` serves /v1/verify without x402: dev only, refused in production. */
export function setupPayment(
  mode: PaymentMode,
  env: Pick<
    VerifierEnv,
    "NODE_ENV" | "FACILITATOR_URL" | "SELLER_ADDRESS" | "VERIFY_PRICE_LOVELACE"
  >,
  logger: Logger,
): PaymentSetup {
  if (mode === "off") {
    if (env.NODE_ENV === "production") {
      throw new AppError("internal", "VERIFIER_PAYMENT=off is refused when NODE_ENV=production.");
    }
    logger.warn("PAYMENT BYPASS: POST /v1/verify is served without x402 (VERIFIER_PAYMENT=off)");
    return { mode, middleware: null };
  }
  if (!env.FACILITATOR_URL || !env.SELLER_ADDRESS) {
    throw new AppError("internal", "FACILITATOR_URL and SELLER_ADDRESS are required for x402.");
  }
  return {
    mode,
    middleware: createSellerMiddleware({
      facilitatorUrl: env.FACILITATOR_URL,
      payTo: env.SELLER_ADDRESS,
      priceLovelace: env.VERIFY_PRICE_LOVELACE,
    }),
  };
}
