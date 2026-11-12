// Funding check: public wallet addresses -> Blockfrost PREPROD balances. Read-only.
//   node --env-file=.env --import tsx scripts/fund-check.ts      (from codigo/, real values)
//   npx tsx scripts/fund-check.ts                                (no key: dry run, nothing is queried)
// Reads PUBLIC addresses only (never mnemonics or keys). Refuses anything that is not preprod:
// non-addr_test1 addresses, a mainnet Blockfrost project id, NETWORK other than preprod.
// Exit codes: 0 all funded or dry run, 1 a wallet is below the minimum or a refusal, 2 query error.
import {
  AppError,
  LovelaceSchema,
  FundCheckEnvSchema,
  PayoutAddressSchema,
  lovelaceToAdaString,
  loadEnv,
} from "@shelfie/core";
import type { z } from "zod";

const API = "https://cardano-preprod.blockfrost.io/api/v0";
/** Recommended working balance from domain-model section 4 (about 100 tADA each for W-VBUY, W-PAY). */
const RECOMMENDED: Record<string, bigint> = { "W-VBUY": 100_000_000n, "W-PAY": 100_000_000n };

interface Wallet {
  name: string;
  address: string;
}

function refuse(msg: string): never {
  process.stderr.write(`refused: ${msg}\n`);
  process.exit(1);
}

async function balance(address: string, projectId: string): Promise<bigint> {
  const res = await fetch(`${API}/addresses/${address}`, {
    headers: { project_id: projectId },
    signal: AbortSignal.timeout(15_000),
  });
  if (res.status === 404) return 0n; // never used on chain
  if (!res.ok) throw new Error(`Blockfrost answered HTTP ${res.status}`);
  const body = (await res.json()) as { amount?: { unit: string; quantity: string }[] };
  const lovelace = body.amount?.find((a) => a.unit === "lovelace")?.quantity ?? "0";
  return BigInt(LovelaceSchema.parse(lovelace));
}

async function main(): Promise<void> {
  let env: z.output<typeof FundCheckEnvSchema>;
  try {
    env = loadEnv(FundCheckEnvSchema, process.env);
  } catch (err) {
    if (err instanceof AppError) refuse(err.message);
    throw err;
  }
  if (env.BLOCKFROST_PROJECT_ID?.toLowerCase().startsWith("mainnet")) {
    refuse("BLOCKFROST_PROJECT_ID looks like a mainnet project. Preprod only.");
  }

  const wallets: Wallet[] = [
    { name: "W-SELL", address: env.SELLER_ADDRESS ?? "" },
    { name: "W-VBUY", address: env.WALLET_ADDRESS_VBUY ?? "" },
    { name: "W-PAY", address: env.WALLET_ADDRESS_PAY ?? "" },
    { name: "W-MPS", address: env.WALLET_ADDRESS_MPS ?? "" },
  ].filter((w) => w.address !== "");
  for (const w of wallets) {
    if (!PayoutAddressSchema.safeParse(w.address).success) {
      refuse(
        `${w.name} address is not a preprod address (addr_test1...). Mainnet addresses are never queried.`,
      );
    }
  }
  if (wallets.length === 0) {
    process.stdout.write(
      "No wallet addresses configured (SELLER_ADDRESS, WALLET_ADDRESS_VBUY/PAY/MPS). Nothing to check.\n",
    );
    return;
  }

  const min = BigInt(env.MIN_WALLET_LOVELACE);
  if (env.BLOCKFROST_PROJECT_ID === undefined) {
    process.stdout.write(
      "DRY RUN: BLOCKFROST_PROJECT_ID is not set, no request is made. Would query on preprod:\n",
    );
    for (const w of wallets)
      process.stdout.write(
        `  ${w.name}  ${w.address.slice(0, 14)}...${w.address.slice(-6)}  min ${lovelaceToAdaString(env.MIN_WALLET_LOVELACE)} tADA\n`,
      );
    return;
  }

  let low = 0;
  let failed = 0;
  for (const w of wallets) {
    try {
      const bal = await balance(w.address, env.BLOCKFROST_PROJECT_ID);
      // W-SELL only needs to exist; the others must stay above the minimum.
      const need = w.name === "W-SELL" ? 0n : min;
      const status =
        bal >= need ? ((RECOMMENDED[w.name] ?? 0n) > bal ? "OK (below recommended)" : "OK") : "LOW";
      if (status === "LOW") low++;
      process.stdout.write(
        `${w.name.padEnd(7)} ${lovelaceToAdaString(bal.toString()).padStart(14)} tADA  ${status}\n`,
      );
    } catch (err) {
      failed++;
      process.stdout.write(
        `${w.name.padEnd(7)} query failed: ${err instanceof Error ? err.message : "unknown error"}\n`,
      );
    }
  }
  if (failed > 0) process.exit(2);
  if (low > 0) {
    process.stdout.write(
      `\n${low} wallet(s) below MIN_WALLET_LOVELACE. Fund them from the preprod faucet (see scripts/setup-wallets.md).\n`,
    );
    process.exit(1);
  }
}

main().catch((err: unknown) => {
  process.stderr.write(`fund-check error: ${err instanceof Error ? err.message : "unknown"}\n`);
  process.exit(2);
});
