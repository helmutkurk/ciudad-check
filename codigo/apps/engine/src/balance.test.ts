import { describe, expect, it, vi } from "vitest";
import { createAddressBalanceProbe } from "./balance.js";

const ADDR = `addr_test1${"q".repeat(50)}`;
const env = { WALLET_ADDRESS_VBUY: ADDR, BLOCKFROST_PROJECT_ID: "preprodSECRET" };
const json = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));

describe("W-VBUY balance probe", () => {
  it("sums lovelace, sends project_id and caches for 60 s", async () => {
    const f = vi.fn((_u: string, _i?: RequestInit) =>
      json({
        amount: [
          { unit: "lovelace", quantity: "9790000000" },
          { unit: "abc", quantity: "5" },
        ],
      }),
    );
    let t = 0;
    const probe = createAddressBalanceProbe(env, f as unknown as typeof fetch, () => t);
    expect(await probe()).toBe("9790000000");
    expect(await probe()).toBe("9790000000");
    expect(f).toHaveBeenCalledTimes(1);
    const [url, init] = f.mock.calls[0]!;
    expect(url).toBe(`https://cardano-preprod.blockfrost.io/api/v0/addresses/${ADDR}`);
    expect((init?.headers as Record<string, string>)["project_id"]).toBe("preprodSECRET");
    t = 61_000;
    await probe();
    expect(f).toHaveBeenCalledTimes(2);
  });
  it("is unknown without an address or on failure, and 0 for an unused address", async () => {
    const never = vi.fn();
    expect(
      await createAddressBalanceProbe({ BLOCKFROST_PROJECT_ID: "x" }, never as never)(),
    ).toBeNull();
    expect(never).not.toHaveBeenCalled();
    const bad = createAddressBalanceProbe(env, () => json({}, 500));
    expect(await bad()).toBeNull();
    const boom = createAddressBalanceProbe(env, () => Promise.reject(new Error("x")));
    expect(await boom()).toBeNull();
    const unused = createAddressBalanceProbe(env, () => json({}, 404));
    expect(await unused()).toBe("0");
  });
});
