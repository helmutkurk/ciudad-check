import { LovelaceSchema, Sha256Schema } from "@shelfie/core";
import { z } from "zod";
import type { Discrepancy, RecordedTransaction } from "./ledger-audit-consistency.js";
import { shortHash } from "./ledger-audit-consistency.js";

// Blockfrost's official OpenAPI: https://github.com/blockfrost/openapi/blob/master/openapi.yaml
// reference inputs and collateral are NOT ordinary spent inputs/received outputs.
const AmountSchema = z.array(z.object({ unit: z.string(), quantity: LovelaceSchema }));
const UtxoSchema = z.object({
  address: z.string(),
  amount: AmountSchema,
  collateral: z.boolean(),
  reference: z.boolean().optional(),
});
const MetaSchema = z.object({
  hash: Sha256Schema,
  fees: LovelaceSchema,
  block_time: z.number().int().nonnegative(),
  valid_contract: z.boolean(),
});
const UtxosSchema = z.object({
  hash: Sha256Schema,
  inputs: z.array(UtxoSchema),
  outputs: z.array(UtxoSchema),
});
export type ChainTx = z.infer<typeof MetaSchema> & z.infer<typeof UtxosSchema>;
export interface WalletReport {
  wallet: string;
  recordedPayments: string;
  fees: string;
  expectedDelta: string;
  observedDelta: string;
  residual: string;
  transactions: number;
}
export interface ChainResult {
  checked: number;
  discrepancies: Discrepancy[];
  wallets: WalletReport[];
}
export type Query = (path: string) => Promise<unknown>;
const coins = (utxo: z.infer<typeof UtxoSchema>): bigint =>
  utxo.amount.reduce((n, a) => (a.unit === "lovelace" ? n + BigInt(a.quantity) : n), 0n);
const normal = (utxo: z.infer<typeof UtxoSchema>): boolean => !utxo.collateral && !utxo.reference;

/** Exact net lovelace movement at one address; excludes reference and collateral entries. */
export function walletDelta(tx: ChainTx, address: string): bigint {
  const sum = (rows: ChainTx["inputs"]): bigint =>
    rows
      .filter((u) => normal(u) && u.address === address)
      .reduce((total, u) => total + coins(u), 0n);
  return sum(tx.outputs) - sum(tx.inputs);
}

export function checkTransfer(
  tx: ChainTx,
  sender: string,
  receiver: string | undefined,
  amount: string,
): string[] {
  const issues: string[] = [];
  if (!tx.valid_contract) issues.push("invalid_contract");
  if (!tx.inputs.some((u) => normal(u) && u.address === sender)) issues.push("sender");
  const received = receiver
    ? walletDelta(tx, receiver)
    : tx.outputs
        .filter((u) => normal(u) && u.address !== sender)
        .reduce((n, u) => n + coins(u), 0n);
  if (received !== BigInt(amount)) issues.push("amount");
  return issues;
}

/** All IO is injected. No signing, submitting, payment SDK, or credential processing here. */
export async function auditChain(
  recorded: RecordedTransaction[],
  addresses: { buyer: string; pay: string; seller: string },
  start: string,
  end: string,
  query: Query,
): Promise<ChainResult> {
  const discrepancies: Discrepancy[] = [];
  const wallets: WalletReport[] = [];
  let checked = 0;
  const cache = new Map<string, Promise<ChainTx>>();
  const getTx = (hash: string): Promise<ChainTx> => {
    const existing = cache.get(hash);
    if (existing) return existing;
    const pending = (async () => {
      const meta = MetaSchema.parse(await query(`/txs/${hash}`));
      const utxos = UtxosSchema.parse(await query(`/txs/${hash}/utxos`));
      if (meta.hash !== hash || utxos.hash !== hash) throw new Error("Hash mismatch");
      return { ...meta, ...utxos };
    })();
    cache.set(hash, pending);
    return pending;
  };
  for (const record of recorded) {
    try {
      const tx = await getTx(record.hash);
      checked++;
      for (const expected of record.expected) {
        const sender = expected.kind === "verify" ? addresses.buyer : addresses.pay;
        const receiver = expected.kind === "verify" ? addresses.seller : expected.receiver;
        for (const reason of checkTransfer(tx, sender, receiver, expected.amount))
          discrepancies.push({
            code: `chain_${reason}`,
            detail: `${expected.kind} ${shortHash(record.hash)}: ${reason} differs from recorded/configured transfer.`,
          });
      }
    } catch {
      discrepancies.push({
        code: "chain_lookup",
        detail: `Transaction ${shortHash(record.hash)} not found or Blockfrost query/schema failed.`,
      });
    }
  }
  let height: number;
  try {
    height = z
      .object({ height: z.number().int().nonnegative() })
      .parse(await query("/blocks/latest")).height;
  } catch {
    discrepancies.push({
      code: "balance_lookup",
      detail: "Cannot anchor wallet history to a preprod block height.",
    });
    return { checked, discrepancies, wallets };
  }
  const from = Date.parse(start),
    to = Date.parse(end);
  for (const [name, address, kind] of [
    ["W-VBUY", addresses.buyer, "verify"],
    ["W-PAY", addresses.pay, "payout"],
  ] as const) {
    try {
      const history = new Set<string>();
      let finished = false;
      for (let page = 1; !finished; page++) {
        const rows = z
          .array(z.object({ tx_hash: Sha256Schema, block_time: z.number().int().nonnegative() }))
          .parse(
            await query(
              `/addresses/${address}/transactions?count=100&page=${page}&order=desc&to=${height}`,
            ),
          );
        if (rows.length < 100) finished = true;
        for (const row of rows) {
          if (row.block_time * 1000 < from) {
            finished = true;
            continue;
          }
          if (row.block_time * 1000 <= to) history.add(row.tx_hash);
        }
      }
      let observed = 0n,
        fees = 0n,
        principal = 0n;
      for (const hash of history) {
        const tx = await getTx(hash);
        if (!tx.valid_contract) throw new Error("Cannot reconstruct script collateral movement");
        observed += walletDelta(tx, address);
      }
      for (const record of recorded) {
        const expected = record.expected.filter((e) => e.kind === kind);
        if (!expected.length) continue;
        const tx = await getTx(record.hash);
        if (tx.block_time * 1000 < from || tx.block_time * 1000 > to) continue;
        // One chain transaction can have several observations; count it once per wallet.
        principal += BigInt(expected[0]!.amount);
        fees += BigInt(tx.fees);
      }
      const expected = -principal - fees;
      wallets.push({
        wallet: name,
        recordedPayments: principal.toString(),
        fees: fees.toString(),
        expectedDelta: expected.toString(),
        observedDelta: observed.toString(),
        residual: (observed - expected).toString(),
        transactions: history.size,
      });
    } catch {
      discrepancies.push({
        code: "balance_lookup",
        detail: `${name} history reconstruction failed; balance delta is unavailable.`,
      });
    }
  }
  return { checked, discrepancies, wallets };
}
