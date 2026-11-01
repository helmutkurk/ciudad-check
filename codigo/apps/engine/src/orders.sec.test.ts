import { describe, expect, it } from "vitest";
import type { Request, Response } from "express";
import {
  EngineEnvSchema,
  FakeClock,
  brandAccounts,
  collectSecretValues,
  createLogger,
  loadEnv,
} from "@shelfie/core";
import { FailLock, requireBrand } from "./http/security.js";
import { BRAND_A, BRAND_B, TWO_BRANDS_ENV, orderRig } from "./orders-testkit.js";
import { EAN } from "./testkit.js";

const brand = "b".repeat(40);
const DEMO = "demo";
const body = { productEan: EAN, storeIds: ["s1"] };
const freshLock = () => new FailLock(new FakeClock());
function auth(
  headers: Record<string, string> = {},
  query: Record<string, string> = {},
  configured: string | undefined = brand,
) {
  let error: unknown;
  requireBrand(configured === undefined ? [] : [{ id: DEMO, token: configured }], freshLock())(
    { headers, query } as unknown as Request,
    { locals: {} } as unknown as Response,
    (err?: unknown) => {
      error = err;
    },
  );
  return error;
}

describe("order trust boundary", () => {
  it("returns 401 without a header, rejects query tokens, wrong codes and absent server configuration", () => {
    expect(auth()).toMatchObject({ status: 401, code: "brand_token_missing" });
    expect(auth({}, { "X-Brand-Token": brand, token: brand })).toMatchObject({
      status: 401,
      code: "brand_token_missing",
    });
    expect(auth({ "x-brand-token": "wrong" })).toMatchObject({
      status: 401,
      code: "brand_token_invalid",
    });
    expect(auth({ "x-brand-token": brand })).toBeUndefined();
    const guard = requireBrand([], freshLock());
    let err: unknown;
    guard(
      { headers: { "x-brand-token": brand } } as unknown as Request,
      {} as Response,
      (e?: unknown) => {
        err = e;
      },
    );
    expect(err).toMatchObject({ status: 401 });
  });
  it("locks an IP out after repeated wrong brand codes, even for the right code (429)", () => {
    const lock = freshLock();
    const guard = requireBrand([{ id: DEMO, token: brand }], lock);
    const call = (code: string) => {
      let err: unknown;
      guard(
        { headers: { "x-brand-token": code }, ip: "10.0.0.9" } as unknown as Request,
        { locals: {} } as unknown as Response,
        (e?: unknown) => {
          err = e;
        },
      );
      return err;
    };
    for (let i = 0; i < 20; i += 1) expect(call("wrong")).toMatchObject({ status: 401 });
    expect(call(brand)).toMatchObject({ status: 429, code: "rate_limited" });
  });
  it("refuses out-of-catalog stores/products before any Sokosumi call, with per-store reasons", async () => {
    let calls = 0;
    const r = orderRig(
      {},
      {
        createTask: () => {
          calls++;
          return Promise.resolve({ taskId: "unexpected" });
        },
      },
    );
    await expect(
      r.orders.create({ ...body, storeIds: ["s1", "unknown"] }, undefined, DEMO),
    ).rejects.toMatchObject({
      status: 422,
      details: { stores: [{ storeId: "unknown", reasons: [{ code: "unknown_store" }] }] },
    });
    await expect(
      r.orders.create({ ...body, productEan: "9999999999999" }, undefined, DEMO),
    ).rejects.toMatchObject({
      code: "intake_rejected",
    });
    await expect(
      r.orders.create({ ...body, storeIds: ["b1"] }, undefined, DEMO),
    ).rejects.toMatchObject({
      code: "intake_rejected",
    });
    expect(calls).toBe(0);
    expect(r.store.orders.all()).toHaveLength(0);
  });
  it("enforces store/daily caps as 429 before spending, and rejects duplicate ids and extra fields", async () => {
    let calls = 0;
    const r = orderRig(
      { ORDER_MAX_STORES: "1", ORDER_DAILY_CREDIT_CAP: "100" },
      {
        createTask: () => {
          calls++;
          return Promise.resolve({ taskId: "task-1" });
        },
      },
    );
    await expect(
      r.orders.create({ ...body, storeIds: ["s1", "s2"] }, undefined, DEMO),
    ).rejects.toMatchObject({
      status: 429,
      code: "order_cap_reached",
    });
    await r.orders.create(body, undefined, DEMO);
    await expect(r.orders.create(body, undefined, DEMO)).rejects.toMatchObject({
      status: 429,
      code: "daily_cap_reached",
    });
    await expect(
      r.orders.create({ ...body, storeIds: ["s1", "s1"] }, undefined, DEMO),
    ).rejects.toMatchObject({
      status: 422,
    });
    await expect(r.orders.create({ ...body, token: brand }, undefined, DEMO)).rejects.toMatchObject(
      { status: 422 },
    );
    expect(calls).toBe(1);
  });
  it("never forwards notes/tokens into Task input or stores/logs and scrubs env secrets", async () => {
    const inputs: unknown[] = [];
    const note = "synthetic-private-note";
    const r = orderRig(
      {},
      {
        createTask: (input) => {
          inputs.push(input);
          return Promise.resolve({ taskId: "task-1" });
        },
      },
    );
    await r.orders.create({ ...body, note }, undefined, DEMO);
    const output = JSON.stringify([inputs, r.store.orders.all(), r.logs]);
    expect(output).not.toContain(note);
    expect(output).not.toContain(brand);
    const logs: string[] = [];
    const source = { BRAND_TOKEN: brand, SOKOSUMI_API_TOKEN: "synthetic-api-token" };
    createLogger({
      sink: (line) => logs.push(line),
      secretValues: collectSecretValues(source),
    }).info("purchase", { token: brand, authorization: "Bearer synthetic-api-token" });
    expect(logs.join()).not.toContain(brand);
    expect(logs.join()).not.toContain(source.SOKOSUMI_API_TOKEN);
  });
  it("refuses fake orders in evidence or with a real verifier/payment mode and marks their ledger provenance", async () => {
    for (const vars of [{ EVIDENCE_RUN_LOCKED: "1" }, { VERIFY_CLIENT: "real" }] as Record<
      string,
      string
    >[]) {
      const r = orderRig(vars);
      await expect(r.orders.create(body, undefined, DEMO)).rejects.toMatchObject({
        code: "forbidden",
      });
      expect(r.store.orders.all()).toHaveLength(0);
    }
    const r = orderRig();
    // Verify the guard without needing a wallet or reading secrets.
    r.env.FAKE_PAYMENTS = false;
    await expect(r.orders.create(body, undefined, DEMO)).rejects.toMatchObject({
      code: "forbidden",
    });
    r.env.FAKE_PAYMENTS = true;
    const order = await r.orders.create(body, undefined, DEMO);
    const entries = r.engine.ledger
      .all()
      .filter((entry) => entry.refs["jobId"] === order.jobs[0]?.jobId);
    expect(entries.length).toBeGreaterThan(0);
    expect(entries.every((entry) => entry.flags["fakeSokosumi"] === true)).toBe(true);
    expect(r.engine.configView(true).orders?.fake).toBe(true);
  });
  it("/api/config orders: real client is enabled with brand accounts (ADR-22), fake needs the rehearsal gates", () => {
    const realEnv = {
      SOKOSUMI_CLIENT: "real",
      SOKOSUMI_API_TOKEN: "synthetic-api-token",
      SOKOSUMI_COWORKER_ID: "coworker-1",
      SOKOSUMI_ORGANIZATION_SLUG: "org-slug",
      // ADR-22: real orders also need real payments and verifier
      FAKE_PAYMENTS: "0",
      VERIFY_CLIENT: "real",
      BLOCKFROST_PROJECT_ID: "preprodabc",
      PAY_MNEMONIC_1: "synthetic-fixture",
      VERIFIER_PAYMENT: "off",
    };
    const real = orderRig(realEnv).engine.configView(true).orders;
    expect(real).toMatchObject({ enabled: true, realReady: true, fake: false });
    const locked = orderRig({ ...realEnv, EVIDENCE_RUN_LOCKED: "1" }).engine.configView(
      true,
    ).orders;
    expect(locked).toMatchObject({ enabled: true, realReady: true, fake: false });
    // Fake client with real payments: fake orders stay disabled.
    const payments = orderRig();
    payments.env.FAKE_PAYMENTS = false;
    expect(payments.engine.configView(true).orders).toMatchObject({
      enabled: false,
      realReady: false,
      fake: true,
    });
    // No brand accounts: orders disabled (real mode refuses to boot without them, so test fake).
    const noBrand = orderRig({ BRAND_TOKEN: "" });
    expect(noBrand.engine.configView(true).orders).toMatchObject({
      enabled: false,
      realReady: false,
      fake: true,
    });
  });
  it("enables real orders only with every real setting, real payments and verifier", () => {
    const real = {
      SOKOSUMI_CLIENT: "real",
      SOKOSUMI_API_TOKEN: "synthetic-api-token",
      SOKOSUMI_COWORKER_ID: "coworker-1",
      SOKOSUMI_ORGANIZATION_SLUG: "org-slug",
      BRAND_ACCOUNTS: `acme|Acme|addr_test1${"q".repeat(50)}|${"t".repeat(40)}`,
    };
    const view = (vars: Record<string, string>) => orderRig(vars).engine.configView(true).orders;
    // real client but fake payments (rig default): not ready
    expect(view({ ...real })).toMatchObject({ fake: false, enabled: false, realReady: false });
    const live = {
      ...real,
      FAKE_PAYMENTS: "0",
      VERIFY_CLIENT: "real",
      BLOCKFROST_PROJECT_ID: "preprodabc",
      PAY_MNEMONIC_1: "synthetic-fixture",
      VERIFIER_PAYMENT: "off",
    };
    expect(view(live)).toMatchObject({ fake: false, enabled: true, realReady: true });
    // fake combination stays enabled and never reports realReady
    expect(view({})).toMatchObject({ fake: true, enabled: true, realReady: false });
  });
  it("fails closed on real-mode credentials, weak brand codes and non-preprod URLs", () => {
    for (const vars of [
      { SOKOSUMI_CLIENT: "real" },
      { BRAND_TOKEN: "short" },
      { SOKOSUMI_API_URL: "https://example.invalid" },
      {
        SOKOSUMI_CLIENT: "real",
        SOKOSUMI_API_TOKEN: "synthetic-api-token",
        SOKOSUMI_AGENT_ID: "agent-1",
      },
    ]) {
      expect(() => loadEnv(EngineEnvSchema, { FAKE_PAYMENTS: "1", ...vars })).toThrow();
    }
  });
});

describe("brand isolation (ADR-21)", () => {
  const twoBrands = { BRAND_TOKEN: "", BRAND_ACCOUNTS: TWO_BRANDS_ENV };

  it("a brand cannot list or get another brand's order; the answer equals a missing order", async () => {
    const r = orderRig(twoBrands);
    const mine = await r.orders.create(body, undefined, BRAND_A.id);
    expect(r.orders.list(BRAND_A.id).orders.map((o) => o.orderId)).toEqual([mine.orderId]);
    expect(r.orders.list(BRAND_B.id).orders).toEqual([]);
    const errorOf = (fn: () => unknown): unknown => {
      try {
        fn();
      } catch (e) {
        return e;
      }
      return undefined;
    };
    const foreign = errorOf(() => r.orders.get(mine.orderId, BRAND_B.id));
    const missing = errorOf(() => r.orders.get("ord_doesnotexist", BRAND_B.id));
    expect(foreign).toMatchObject({ code: "not_found", status: 404 });
    expect(foreign).toMatchObject({
      code: "not_found",
      status: 404,
      message: (missing as Error).message,
    });
    expect(r.orders.get(mine.orderId, BRAND_A.id).orderId).toBe(mine.orderId);
  });

  it("an idempotency key used by another brand is refused with the same 409 as a changed order", async () => {
    const r = orderRig(twoBrands);
    const mine = await r.orders.create(body, "brand-key-01", BRAND_A.id);
    await expect(r.orders.create(body, "brand-key-01", BRAND_B.id)).rejects.toMatchObject({
      status: 409,
      code: "invalid_request",
    });
    await expect(
      r.orders.create({ ...body, storeIds: ["s2"] }, "brand-key-01", BRAND_B.id),
    ).rejects.toMatchObject({ status: 409, code: "invalid_request" });
    expect(r.store.orders.all()).toHaveLength(1);
    expect((await r.orders.create(body, "brand-key-01", BRAND_A.id)).orderId).toBe(mine.orderId);
  });

  it("records without brandId belong to the demo brand only", async () => {
    const r = orderRig({ BRAND_TOKEN: "d".repeat(40) });
    const order = await r.orders.create(body, undefined, "demo");
    const { brandId: _ignored, ...legacy } = r.store.orders.get(order.orderId)!;
    r.store.orders.put(legacy);
    expect(r.orders.get(order.orderId, "demo").orderId).toBe(order.orderId);
    expect(() => r.orders.get(order.orderId, BRAND_A.id)).toThrow(/not found/i);
    const other = orderRig(twoBrands);
    other.store.orders.put(legacy);
    expect(() => other.orders.get(order.orderId, BRAND_A.id)).toThrow(/not found/i);
    expect(other.orders.list(BRAND_A.id).orders).toEqual([]);
  });

  it("profile counts only this brand's reservations today and never carries a code", async () => {
    const r = orderRig(twoBrands);
    const brands = brandAccounts(r.env);
    const a = brands.find((b) => b.id === BRAND_A.id)!;
    const b = brands.find((x) => x.id === BRAND_B.id)!;
    expect(r.orders.profile(b)).toMatchObject({ creditsReservedToday: 0, fake: true });
    await r.orders.create({ ...body, storeIds: ["s1", "s2"] }, undefined, BRAND_A.id);
    const profile = r.orders.profile(a);
    expect(profile).toEqual({
      brandId: BRAND_A.id,
      name: BRAND_A.name,
      walletAddress: `addr_test1${"q".repeat(60)}`,
      creditsReservedToday: 200,
      dailyCreditCap: r.env.ORDER_DAILY_CREDIT_CAP,
      maxCreditsPerTask: r.env.SOKOSUMI_MAX_CREDITS_PER_TASK,
      maxStores: r.env.ORDER_MAX_STORES,
      fake: true,
    });
    expect(r.orders.profile(b).creditsReservedToday).toBe(0);
    expect(JSON.stringify(profile)).not.toContain(BRAND_A.token);
  });
});
