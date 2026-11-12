import { AppError } from "@shelfie/core";
import type { EngineEnv, Logger, PayoutAdapter } from "@shelfie/core";
import * as Evolution from "@evolution-sdk/evolution";
import { z } from "zod";
import { FakePayoutAdapter } from "./fakes.js";

// Plain preprod transfer from the payout wallet (W-PAY) to a worker address, using the Cardano
// SDK pinned by the x402 template (@evolution-sdk/evolution 0.5.14) with Blockfrost.
//
// What is confirmed (from the installed package types, 2026-10-30): a seed-phrase signing client
// (`Client.make(chain).withBlockfrost(...).withSeed(...)`), `newTx().payToAddress(...)`,
// `.attachMetadata({label, metadata})`, `build() -> sign() -> submit()` returning a tx hash.
// What is NOT confirmed (verify Friday, record in codigo/docs/verified.md): that this works
// end to end on preprod against the real Blockfrost project, the metadata label we use, and the
// Blockfrost REST shapes used by find()/confirmations()/balance() (taken from the public API
// reference, never executed here).
// ADR-04 fallback order if the SDK transfer fails by 13:00 Friday: (2) Lucid/Mesh behind this
// same PayoutAdapter interface; (3) the worker address as x402 payTo of a tiny seller route on the
// engine; (4) manual operator payout with `markPaid` (flagged).

/** verify Friday: Blockfrost preprod base URL (the x402 template reads it from its env). */
export const BLOCKFROST_PREPROD_URL = "https://cardano-preprod.blockfrost.io/api/v0";
/** Transaction metadata label carrying `{ msg: [<metadataTag>] }` (CIP-20 style). verify Friday. */
export const PAYOUT_METADATA_LABEL = 674n;

export interface EvolutionPayoutAdapterConfig {
  /** Seed phrase of the payout wallet. Only this module reads it; never logged. */
  mnemonic: string;
  blockfrostProjectId: string;
  blockfrostBaseUrl?: string;
  requestTimeoutMs?: number;
  fetchImpl?: typeof fetch;
  logger?: Logger;
}

const BlockfrostTxListSchema = z.array(z.object({ tx_hash: z.string(), block_time: z.number() }));
const BlockfrostMetadataSchema = z.array(z.object({ label: z.string(), json_metadata: z.unknown() }));
const BlockfrostTxSchema = z.object({ block_height: z.number().nullable().optional() });
const BlockfrostBlockSchema = z.object({ height: z.number().nullable() });
const BlockfrostAddressSchema = z.object({
  amount: z.array(z.object({ unit: z.string(), quantity: z.string() })),
});

export class EvolutionPayoutAdapter implements PayoutAdapter {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly doFetch: typeof fetch;
  private readonly client: Evolution.Client.SigningClient;
  private addressCache: string | null = null;

  constructor(private readonly cfg: EvolutionPayoutAdapterConfig) {
    this.baseUrl = (cfg.blockfrostBaseUrl ?? BLOCKFROST_PREPROD_URL).replace(/\/+$/, "");
    this.timeoutMs = cfg.requestTimeoutMs ?? 60_000;
    this.doFetch = cfg.fetchImpl ?? fetch;
    this.client = Evolution.Client.make(Evolution.preprod)
      .withBlockfrost({ baseUrl: this.baseUrl, projectId: cfg.blockfrostProjectId })
      .withSeed({ mnemonic: cfg.mnemonic });
  }

  async send(args: {
    toAddress: string;
    lovelace: string;
    metadataTag: string;
  }): Promise<{ txHash: string }> {
    if (!args.toAddress.startsWith("addr_test1")) {
      throw notSent("invalid_address", "Payout address must be a preprod address.");
    }
    if (!/^\d+$/.test(args.lovelace)) throw notSent("invalid_amount", "Amount must be integer lovelace.");

    // Stage 1: build and sign. Failures here mean nothing was broadcast.
    let submit;
    try {
      submit = await this.withTimeout(this.buildAndSign(args), "build_sign");
    } catch (err) {
      throw this.classifyBuildError(err);
    }
    // Stage 2: submit. From here on the outcome can be unknown (timeout, connection drop).
    try {
      const hash = await this.withTimeout(submit.submit(), "submit");
      return { txHash: Evolution.TransactionHash.toHex(hash) };
    } catch (err) {
      this.cfg.logger?.warn("payout submit outcome unknown", { reason: errName(err) });
      throw new AppError("dependency_unavailable", "Payout submit outcome unknown.", undefined, {
        reason: "submit_failed",
        notSent: false,
      });
    }
  }

  private async buildAndSign(args: { toAddress: string; lovelace: string; metadataTag: string }) {
    const signBuilder = await this.client
      .newTx()
      .payToAddress({
        address: Evolution.Address.fromBech32(args.toAddress),
        assets: Evolution.Assets.fromLovelace(BigInt(args.lovelace)),
      })
      .attachMetadata({
        label: PAYOUT_METADATA_LABEL,
        metadata: Evolution.TransactionMetadatum.fromEntries([
          ["msg", Evolution.TransactionMetadatum.array([args.metadataTag])],
        ]),
      })
      .build();
    return signBuilder.sign();
  }

  async find(args: { metadataTag: string; sinceIso: string }): Promise<{ txHash: string } | null> {
    const address = await this.ownAddress();
    const since = Math.floor(Date.parse(args.sinceIso) / 1000) - 60;
    // Blockfrost lists confirmed transactions only; a tx still in the mempool is invisible.
    // That is why the queue waits a settling delay before treating "not found" as proof.
    const list = BlockfrostTxListSchema.parse(
      await this.get(`/addresses/${address}/transactions?order=desc&count=100`),
    );
    for (const tx of list) {
      if (tx.block_time < since) break;
      const meta = BlockfrostMetadataSchema.parse(await this.get(`/txs/${tx.tx_hash}/metadata`));
      const hit = meta.some(
        (m) => m.label === PAYOUT_METADATA_LABEL.toString() && JSON.stringify(m.json_metadata).includes(args.metadataTag),
      );
      if (hit) return { txHash: tx.tx_hash };
    }
    return null;
  }

  async confirmations(txHash: string): Promise<number> {
    const tx = await this.getOrNull(`/txs/${txHash}`);
    if (tx === null) return 0;
    const height = BlockfrostTxSchema.parse(tx).block_height;
    if (height === null || height === undefined) return 0;
    const latest = BlockfrostBlockSchema.parse(await this.get("/blocks/latest")).height;
    return latest === null ? 0 : Math.max(1, latest - height + 1);
  }

  async balance(): Promise<string> {
    const address = await this.ownAddress();
    const body = await this.getOrNull(`/addresses/${address}`);
    if (body === null) return "0"; // unused address
    const lovelace = BlockfrostAddressSchema.parse(body).amount.find((a) => a.unit === "lovelace");
    return lovelace?.quantity ?? "0";
  }

  private async ownAddress(): Promise<string> {
    if (this.addressCache === null) {
      const addr = await this.withTimeout(this.client.address(), "address");
      this.addressCache = Evolution.Address.toBech32(addr);
    }
    return this.addressCache;
  }

  private async get(path: string): Promise<unknown> {
    const body = await this.getOrNull(path);
    if (body === null) {
      throw new AppError("dependency_unavailable", "Blockfrost resource not found.", undefined, {
        reason: "not_found",
      });
    }
    return body;
  }

  private async getOrNull(path: string): Promise<unknown> {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort();
    }, this.timeoutMs);
    try {
      const res = await this.doFetch(`${this.baseUrl}${path}`, {
        headers: { project_id: this.cfg.blockfrostProjectId },
        signal: controller.signal,
      });
      if (res.status === 404) return null;
      if (!res.ok) {
        throw new AppError("dependency_unavailable", "Blockfrost request failed.", undefined, {
          reason: "http_status",
          status: res.status,
        });
      }
      return (await res.json());
    } catch (err) {
      if (err instanceof AppError) throw err;
      throw new AppError("dependency_unavailable", "Blockfrost unreachable.", undefined, {
        reason: controller.signal.aborted ? "timeout" : "network",
      });
    } finally {
      clearTimeout(timer);
    }
  }

  private async withTimeout<T>(p: Promise<T>, name: string): Promise<T> {
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject(new AppError("dependency_unavailable", "Timed out.", undefined, { reason: "timeout", step: name }));
      }, this.timeoutMs);
    });
    try {
      return await Promise.race([p, timeout]);
    } finally {
      clearTimeout(timer);
    }
  }

  private classifyBuildError(err: unknown): AppError {
    if (err instanceof AppError) {
      const r = err.details["reason"];
      return notSent(typeof r === "string" ? r : "build_failed", err.message);
    }
    // The SDK's error text is not echoed (it can carry UTxO and address details).
    const text = err instanceof Error ? `${err.name} ${err.message}` : "";
    const funds = /insufficient|not enough|balance|utxo/i.test(text);
    this.cfg.logger?.warn("payout build failed", { reason: errName(err), funds });
    return notSent(funds ? "insufficient_funds" : "build_failed", "Transfer could not be built.");
  }
}

function notSent(reason: string, message: string): AppError {
  return new AppError("dependency_unavailable", message, undefined, { reason, notSent: true });
}
const errName = (e: unknown): string => (e instanceof Error ? e.name : "unknown");

type PayoutAdapterEnv = Pick<
  EngineEnv,
  "FAKE_PAYMENTS" | "BLOCKFROST_PROJECT_ID" | "PAY_MNEMONIC_1" | "PAY_MNEMONIC_2"
>;

/**
 * `FAKE_PAYMENTS=1` -> FakePayoutAdapter (no wallet, no network). Otherwise the Evolution SDK
 * adapter for wallet `walletIndex` (0 -> PAY_MNEMONIC_1, 1 -> PAY_MNEMONIC_2).
 */
export function createPayoutAdapter(
  env: PayoutAdapterEnv,
  logger: Logger,
  walletIndex: 0 | 1 = 0,
): PayoutAdapter {
  if (env.FAKE_PAYMENTS) {
    logger.warn("FAKE_PAYMENTS: payouts are simulated, no transaction will be sent");
    return new FakePayoutAdapter();
  }
  const mnemonic = walletIndex === 0 ? env.PAY_MNEMONIC_1 : env.PAY_MNEMONIC_2;
  if (!mnemonic) {
    throw new AppError("internal", `Payout wallet ${String(walletIndex + 1)} is not configured.`);
  }
  if (!env.BLOCKFROST_PROJECT_ID) {
    throw new AppError("internal", "BLOCKFROST_PROJECT_ID is not configured.");
  }
  return new EvolutionPayoutAdapter({
    mnemonic,
    blockfrostProjectId: env.BLOCKFROST_PROJECT_ID,
    logger,
  });
}
