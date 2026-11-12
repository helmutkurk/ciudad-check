import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  EngineEnvSchema,
  VerifierEnvSchema,
  FundCheckEnvSchema,
  WebDevEnvSchema,
  loadEnv,
} from "./env.js";

const engineSource = { FAKE_PAYMENTS: "1" };
describe("integration configuration boundaries", () => {
  it("keeps engine switches, payee pin and daily cap in the core contract", () => {
    const switches = {
      SELLER_ADDRESS: `addr_test1${"q".repeat(50)}`,
      PAYOUT_DAILY_CAP_LOVELACE: "6000000",
      ALLOWED_HOSTS: "localhost",
      CATALOG_DIR: "/tmp/catalog",
      WEB_DIST: "/tmp/web",
      VERIFY_CLIENT: "real",
      PAYMENTS_IMPL: "package",
      PAYOUT_STORE_PATH: "/tmp/queue.json",
      EVIDENCE_RUN_LOCKED: "true",
    };
    expect(loadEnv(EngineEnvSchema, { ...engineSource, ...switches })).toMatchObject({
      ...switches,
      EVIDENCE_RUN_LOCKED: true,
    });
  });
  it("rejects mainnet payees and malformed engine switches", () => {
    for (const extra of [
      { SELLER_ADDRESS: "addr1privatevalue" },
      { PAYOUT_DAILY_CAP_LOVELACE: "1.5" },
      { VERIFY_CLIENT: "typo" },
      { EVIDENCE_RUN_LOCKED: "typo" },
      { VERIFY_RUN_CAP_LOVELACE: "1000000" }, // below the 2 tADA per-payment cap
      { VERIFY_RUN_CAP_LOVELACE: "2.5" },
    ]) {
      expect(() => loadEnv(EngineEnvSchema, { ...engineSource, ...extra })).toThrow();
    }
  });
  it("loads verifier payment and vision cap and rejects invalid caps", () => {
    expect(
      loadEnv(VerifierEnvSchema, { VERIFIER_PAYMENT: "off", VISION_RUN_CAP: "3" }),
    ).toMatchObject({ VERIFIER_PAYMENT: "off", VISION_RUN_CAP: 3, ENABLE_DRY: true });
    for (const cap of ["0", "-1", "1.5", "many"]) {
      expect(() =>
        loadEnv(VerifierEnvSchema, { ENABLE_DRY: "true", VISION_RUN_CAP: cap }),
      ).toThrow();
    }
  });
  it("production verifier (evidence runs, P6): paid route only, dry off, engine token required", () => {
    const prod = {
      NODE_ENV: "production",
      ADMIN_TOKEN: "a".repeat(32),
      ENGINE_TOKEN: "e".repeat(32),
      SELLER_ADDRESS:
        "addr_test1qz3edturjtvrytfy933t927942auguhd0wxkrxkdv0mumwph9ehp5qhzatv4x6rpwxs7adkwplkl2gsudfxk052frhcq3tnrpj",
      FACILITATOR_URL: "https://facilitator.invalid",
      X_ENGINE_TOKEN_REQUIRED: "true",
    };
    expect(loadEnv(VerifierEnvSchema, prod)).toMatchObject({
      ENABLE_DRY: false,
      X_ENGINE_TOKEN_REQUIRED: true,
    });
    expect(() => loadEnv(VerifierEnvSchema, { ...prod, ENABLE_DRY: "true" })).toThrow(/ENABLE_DRY/);
    expect(() => loadEnv(VerifierEnvSchema, { ...prod, X_ENGINE_TOKEN_REQUIRED: "false" })).toThrow(
      /X_ENGINE_TOKEN_REQUIRED/,
    );
    expect(() => loadEnv(VerifierEnvSchema, { ...prod, VERIFIER_PAYMENT: "off" })).toThrow(
      /VERIFIER_PAYMENT/,
    );
  });
  it("requires the expected seller for real paid verification", () => {
    expect(() =>
      loadEnv(EngineEnvSchema, {
        VERIFIER_PAYMENT: "on",
        BLOCKFROST_PROJECT_ID: "preprod-fixture",
        PAY_MNEMONIC_1: "synthetic-fixture",
        VBUY_MNEMONIC_1: "synthetic-fixture",
        FACILITATOR_URL: "https://facilitator.invalid",
      }),
    ).toThrow(/SELLER_ADDRESS/);
  });
  it("validates public funding addresses before any network request", () => {
    const address = `addr_test1${"q".repeat(50)}`;
    expect(loadEnv(FundCheckEnvSchema, { WALLET_ADDRESS_PAY: address }).WALLET_ADDRESS_PAY).toBe(
      address,
    );
    for (const key of ["WALLET_ADDRESS_VBUY", "WALLET_ADDRESS_PAY", "WALLET_ADDRESS_MPS"]) {
      expect(() => loadEnv(FundCheckEnvSchema, { [key]: "addr1fixture" })).toThrow();
    }
    expect(() => loadEnv(FundCheckEnvSchema, { NETWORK: "mainnet" })).toThrow();
    expect(() =>
      loadEnv(FundCheckEnvSchema, { BLOCKFROST_PROJECT_ID: "mainnet-fixture" }),
    ).toThrow();
  });
  it("validates the dev proxy URL and engine port", () => {
    expect(loadEnv(WebDevEnvSchema, { ENGINE_PORT: "4010" }).ENGINE_PORT).toBe(4010);
    expect(
      loadEnv(WebDevEnvSchema, { VITE_ENGINE_URL: "http://localhost:4011" }).VITE_ENGINE_URL,
    ).toBe("http://localhost:4011");
    expect(() => loadEnv(WebDevEnvSchema, { VITE_ENGINE_URL: "invalid" })).toThrow();
  });
  it("offers browser subpaths with no node imports or server env names in their dependency graph", () => {
    const seen = new Set<string>();
    function visit(url: URL): void {
      if (seen.has(url.href)) return;
      seen.add(url.href);
      const source = readFileSync(url, "utf8");
      expect(source).not.toMatch(/["']node:|MNEMONIC|API_KEY|ADMIN_TOKEN|SELLER_ADDRESS/);
      for (const match of source.matchAll(/(?:from|import)\s*["'](\.[^"']+)["']/g)) {
        visit(new URL(match[1]!.replace(/\.js$/, ".ts"), url));
      }
    }
    visit(new URL(import.meta.resolve("@shelfie/core/browser")));
    visit(new URL(import.meta.resolve("@shelfie/evidence/explorer")));
  });
});
