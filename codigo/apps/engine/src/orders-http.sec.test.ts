import { IncomingMessage, ServerResponse } from "node:http";
import { Socket } from "node:net";
import { describe, expect, it } from "vitest";
import type { Express } from "express";
import { createLogger } from "@shelfie/core";
import { createApp } from "./http/app.js";
import { BRAND_A, BRAND_B, TWO_BRANDS_ENV, orderRig } from "./orders-testkit.js";
import { EAN } from "./testkit.js";

/** Actual Express middleware/JSON parsing with Node HTTP messages; no listening socket. */
function request(
  app: Express,
  method: string,
  url: string,
  body?: unknown,
  headers: Record<string, string> = {},
) {
  return new Promise<{ status: number; body: unknown }>((resolve, reject) => {
    const socket = new Socket();
    const req = new IncomingMessage(socket);
    req.method = method;
    req.url = url;
    const text = body === undefined ? "" : JSON.stringify(body);
    req.headers = {
      host: "localhost",
      ...(body === undefined
        ? {}
        : {
            "content-type": "application/json",
            "content-length": String(Buffer.byteLength(text)),
          }),
      ...headers,
    };
    const res = new ServerResponse(req);
    res.end = ((chunk: string | Buffer) => {
      try {
        const body: unknown = JSON.parse(
          typeof chunk === "string" ? chunk : chunk.toString("utf8"),
        );
        res.emit("finish");
        resolve({ status: res.statusCode, body });
      } catch (error) {
        reject(error instanceof Error ? error : new Error("Invalid response"));
      }
      socket.destroy();
      return res;
    }) as typeof res.end;
    app(req, res);
    req.push(text || null);
    if (text) req.push(null);
  });
}

describe("order HTTP security without sockets", () => {
  it("protects every route, applies caps/intake/rate limiting and never logs headers or query secrets", async () => {
    const r = orderRig({ ORDER_MAX_STORES: "1", ORDER_DAILY_CREDIT_CAP: "100" });
    const app = createApp({
      engine: r.engine,
      orders: r.orders,
      env: r.env,
      clock: r.clock,
      logger: createLogger({ sink: (line) => r.logs.push(line) }),
    });
    const input = { productEan: EAN, storeIds: ["s1"] };
    const token = { "x-brand-token": r.env.BRAND_TOKEN! };
    for (const path of ["/api/orders", "/api/orders/ord_01"]) {
      expect((await request(app, "GET", path)).status).toBe(401);
      expect(
        (await request(app, "GET", path, undefined, { "x-brand-token": "wrong" })).status,
      ).toBe(401);
    }
    expect(
      (await request(app, "POST", `/api/orders?token=${r.env.BRAND_TOKEN!}`, input)).status,
    ).toBe(401);
    expect(
      (await request(app, "POST", "/api/orders", { ...input, storeIds: ["unknown"] }, token))
        .status,
    ).toBe(422);
    expect(r.store.orders.all()).toHaveLength(0);
    expect(
      (await request(app, "POST", "/api/orders", { ...input, storeIds: ["s1", "s2"] }, token))
        .status,
    ).toBe(429);
    const created = await request(app, "POST", "/api/orders", input, token);
    expect(created.status).toBe(201);
    expect((await request(app, "GET", "/api/orders", undefined, token)).body).toMatchObject({
      orders: [created.body],
    });
    expect((await request(app, "GET", "/api/orders/ord_01", undefined, token)).body).toEqual(
      created.body,
    );
    expect((await request(app, "POST", "/api/orders", input, token)).body).toMatchObject({
      error: { code: "daily_cap_reached" },
    });
    for (let i = 0; i < 3; i++) await request(app, "POST", "/api/orders", input, token);
    expect((await request(app, "POST", "/api/orders", input, token)).body).toMatchObject({
      error: { code: "rate_limited" },
    });
    const logs = r.logs.join("\n");
    expect(logs).not.toContain(r.env.BRAND_TOKEN!);
    expect(logs).not.toContain("?token");
  });
});

describe("brand isolation over HTTP (ADR-21)", () => {
  it("scopes orders and the profile per access code and never returns a code", async () => {
    const r = orderRig({ BRAND_TOKEN: "", BRAND_ACCOUNTS: TWO_BRANDS_ENV });
    const app = createApp({
      engine: r.engine,
      orders: r.orders,
      env: r.env,
      clock: r.clock,
      logger: createLogger({ sink: (line) => r.logs.push(line) }),
    });
    const a = { "x-brand-token": BRAND_A.token };
    const b = { "x-brand-token": BRAND_B.token };
    const input = { productEan: EAN, storeIds: ["s1"] };
    const created = await request(app, "POST", "/api/orders", input, {
      ...a,
      "idempotency-key": "brand-key-01",
    });
    expect(created.status).toBe(201);
    const id = (created.body as { orderId: string }).orderId;

    expect((await request(app, "GET", `/api/orders/${id}`, undefined, b)).body).toMatchObject({
      error: { code: "not_found" },
    });
    expect((await request(app, "GET", "/api/orders", undefined, b)).body).toEqual({ orders: [] });
    expect((await request(app, "GET", `/api/orders/${id}`, undefined, a)).body).toEqual(
      created.body,
    );
    expect(
      (
        await request(app, "POST", "/api/orders", input, {
          ...b,
          "idempotency-key": "brand-key-01",
        })
      ).body,
    ).toMatchObject({ error: { code: "invalid_request" } });

    const meA = await request(app, "GET", "/api/brand/me", undefined, a);
    expect(meA.status).toBe(200);
    expect(meA.body).toMatchObject({
      brandId: BRAND_A.id,
      name: BRAND_A.name,
      creditsReservedToday: 100,
      fake: true,
    });
    const meB = await request(app, "GET", "/api/brand/me", undefined, b);
    expect(meB.body).toMatchObject({ brandId: BRAND_B.id, creditsReservedToday: 0 });
    expect(Object.keys(meB.body as object).sort()).toEqual(
      [
        "brandId",
        "creditsReservedToday",
        "dailyCreditCap",
        "fake",
        "maxCreditsPerTask",
        "maxStores",
        "name",
        "walletAddress",
      ].sort(),
    );
    expect(JSON.stringify(meA.body) + JSON.stringify(meB.body)).not.toContain("token");

    // Summary and transactions are brand-scoped, header-only and never carry another brand's data.
    const jobId = (created.body as { jobs: { jobId: string }[] }).jobs[0]!.jobId;
    r.engine.settlementEvent(jobId, { event: "ESCROW_LOCKED", txHash: "c".repeat(64) });
    const txA = await request(app, "GET", "/api/brand/transactions", undefined, a);
    expect(txA.body).toMatchObject({ transactions: [{ orderId: id, kind: "escrow_lock" }] });
    expect((await request(app, "GET", "/api/brand/transactions", undefined, b)).body).toEqual({
      transactions: [],
    });
    expect(JSON.stringify(txA.body)).not.toContain("token");
    expect(
      (
        (await request(app, "GET", "/api/brand/summary", undefined, a)).body as {
          checks: { open: number };
        }
      ).checks.open,
    ).toBe(1);
    expect(
      (
        (await request(app, "GET", "/api/brand/summary", undefined, b)).body as {
          checks: { open: number };
        }
      ).checks.open,
    ).toBe(0);
    for (const path of ["/api/brand/summary", "/api/brand/transactions"]) {
      expect((await request(app, "GET", path)).status).toBe(401);
      expect((await request(app, "GET", `${path}?token=${BRAND_A.token}`)).status).toBe(401);
    }

    expect((await request(app, "GET", "/api/brand/me")).status).toBe(401);
    expect((await request(app, "GET", `/api/brand/me?token=${BRAND_A.token}`)).status).toBe(401);
    expect(
      (await request(app, "GET", "/api/brand/me", undefined, { "x-brand-token": "wrong" })).status,
    ).toBe(401);
    const logs = r.logs.join("\n");
    expect(logs).not.toContain(BRAND_A.token);
    expect(logs).not.toContain(BRAND_B.token);
  });
});
