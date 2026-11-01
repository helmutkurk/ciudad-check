import { describe, expect, it, vi } from "vitest";
import { auditChain, checkTransfer, walletDelta } from "./ledger-audit-chain.js";
import type { ChainTx } from "./ledger-audit-chain.js";
const buyer = `addr_test1${"a".repeat(30)}`;
const seller = `addr_test1${"b".repeat(30)}`;
const hash = "c".repeat(64);
const coin = (quantity: string) => [{ unit: "lovelace", quantity }];
function tx(): ChainTx {
  return {
    hash,
    fees: "170001",
    block_time: 1793361600,
    valid_contract: true,
    inputs: [{ address: buyer, amount: coin("10000000"), collateral: false, reference: false }],
    outputs: [
      { address: seller, amount: coin("1000000"), collateral: false },
      { address: buyer, amount: coin("8829999"), collateral: false },
    ],
  };
}
describe("chain checks (synthetic UTxOs, no sockets)", () => {
  it("checks aggregate receiver amount, excludes change and computes the exact signed delta", () => {
    expect(checkTransfer(tx(), buyer, seller, "1000000")).toEqual([]);
    expect(walletDelta(tx(), buyer)).toBe(-1170001n);
    expect(walletDelta(tx(), seller)).toBe(1000000n);
  });
  it("does not accept a reference or collateral input as evidence of the sender", () => {
    const t = tx();
    t.inputs[0]!.reference = true;
    expect(checkTransfer(t, buyer, seller, "1000000")).toContain("sender");
    t.inputs[0]!.reference = false;
    t.inputs[0]!.collateral = true;
    expect(checkTransfer(t, buyer, seller, "1000000")).toContain("sender");
  });
  it("rejects wrong amounts, wrong receivers, and script validation failure", () => {
    expect(checkTransfer(tx(), buyer, seller, "2000000")).toContain("amount");
    expect(checkTransfer(tx(), buyer, buyer, "1000000")).toContain("amount");
    expect(checkTransfer({ ...tx(), valid_contract: false }, buyer, seller, "1000000")).toContain(
      "invalid_contract",
    );
  });
  it("does not count collateral outputs or the receiver's own spent funds as a payment", () => {
    const t = tx();
    t.outputs[0]!.collateral = true;
    expect(checkTransfer(t, buyer, seller, "1000000")).toContain("amount");
    t.outputs[0]!.collateral = false;
    t.inputs.push({
      address: seller,
      amount: coin("1000000"),
      collateral: false,
      reference: false,
    });
    expect(checkTransfer(t, buyer, seller, "1000000")).toContain("amount");
  });
  it("paginates wallet history, caches txs, and reports funding as a balance residual", async () => {
    const calls: string[] = [];
    const fetchImpl = vi.fn((url: string) => {
      calls.push(url);
      if (url.endsWith("/blocks/latest")) return Promise.resolve({ height: 42 });
      if (url.includes("/transactions?"))
        return Promise.resolve(
          url.includes("page=1&")
            ? Array.from({ length: 100 }, () => ({ tx_hash: hash, block_time: 1793361600 }))
            : [],
        );
      if (url.endsWith("/utxos")) return Promise.resolve(tx());
      return Promise.resolve(tx());
    });
    const result = await auditChain(
      [{ hash, expected: [{ kind: "verify", amount: "1000000" }] }],
      { buyer, pay: `addr_test1${"d".repeat(30)}`, seller },
      "2026-10-30T12:00:00.000Z",
      "2026-10-30T13:00:00.000Z",
      fetchImpl,
    );
    expect(result.discrepancies).toEqual([]);
    expect(result.wallets[0]?.observedDelta).toBe("-1170001");
    expect(result.wallets[0]?.residual).toBe("0");
    expect(calls.some((c) => c.includes("page=2&"))).toBe(true);
    expect(calls.filter((c) => c.endsWith(`/txs/${hash}`))).toHaveLength(1);
  });
  it("reports lookup failure without exposing upstream bodies or errors", async () => {
    const result = await auditChain(
      [{ hash, expected: [] }],
      { buyer, pay: buyer, seller },
      "2026-10-30T12:00:00.000Z",
      "2026-10-30T13:00:00.000Z",
      () => Promise.reject(new Error("sensitive upstream text")),
    );
    expect(result.discrepancies.some((d) => d.code === "chain_lookup")).toBe(true);
    expect(JSON.stringify(result)).not.toContain("sensitive upstream text");
  });
});
