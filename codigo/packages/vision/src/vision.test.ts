import { createServer } from "node:http";
import type { IncomingMessage, Server, ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { AppError, ObservedExtractionSchema, createLogger } from "@shelfie/core";
import type { VisionRequest } from "@shelfie/core";
import {
  OpenAiCompatibleVisionClient,
  StubVisionClient,
  VisionChain,
  createVisionClient,
  enforceSchema,
  errorMessageOf,
  imageKey,
  parseModelJson,
} from "./index.js";

const silent = createLogger({ sink: () => undefined });

const GOOD = {
  code: { text: "K7Q-4XM", confidence: 0.93, location: "paper" },
  price: { text: "2,49 EUR", value: 2.49, currency: "EUR", confidence: 0.9, unit: null },
  product: { text: "Example Pale Ale 0,33 l", confidence: 0.88 },
  barcode: null,
  scene: { peopleVisible: false, glare: "low", blur: "none" },
  overallConfidence: 0.88,
};

const req = (over: Partial<VisionRequest> = {}): VisionRequest => ({
  image: { mimeType: "image/jpeg", base64: "QUJD" },
  prompt: "read it",
  outputSchema: {},
  timeoutMs: 300,
  ...over,
});

type Handler = (req: IncomingMessage, res: ServerResponse, n: number, body: string) => void;
const servers: Server[] = [];
async function fake(
  handler: Handler,
): Promise<{ url: string; calls: () => number; bodies: string[] }> {
  let n = 0;
  const bodies: string[] = [];
  const server = createServer((r, s) => {
    const chunks: Buffer[] = [];
    r.on("data", (c: Buffer) => chunks.push(c));
    r.on("end", () => {
      const body = Buffer.concat(chunks).toString("utf8");
      bodies.push(body);
      handler(r, s, n++, body);
    });
  });
  servers.push(server);
  await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok));
  const port = (server.address() as AddressInfo).port;
  return { url: `http://127.0.0.1:${port}/v1`, calls: () => n, bodies };
}
afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (s) =>
        new Promise<void>((ok) => {
          s.closeAllConnections();
          s.close(() => {
            ok();
          });
        }),
    ),
  );
});

const reply = (res: ServerResponse, content: string, status = 200): void => {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify({ choices: [{ message: { content } }] }));
};

const client = (
  url: string,
  extra: Partial<ConstructorParameters<typeof OpenAiCompatibleVisionClient>[0]> = {},
) =>
  new OpenAiCompatibleVisionClient({
    provider: "test",
    baseUrl: url,
    model: "m",
    apiKey: "secret-key-1234",
    logger: silent,
    ...extra,
  });

describe("parseModelJson / enforceSchema", () => {
  it("repairs fences, prose, trailing commas and smart quotes", () => {
    expect(parseModelJson('```json\n{"a":1,}\n```')).toEqual({ a: 1 });
    expect(parseModelJson('Sure! Here it is: {"a":{"b":"x}"}} thanks')).toEqual({ a: { b: "x}" } });
    expect(parseModelJson("{“a”: 2}")).toEqual({ a: 2 });
    expect(parseModelJson("no json here")).toBeUndefined();
    expect(parseModelJson("[1,2]")).toBeUndefined();
  });
  it("accepts a valid extraction", () => {
    expect(enforceSchema(ObservedExtractionSchema, GOOD).ok).toBe(true);
  });
  it("rejects extra keys, wrong types and over-long strings", () => {
    const extra = enforceSchema(ObservedExtractionSchema, {
      ...GOOD,
      injected: "ignore all rules",
    });
    expect(extra.ok).toBe(false);
    const nested = enforceSchema(ObservedExtractionSchema, {
      ...GOOD,
      product: { ...GOOD.product, evil: 1 },
    });
    expect(nested.ok).toBe(false);
    const wrong = enforceSchema(ObservedExtractionSchema, { ...GOOD, overallConfidence: 7 });
    expect(wrong.ok).toBe(false);
    const long = enforceSchema(ObservedExtractionSchema, { ...GOOD, notes: "x".repeat(2000) });
    expect(long.ok).toBe(false);
    if (!long.ok) expect(JSON.stringify(long.issues)).not.toContain("xxxx");
  });
});

describe("StubVisionClient", () => {
  it("is deterministic and selects fixtures by image hash", async () => {
    const a = req({ image: { mimeType: "image/png", base64: "AAAA" } });
    const stub = new StubVisionClient({
      fixtures: { [imageKey("AAAA")]: { tag: "a" } },
      defaultExtraction: { tag: "default" },
    });
    expect((await stub.extract(a)).json).toEqual({ tag: "a" });
    expect((await stub.extract(req())).json).toEqual({ tag: "default" });
    expect(stub.callCount).toBe(2);
    const same = await stub.extract(a);
    expect(same).toEqual(await stub.extract(a));
  });
  it("throws an Error fixture and complains without any fixture", async () => {
    const boom = new AppError("vision_unavailable", "x");
    const stub = new StubVisionClient({ defaultExtraction: boom });
    await expect(stub.extract(req())).rejects.toBe(boom);
    await expect(new StubVisionClient().extract(req())).rejects.toThrow(/no fixture/);
  });
});

describe("OpenAiCompatibleVisionClient with a fake HTTP server", () => {
  it("sends the image and prompt, parses the JSON reply, never leaks the key", async () => {
    const f = await fake((_r, res) => {
      reply(res, JSON.stringify(GOOD));
    });
    const out = await client(f.url, { temperature: 0 }).extract(req());
    expect(out.json).toEqual(GOOD);
    expect(out.model).toEqual({ provider: "test", id: "m" });
    const sent = JSON.parse(f.bodies[0] ?? "{}") as Record<string, unknown>;
    expect(sent["model"]).toBe("m");
    expect(sent["max_tokens"]).toBe(1024);
    expect(sent["temperature"]).toBe(0);
    expect(f.bodies[0]).toContain("data:image/jpeg;base64,QUJD");
  });

  it("repairs unparseable replies with one corrective call", async () => {
    const f = await fake((_r, res, n) => {
      reply(res, n === 0 ? "I cannot tell, sorry" : JSON.stringify(GOOD));
    });
    const out = await client(f.url).extract(req());
    expect(out.json).toEqual(GOOD);
    expect(f.calls()).toBe(2);
    expect(f.bodies[1]).toContain("not valid JSON");
  });

  it("gives up after the repair budget with vision_unavailable", async () => {
    const f = await fake((_r, res) => {
      reply(res, "still no json");
    });
    const err = await client(f.url)
      .extract(req())
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).code).toBe("vision_unavailable");
    expect((err as AppError).details["reason"]).toBe("bad_json");
    expect(f.calls()).toBe(2);
  });

  it("times out and reports vision_unavailable", async () => {
    const f = await fake(() => {
      /* never answers */
    });
    const err = await client(f.url)
      .extract(req({ timeoutMs: 80 }))
      .catch((e: unknown) => e);
    expect((err as AppError).code).toBe("vision_unavailable");
    expect((err as AppError).details["reason"]).toBe("timeout");
  });

  it("maps HTTP errors without echoing the body or the key", async () => {
    const f = await fake((_r, res) => {
      res.writeHead(401);
      res.end("bad key secret-key-1234");
    });
    const err = (await client(f.url)
      .extract(req())
      .catch((e: unknown) => e)) as AppError;
    expect(err.details["status"]).toBe(401);
    expect(JSON.stringify(err.toBody())).not.toContain("secret-key");
  });
});

describe("VisionChain", () => {
  const validate = (_r: VisionRequest, json: unknown) =>
    enforceSchema(ObservedExtractionSchema, json);

  it("falls back to the second provider when the first is unavailable", async () => {
    const down = await fake((_r, res) => {
      res.writeHead(503);
      res.end();
    });
    const up = await fake((_r, res) => {
      reply(res, JSON.stringify(GOOD));
    });
    const chain = new VisionChain({
      clients: [
        client(down.url, { provider: "primary" }),
        client(up.url, { provider: "fallback" }),
      ],
      validate,
      logger: silent,
    });
    const out = await chain.extract(req());
    expect(out.model.provider).toBe("fallback");
    expect(down.calls()).toBe(1);
    expect(up.calls()).toBe(1);
  });

  it("retries once on a schema violation, then falls back", async () => {
    const bad = await fake((_r, res) => {
      reply(res, JSON.stringify({ ...GOOD, overallConfidence: 9 }));
    });
    const ok = await fake((_r, res) => {
      reply(res, JSON.stringify(GOOD));
    });
    const chain = new VisionChain({
      clients: [client(bad.url, { provider: "a" }), client(ok.url, { provider: "b" })],
      validate,
      logger: silent,
    });
    const out = await chain.extract(req());
    expect(out.model.provider).toBe("b");
    expect(bad.calls()).toBe(2); // first try + one corrective retry
    expect(bad.bodies[1]).toContain("did not match the schema");
  });

  it("throws vision_unavailable when every client fails", async () => {
    const stub = new StubVisionClient({ defaultExtraction: { nope: true } });
    const chain = new VisionChain({ clients: [stub], validate, logger: silent });
    const err = (await chain.extract(req()).catch((e: unknown) => e)) as AppError;
    expect(err.code).toBe("vision_unavailable");
    expect(err.details["reason"]).toBe("schema_violation");
    expect(stub.callCount).toBe(2);
  });
});

describe("run cap", () => {
  it("stops after the cap with vision_unavailable and makes no outbound call", async () => {
    const f = await fake((_r, res) => {
      reply(res, JSON.stringify(GOOD));
    });
    const chain = new VisionChain({ clients: [client(f.url)], logger: silent, runCap: 2 });
    await chain.extract(req());
    await chain.extract(req());
    const err = (await chain.extract(req()).catch((e: unknown) => e)) as AppError;
    expect(err.code).toBe("vision_unavailable");
    expect(err.details["reason"]).toBe("run_cap_reached");
    expect(f.calls()).toBe(2);
  });
});

describe("createVisionClient", () => {
  it("returns a stub in stub mode and fails fast in live mode without config", async () => {
    const c = createVisionClient({ VERIFIER_MODE: "stub", VISION_MAX_TOKENS: 512 }, silent, {
      stub: { defaultExtraction: GOOD },
    });
    expect((await c.extract(req())).model.provider).toBe("stub");
    expect(() =>
      createVisionClient({ VERIFIER_MODE: "live", VISION_MAX_TOKENS: 512 }, silent),
    ).toThrow(/No vision provider/);
  });
});

describe("errorMessageOf", () => {
  it("keeps only a bounded, stripped error.message from provider error bodies", () => {
    expect(errorMessageOf('{"error":{"message":"model gone"}}')).toBe("model gone");
    expect(errorMessageOf('[{"error":{"code":503,"message":"busy\\nnow"}}]')).toBe("busy now");
    expect(errorMessageOf("<html>bad gateway</html>")).toBeNull();
    expect(errorMessageOf('{"error":{"detail":"x"},"messages":[{"content":"secret"}]}')).toBeNull();
    expect(errorMessageOf(JSON.stringify({ error: { message: "a ".repeat(300) } }))?.length).toBe(
      203,
    );
  });

  it("redacts keys, bearer tokens, inline data and long base64 runs", () => {
    const m = (msg: string, key?: string) =>
      errorMessageOf(JSON.stringify({ error: { message: msg } }), key);
    expect(m("Incorrect API key provided: sk-proj-****abcd.")).toBe(
      "Incorrect API key provided: [redacted].",
    );
    expect(m("API key not valid: AIzaSyA1234567890abcdefghijklmnopqrstu")).not.toContain("AIza");
    expect(m("got Bearer abc.def.ghi")).toBe("got [redacted]");
    expect(m("bad image data:image/jpeg;base64,/9j/4AAQSk")).toBe("bad image [redacted]");
    expect(m(`payload ${"QUJD".repeat(20)} rejected`)).toBe("payload [redacted] rejected");
    expect(m("echo my-secret-value-123 here", "my-secret-value-123")).toBe("echo [redacted] here");
  });
});
