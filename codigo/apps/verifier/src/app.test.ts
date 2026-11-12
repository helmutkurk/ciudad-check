import { createHash } from "node:crypto";
import { createServer } from "node:http";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import sharp from "sharp";
import { afterAll, describe, expect, it } from "vitest";
import { FakeClock, createLogger } from "@shelfie/core";
import type { VerifyRequest, VerifyResponse } from "@shelfie/core";
import { StubVisionClient } from "@shelfie/vision";
import type { RequestHandler } from "express";
import { createApp } from "./app.js";
import type { AppDeps } from "./app.js";
import { createEvaluator } from "./evaluate.js";
import { IdempotencyCache } from "./idempotency.js";
import { SharpImageService } from "./image.js";
import { createSellerMiddleware, setupPayment } from "./payment.js";
import { perfectExtraction, stubVisionOptions, withStubTask } from "./stub-reader.js";
import { image as fakeImage, observed, task } from "./fixtures.js";

const logger = createLogger({ sink: () => undefined });
const closers: (() => Promise<void>)[] = [];
afterAll(async () => {
  await Promise.all(closers.map((c) => c()));
});

/** Deterministic noisy JPEG (high variance), 1000x800. */
async function photo(seed: number, extra = ""): Promise<Buffer> {
  const w = 1000;
  const h = 800;
  const raw = Buffer.alloc(w * h * 3);
  let s = seed >>> 0 || 1;
  for (let i = 0; i < raw.length; i++) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    raw[i] = s >>> 24;
  }
  const jpg = await sharp(raw, { raw: { width: w, height: h, channels: 3 } }).jpeg({ quality: 80 }).toBuffer();
  return extra ? Buffer.concat([jpg, Buffer.from(`\n${extra}`)]) : jpg;
}

const sha = (b: Buffer): string => createHash("sha256").update(b).digest("hex");

function body(img: Buffer, over: Partial<VerifyRequest> = {}, taskOver = {}): VerifyRequest {
  return {
    packId: "shelf-check",
    submissionId: "sub_01",
    task: task(taskOver),
    image: { mimeType: "image/jpeg", base64: img.toString("base64"), sha256: sha(img) },
    previousImageSha256: [],
    ...over,
  };
}

interface Booted {
  url: string;
  vision: StubVisionClient;
  cache: IdempotencyCache;
}

async function boot(opts: {
  enableDry?: boolean;
  payment?: AppDeps["payment"];
  engineToken?: boolean;
  vision?: StubVisionClient;
  useStubReader?: boolean;
} = {}): Promise<Booted> {
  const vision = opts.vision ?? new StubVisionClient(opts.useStubReader ? stubVisionOptions() : { defaultExtraction: observed() });
  const base = createEvaluator({ vision, images: new SharpImageService(), nowMs: () => 0 });
  const clock = new FakeClock();
  const cache = new IdempotencyCache({ clock, ttlSec: 3600 });
  const app = createApp({
    env: {
      PACK_ID: "shelf-check",
      ADMIN_TOKEN: "admin-token-test",
      ENGINE_TOKEN: "engine-token-test",
      X_ENGINE_TOKEN_REQUIRED: opts.engineToken ?? false,
      ENABLE_DRY: opts.enableDry ?? false,
      VERIFY_PRICE_LOVELACE: "1000000",
      SELLER_ADDRESS: undefined,
    },
    gate: opts.useStubReader ? withStubTask(base) : base,
    images: new SharpImageService(),
    cache,
    payment: opts.payment ?? { mode: "off", middleware: null },
    logger,
    clock,
    visionConfigured: true,
    maxImageBytes: 2_000_000,
  });
  const server: Server = await new Promise((ok) => {
    const s = app.listen(0, "127.0.0.1", () => {
      ok(s);
    });
  });
  closers.push(
    () =>
      new Promise<void>((ok) => {
        server.closeAllConnections();
        server.close(() => {
          ok();
        });
      }),
  );
  return { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, vision, cache };
}

const post = (url: string, b: unknown, headers: Record<string, string> = {}): Promise<Response> =>
  fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", "idempotency-key": "verify:sub_01", ...headers },
    body: typeof b === "string" ? b : JSON.stringify(b),
  });

describe("payment off (VERIFIER_PAYMENT=off dev bypass)", () => {
  it("serves POST /v1/verify without x402 and marks the response", async () => {
    const { url, vision } = await boot();
    const img = await photo(1);
    const res = await post(`${url}/v1/verify`, body(img));
    expect(res.status).toBe(200);
    expect(res.headers.get("x-shelfie-payment")).toBe("off");
    const v = (await res.json()) as VerifyResponse;
    expect(v.pass).toBe(true);
    expect(v.cached).toBe(false);
    expect(vision.callCount).toBe(1);
  });

  it("is refused in production", () => {
    expect(() =>
      setupPayment("off", { NODE_ENV: "production", FACILITATOR_URL: undefined, SELLER_ADDRESS: undefined, VERIFY_PRICE_LOVELACE: "1000000" }, logger),
    ).toThrow(/production/);
  });
});

describe("idempotency", () => {
  it("same key twice -> one model call, second answer is cached", async () => {
    const { url, vision, cache } = await boot();
    const img = await photo(2);
    const a = (await (await post(`${url}/v1/verify`, body(img))).json()) as VerifyResponse;
    const b = (await (await post(`${url}/v1/verify`, body(img))).json()) as VerifyResponse;
    expect(vision.callCount).toBe(1);
    expect(a.cached).toBe(false);
    expect(b.cached).toBe(true);
    expect({ ...b, cached: false }).toEqual(a);
    expect(cache.size).toBe(1);
  });

  it("concurrent requests with one key share one model call", async () => {
    const { url, vision } = await boot();
    const img = await photo(3);
    const rs = await Promise.all([1, 2, 3].map(() => post(`${url}/v1/verify`, body(img))));
    expect(rs.every((r) => r.status === 200)).toBe(true);
    expect(vision.callCount).toBe(1);
  });

  it("same key with a different request is rejected (422)", async () => {
    const { url } = await boot();
    const a = await photo(4);
    const b = await photo(5);
    expect((await post(`${url}/v1/verify`, body(a))).status).toBe(200);
    const res = await post(`${url}/v1/verify`, body(b));
    expect(res.status).toBe(422);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("unprocessable");
  });

  it("errors are not cached: a failed model call can be retried", async () => {
    const vision = new StubVisionClient({ defaultExtraction: { bad: 1 } });
    const { url } = await boot({ vision });
    const img = await photo(6);
    const r1 = await post(`${url}/v1/verify`, body(img));
    expect(r1.status).toBe(503);
    expect(((await r1.json()) as { error: { code: string } }).error.code).toBe("vision_unavailable");
    const r2 = await post(`${url}/v1/verify`, body(img));
    expect(r2.status).toBe(503);
    expect(vision.callCount).toBe(2 * 1);
  });
});

describe("validation happens before payment", () => {
  it("malformed requests never reach the payment middleware; valid ones do", async () => {
    let reached = 0;
    const gateMw: RequestHandler = (req, res, next) => {
      reached++;
      if (!req.header("payment-signature")) {
        res.status(402).json({ error: { code: "payment_required", message: "pay", details: {} } });
        return;
      }
      next();
    };
    const { url, vision } = await boot({ payment: { mode: "on", middleware: gateMw } });
    const img = await photo(7);

    expect((await post(`${url}/v1/verify`, "{not json")).status).toBe(400);
    expect((await post(`${url}/v1/verify`, { packId: "shelf-check" })).status).toBe(400);
    expect((await post(`${url}/v1/verify`, body(img), { "idempotency-key": "verify:other" })).status).toBe(400);
    expect((await post(`${url}/v1/verify`, body(img, { packId: "other-pack" }))).status).toBe(400);
    expect((await post(`${url}/v1/verify`, { ...body(img), extra: "field" })).status).toBe(400);
    const badSha = body(img);
    badSha.image.sha256 = "0".repeat(64);
    expect((await post(`${url}/v1/verify`, badSha)).status).toBe(400);
    const notImage = Buffer.from("this is not an image at all");
    expect((await post(`${url}/v1/verify`, body(notImage))).status).toBe(422);
    const big = Buffer.alloc(2_100_000, 7);
    const tooBig = await post(`${url}/v1/verify`, body(big));
    expect(tooBig.status).toBe(413);
    expect(((await tooBig.json()) as { error: { code: string } }).error.code).toBe("image_too_large");
    expect(reached).toBe(0);

    const unpaid = await post(`${url}/v1/verify`, body(img));
    expect(unpaid.status).toBe(402);
    expect(reached).toBe(1);
    expect(vision.callCount).toBe(0);

    const paid = await post(`${url}/v1/verify`, body(img), { "payment-signature": "x" });
    expect(paid.status).toBe(200);
    expect(vision.callCount).toBe(1);
  });

  it("handler failures answer >= 400 so x402 cancels settlement", async () => {
    const { url } = await boot({ vision: new StubVisionClient({ defaultExtraction: new Error("boom") }) });
    const res = await post(`${url}/v1/verify`, body(await photo(8)));
    expect(res.status).toBe(500);
    const text = JSON.stringify(await res.json());
    expect(text).not.toContain("boom");
  });

  it("G1 problems that are not decode errors come back as a verdict (blank image)", async () => {
    const { url, vision } = await boot();
    const blank = await sharp({ create: { width: 1000, height: 800, channels: 3, background: "#808080" } }).jpeg().toBuffer();
    const v = (await (await post(`${url}/v1/verify`, body(blank))).json()) as VerifyResponse;
    expect(v.failedGates).toContain("image_ok");
    expect(v.gates[0]?.reasonCode).toBe("image_blank");
    expect(vision.callCount).toBe(0);
    const small = await sharp({ create: { width: 200, height: 100, channels: 3, background: "#808080" } })
      .jpeg()
      .toBuffer();
    const v2 = (await (
      await post(`${url}/v1/verify`, body(small, { submissionId: "sub_02" }), {
        "idempotency-key": "verify:sub_02",
      })
    ).json()) as VerifyResponse;
    expect(v2.gates[0]?.reasonCode).toBe("image_too_small");
    expect(v2.gates[0]?.name).toBe("image_ok");
  });
});

describe("x402 seller middleware (real @x402/express, fake facilitator)", () => {
  it("answers 402 with the route price and payTo from env, free routes stay free", async () => {
    const facilitator: Server = createServer((req, res) => {
      res.setHeader("content-type", "application/json");
      if (req.url?.endsWith("/supported")) {
        res.end(
          JSON.stringify({
            kinds: [{ x402Version: 2, scheme: "exact", network: "cardano:preprod" }],
            extensions: [],
            signers: {},
          }),
        );
        return;
      }
      res.statusCode = 404;
      res.end("{}");
    });
    await new Promise<void>((ok) => facilitator.listen(0, "127.0.0.1", ok));
    closers.push(
      () =>
        new Promise<void>((ok) => {
          facilitator.closeAllConnections();
          facilitator.close(() => {
            ok();
          });
        }),
    );
    const facUrl = `http://127.0.0.1:${(facilitator.address() as AddressInfo).port}`;
    const middleware = createSellerMiddleware({
      facilitatorUrl: facUrl,
      payTo: "addr_test1_PLACEHOLDER_FOR_TESTS",
      priceLovelace: "1000000",
    });
    const { url, vision } = await boot({ payment: { mode: "on", middleware } });
    const res = await post(`${url}/v1/verify`, body(await photo(9)));
    expect(res.status).toBe(402);
    const header = res.headers.get("payment-required");
    expect(header).toBeTruthy();
    const required = JSON.parse(Buffer.from(header ?? "", "base64").toString("utf8")) as {
      accepts: {
        scheme: string;
        network: string;
        amount?: string;
        payTo: string;
        extra?: { confirmationPolicy?: { l1Confirmations?: number } };
      }[];
    };
    const accept = required.accepts[0];
    expect(accept?.scheme).toBe("exact");
    expect(accept?.network).toBe("cardano:preprod");
    expect(accept?.payTo).toBe("addr_test1_PLACEHOLDER_FOR_TESTS");
    expect(JSON.stringify(accept)).toContain("1000000");
    // paid answer without waiting for a block (default 1 confirmation took ~96 s on preprod)
    expect(accept?.extra?.confirmationPolicy).toEqual({ l1Confirmations: 0 });
    expect(vision.callCount).toBe(0);
    expect((await fetch(`${url}/health`)).status).toBe(200);
  });
});

describe("other endpoints", () => {
  it("GET /health and GET /v1/price are free", async () => {
    const { url } = await boot();
    const h = (await (await fetch(`${url}/health`)).json()) as Record<string, unknown>;
    expect(h).toEqual({ ok: true, packId: "shelf-check", visionConfigured: true });
    const p = (await (await fetch(`${url}/v1/price`)).json()) as Record<string, unknown>;
    expect(p["network"]).toBe("cardano:preprod");
    expect(p["price"]).toEqual({ amount: "1000000", asset: "lovelace" });
  });

  it("dry and extract routes are absent unless ENABLE_DRY, and need the admin token", async () => {
    const off = await boot({ enableDry: false });
    expect((await post(`${off.url}/v1/verify-dry`, {}, { "x-admin-token": "admin-token-test" })).status).toBe(404);
    expect((await post(`${off.url}/v1/extract`, {}, { "x-admin-token": "admin-token-test" })).status).toBe(404);

    const on = await boot({ enableDry: true });
    const img = await photo(10);
    expect((await post(`${on.url}/v1/verify-dry`, body(img))).status).toBe(401);
    expect((await post(`${on.url}/v1/verify-dry`, body(img), { "x-admin-token": "wrong" })).status).toBe(401);
    const ok = await post(`${on.url}/v1/verify-dry`, body(img), { "x-admin-token": "admin-token-test" });
    expect(ok.status).toBe(200);
    expect(ok.headers.get("x-shelfie-dry")).toBe("1");

    const ex = await post(
      `${on.url}/v1/extract`,
      { image: { mimeType: "image/jpeg", base64: img.toString("base64") }, outcome: "OBSERVED" },
      { "x-admin-token": "admin-token-test" },
    );
    expect(ex.status).toBe(200);
    const exj = (await ex.json()) as { extraction: { code: { text: string } } };
    expect(exj.extraction.code.text).toBe("K7Q-4XM");
  });

  it("requires X-Engine-Token when configured", async () => {
    const { url } = await boot({ engineToken: true });
    const img = await photo(11);
    expect((await post(`${url}/v1/verify`, body(img))).status).toBe(401);
    expect((await post(`${url}/v1/verify`, body(img), { "x-engine-token": "engine-token-test" })).status).toBe(200);
  });

  it("unknown routes answer the standard error body", async () => {
    const { url } = await boot();
    const res = await fetch(`${url}/nope`);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: { code: "not_found", message: "Not found.", details: {} } });
  });
});

describe("stub reader (VERIFIER_MODE=stub) end to end", () => {
  it("passes a clean photo and fails the staged cheat scenarios with the right gate", async () => {
    const { url } = await boot({ useStubReader: true });
    const run = async (n: number, marker: string, taskOver = {}): Promise<VerifyResponse> => {
      const img = await photo(100 + n, marker);
      const id = `sub_s${n}`;
      const res = await post(`${url}/v1/verify`, body(img, { submissionId: id }, taskOver), {
        "idempotency-key": `verify:${id}`,
      });
      expect(res.status).toBe(200);
      return (await res.json()) as VerifyResponse;
    };
    const ok = await run(1, "");
    expect(ok.pass).toBe(true);
    expect(ok.model.provider).toBe("stub");
    expect((await run(2, "SHELFIE-STUB:wrong_code")).gates.find((g) => g.name === "code_match")?.reasonCode).toBe("code_mismatch");
    expect((await run(3, "SHELFIE-STUB:no_code")).gates.find((g) => g.name === "code_match")?.reasonCode).toBe("code_missing");
    expect((await run(4, "SHELFIE-STUB:wrong_product")).gates.find((g) => g.name === "product_match")?.reasonCode).toBe("product_mismatch");
    expect((await run(5, "SHELFIE-STUB:absurd_price")).gates.find((g) => g.name === "price_sanity")?.reasonCode).toBe("price_out_of_range");
    expect((await run(6, "SHELFIE-STUB:unreadable_price")).gates.find((g) => g.name === "readable")?.reasonCode).toBe("price_unreadable");

    const oosTask = { outcome: "OUT_OF_STOCK" as const };
    const okOos = await run(7, "", oosTask);
    expect(okOos.pass).toBe(true);
    expect(okOos.outcome).toBe("OUT_OF_STOCK");
    expect((await run(8, "SHELFIE-STUB:product_present", oosTask)).gates.find((g) => g.name === "slot_empty")?.reasonCode).toBe("product_present");
    expect((await run(9, "SHELFIE-STUB:no_label", oosTask)).gates.find((g) => g.name === "label_visible")?.reasonCode).toBe("label_not_visible");
    expect((await run(10, "SHELFIE-STUB:other_label", oosTask)).gates.find((g) => g.name === "label_match")?.reasonCode).toBe("label_product_mismatch");
  });

  it("the perfect reader needs the task, so it only answers inside evaluate", () => {
    expect(perfectExtraction(task(), "OBSERVED", "ok")).toMatchObject({ code: { text: "K7Q-4XM" } });
    expect(fakeImage().mimeType).toBe("image/jpeg");
  });
});
