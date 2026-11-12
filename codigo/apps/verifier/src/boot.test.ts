import { describe, expect, it } from "vitest";
import { bootVerifier } from "./boot.js";

describe("bootVerifier", () => {
  it("starts in stub mode with payment off and no keys, and refuses mainnet addresses", () => {
    const { app, env } = bootVerifier({ VERIFIER_PAYMENT: "off", VERIFIER_MODE: "stub", LOG_LEVEL: "error" });
    expect(typeof app).toBe("function");
    expect(env.ENABLE_DRY).toBe(true); // implied by VERIFIER_PAYMENT=off
    expect(() =>
      bootVerifier({ VERIFIER_PAYMENT: "off", SELLER_ADDRESS: "notpreprodaddress", LOG_LEVEL: "error" }),
    ).toThrow(/SELLER_ADDRESS/);
  });

  it("payment on needs the seller address and the facilitator (fails fast, names only)", () => {
    expect(() => bootVerifier({ VERIFIER_MODE: "stub", LOG_LEVEL: "error" })).toThrow(/SELLER_ADDRESS/);
  });

  it("live mode needs the vision settings", () => {
    expect(() =>
      bootVerifier({ VERIFIER_PAYMENT: "off", VERIFIER_MODE: "live", LOG_LEVEL: "error" }),
    ).toThrow(/VISION_API_KEY/);
  });
});
