/* eslint-disable @typescript-eslint/no-unsafe-member-access -- test and smoke code reads untyped JSON responses */
import type { Router } from "express";
import { afterEach, describe, expect, it } from "vitest";
import { parseAllowedOrigins } from "./http/security.js";
import { ADMIN, EAN, SHELL, STORE_ID, makeRig } from "./testkit.js";
import type { Rig } from "./testkit.js";

let rig: Rig;
afterEach(async () => {
  await rig.close();
});

interface Layer {
  route?: { path: string; methods: Record<string, boolean> };
}

describe("admin auth (E1, E11)", () => {
  it("every route registered under /api/admin is 401 without or with a wrong token", async () => {
    rig = await makeRig({ app: { limits: { worker: null, claim: null, submit: null } } });
    // enumerate the router so a new admin route cannot skip the test
    const { createApp } = await import("./http/app.js");
    const app = createApp({
      engine: rig.engine,
      env: rig.env,
      logger: {
        debug() {},
        info() {},
        warn() {},
        error() {},
        child() {
          return this;
        },
      },
      clock: rig.clock,
    });
    const router = (app.locals as { adminRouter: Router }).adminRouter;
    const routes = (router.stack as unknown as Layer[])
      .filter((l) => l.route)
      .map((l) => l.route as NonNullable<Layer["route"]>);
    expect(routes.length).toBeGreaterThanOrEqual(6);
    for (const r of routes) {
      const method = Object.keys(r.methods)[0] ?? "post";
      const path = `/api/admin${r.path.replace(":id", "x")}`;
      // GET routes (the operator ping) cannot carry a body; the others get an empty JSON body.
      const body = method === "get" ? undefined : {};
      const none = await rig.call(method.toUpperCase(), path, body);
      expect(none.status, path).toBe(401);
      const wrong = await rig.call(method.toUpperCase(), path, body, {
        "x-admin-token": "wrong-token-value",
      });
      expect(wrong.status, path).toBe(401);
    }
    // unknown admin paths do not leak existence either
    expect((await rig.call("POST", "/api/admin/unknown")).status).toBe(401);
    // the shell token is not an admin token
    expect((await rig.shell("POST", "/api/admin/reset")).status).toBe(401);
  });

  it("GET /api/admin/ping (operator gate) is 401 without or with a wrong token, 200 with the right one", async () => {
    rig = await makeRig();
    expect((await rig.call("GET", "/api/admin/ping")).status).toBe(401);
    expect(
      (
        await rig.call("GET", "/api/admin/ping", undefined, {
          "x-admin-token": "wrong-token-value",
        })
      ).status,
    ).toBe(401);
    expect((await rig.shell("GET", "/api/admin/ping")).status).toBe(401);
    const ok = await rig.admin("GET", "/api/admin/ping");
    expect(ok.status).toBe(200);
    expect(ok.json).toEqual({ ok: true });
  });

  it("job cancel and shell routes need tokens; admin token also works for shell routes", async () => {
    rig = await makeRig();
    const body = {
      packId: "shelf-check",
      source: "demo",
      externalRef: "x1",
      input: { productEan: EAN, stores: [{ id: STORE_ID }] },
    };
    expect((await rig.call("POST", "/api/jobs", body)).status).toBe(401);
    expect((await rig.call("POST", "/api/jobs", body, { "x-shell-token": "nope" })).status).toBe(
      401,
    );
    expect((await rig.call("POST", "/api/jobs", body, { "x-admin-token": ADMIN })).status).toBe(
      201,
    );
    const id = (await rig.shell("POST", "/api/jobs", { ...body, externalRef: "x2" })).json.job
      .id as string;
    expect((await rig.call("GET", `/api/jobs/${id}/decision?waitSec=0`)).status).toBe(401);
    expect(
      (await rig.call("POST", `/api/jobs/${id}/settlement-events`, { event: "ESCROW_LOCKED" }))
        .status,
    ).toBe(401);
    expect((await rig.call("POST", `/api/jobs/${id}/cancel`)).status).toBe(401);
    expect((await rig.shell("POST", `/api/jobs/${id}/cancel`)).status).toBe(401);
  });

  it("20 wrong tokens lock the IP with 429, even for the right token", async () => {
    rig = await makeRig();
    for (let i = 0; i < 20; i++) {
      const r = await rig.call("POST", "/api/admin/reset", {}, { "x-admin-token": `wrong-${i}` });
      expect(r.status).toBe(401);
    }
    const locked = await rig.admin("POST", "/api/admin/reset");
    expect(locked.status).toBe(429);
    expect(locked.json.error.code).toBe("rate_limited");
    rig.clock.advanceSec(601);
    expect((await rig.admin("POST", "/api/admin/reset")).status).toBe(200);
  });
});

describe("hardening (E7, E8, E9)", () => {
  it("sets security headers, hides x-powered-by, no CORS headers", async () => {
    rig = await makeRig();
    const res = await rig.call("GET", "/api/health");
    for (const h of [
      "content-security-policy",
      "x-content-type-options",
      "referrer-policy",
      "permissions-policy",
      "cross-origin-opener-policy",
    ]) {
      expect(res.headers.get(h), h).toBeTruthy();
    }
    // Map tiles only (contracts section 0, team approval 2026-10-30); same value as vercel.json.
    expect(res.headers.get("content-security-policy")).toBe(
      "default-src 'self'; img-src 'self' data: blob: https://tile.openstreetmap.org; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
    );
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("x-powered-by")).toBeNull();
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
    const pre = await rig.call("OPTIONS", "/api/jobs", undefined, {
      origin: "https://evil.example",
      "access-control-request-method": "POST",
    });
    expect(pre.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("refuses a foreign Origin on state-changing requests and a foreign Host header", async () => {
    rig = await makeRig();
    const body = {
      packId: "shelf-check",
      source: "demo",
      externalRef: "o1",
      input: { productEan: EAN, stores: [{ id: STORE_ID }] },
    };
    const foreign = await rig.call("POST", "/api/jobs", body, {
      "x-shell-token": SHELL,
      origin: "https://evil.example",
    });
    expect(foreign.status).toBe(403);
    const same = await rig.call("POST", "/api/jobs", body, {
      "x-shell-token": SHELL,
      origin: rig.base,
    });
    expect(same.status).toBe(201);
    // Host allowlist: a raw request with a rebinding Host must be refused
    const url = new URL(rig.base);
    const { request } = await import("node:http");
    const status = await new Promise<number>((resolve, reject) => {
      const r = request(
        {
          host: url.hostname,
          port: Number(url.port),
          path: "/api/health",
          headers: { host: "attacker.example" },
        },
        (res) => {
          res.resume();
          resolve(res.statusCode ?? 0);
        },
      );
      r.on("error", reject);
      r.end();
    });
    expect(status).toBe(421);
  });

  it("body limits: 3 MB on a normal route and on submissions both give 413", async () => {
    rig = await makeRig();
    const big = "x".repeat(3 * 1024 * 1024);
    const r1 = await rig.shell("POST", "/api/jobs", JSON.stringify({ pad: big }));
    expect(r1.status).toBe(413);
    const job = await rig.createJob();
    const taskId = job.json.tasks[0].id as string;
    const r2 = await rig.call(
      "POST",
      `/api/tasks/${taskId}/submissions`,
      JSON.stringify({ imageBase64: big }),
    );
    expect(r2.status).toBe(413);
    expect(r2.json.error.code).toBe("image_too_large");
  });

  it("malformed JSON is a clean 400; unknown errors never leak message or stack", async () => {
    rig = await makeRig();
    const bad = await rig.shell("POST", "/api/jobs", "{not json");
    expect(bad.status).toBe(400);
    expect(bad.json.error.code).toBe("invalid_request");
    // force an unknown (non-AppError) failure inside a handler
    rig.engine.health = () => Promise.reject(new Error("sentinel-secret at /srv/app/x.ts:1"));
    const res = await rig.call("GET", "/api/health");
    expect(res.status).toBe(500);
    expect(res.json.error.code).toBe("internal");
    expect(JSON.stringify(res.json)).not.toContain("sentinel");
    expect(JSON.stringify(res.json)).not.toMatch(/\bat \S+:\d+/);
    expect(rig.logs.join("\n")).not.toContain("sentinel-secret");
  });

  it("access log carries the AppError code on 4xx, never on 2xx", async () => {
    rig = await makeRig();
    expect((await rig.call("POST", "/api/jobs", {})).status).toBe(401);
    expect((await rig.call("GET", "/api/health")).status).toBe(200);
    const http = rig.logs.filter((l) => l.includes('"http"') || l.includes("http"));
    expect(http.some((l) => /"status":401/.test(l) && /"errorCode":"[a-z_]+"/.test(l))).toBe(true);
    expect(http.some((l) => /"status":200/.test(l) && l.includes("errorCode"))).toBe(false);
  });

  it("rate limiting returns 429 with Retry-After", async () => {
    rig = await makeRig({ app: { limits: { worker: 5, claim: 2, submit: 2 } } });
    const statuses: number[] = [];
    let last = await rig.call("GET", "/api/catalog");
    statuses.push(last.status);
    for (let i = 0; i < 6; i++) {
      last = await rig.call("GET", "/api/catalog");
      statuses.push(last.status);
    }
    expect(statuses.filter((s) => s === 429).length).toBeGreaterThanOrEqual(2);
    expect(last.headers.get("retry-after")).toBeTruthy();
    expect(last.json.error.code).toBe("rate_limited");
    rig.clock.advanceSec(61);
    expect((await rig.call("GET", "/api/catalog")).status).toBe(200);
  });

  it("caps open SSE streams per IP", async () => {
    rig = await makeRig({ app: { sseMaxPerIp: 2 } });
    const ctls: AbortController[] = [];
    const codes: number[] = [];
    for (let i = 0; i < 3; i++) {
      const c = new AbortController();
      ctls.push(c);
      const res = await fetch(`${rig.base}/api/ledger/stream`, { signal: c.signal });
      codes.push(res.status);
    }
    ctls.forEach((c) => {
      c.abort();
    });
    expect(codes).toEqual([200, 200, 429]);
  });
});

describe("ALLOWED_ORIGINS exact allow-list (E9)", () => {
  const job = (n: string) => ({
    packId: "shelf-check",
    source: "demo",
    externalRef: n,
    input: { productEan: EAN, stores: [{ id: STORE_ID }] },
  });

  it("passes the exact listed origin and refuses any other vercel.app origin", async () => {
    rig = await makeRig({ env: { ALLOWED_ORIGINS: "https://shelfie.vercel.app" } });
    const ok = await rig.call("POST", "/api/jobs", job("a1"), {
      "x-shell-token": SHELL,
      origin: "https://shelfie.vercel.app",
    });
    expect(ok.status).toBe(201);
    for (const origin of [
      "https://evil.vercel.app",
      "https://shelfie.vercel.app.evil.example",
      "http://shelfie.vercel.app",
    ]) {
      const bad = await rig.call("POST", "/api/jobs", job("a2"), {
        "x-shell-token": SHELL,
        origin,
      });
      expect(bad.status, origin).toBe(403);
    }
  });

  it("refuses wildcard, path and non-http entries at parse time", () => {
    expect(() => parseAllowedOrigins("*")).toThrow();
    expect(() => parseAllowedOrigins("https://*.vercel.app")).toThrow();
    expect(() => parseAllowedOrigins("https://a.example/path")).toThrow();
    expect(() => parseAllowedOrigins("ftp://a.example")).toThrow();
    expect([...parseAllowedOrigins(" https://A.example , http://b.example:3000 ")]).toEqual([
      "https://a.example",
      "http://b.example:3000",
    ]);
  });
});

describe("input hygiene (E10, E12)", () => {
  it("ids in paths are validated (garbage ids are 404, never reach keys or paths)", async () => {
    rig = await makeRig();
    for (const p of ["/api/jobs/..%2F..%2Fetc", "/api/submissions/sub_01%00", "/api/jobs/job_zz"]) {
      expect((await rig.call("GET", p)).status).toBe(404);
    }
    expect((await rig.call("POST", "/api/claims/not-an-id/release")).status).toBe(404);
  });

  it("display names are restricted (no markup)", async () => {
    rig = await makeRig();
    const job = await rig.createJob();
    const taskId = job.json.tasks[0].id as string;
    const res = await rig.call("POST", `/api/tasks/${taskId}/claim`, {
      workerId: "wrk_aaa",
      displayName: "<img src=x onerror=alert(1)>",
      payoutAddress: `addr_test1${"q".repeat(50)}`,
      location: { lat: 48.137, lon: 11.575 },
    });
    expect(res.status).toBe(422);
    expect(res.json.error.code).toBe("input_schema_violation");
  });

  it("claim requests with unexpected fields in the job body are rejected (strict)", async () => {
    rig = await makeRig();
    const res = await rig.createJob({ extra: "field" });
    expect(res.status).toBe(422);
  });
});

describe("gesture challenge (ADR-19)", () => {
  it("no gesture leaks before the reveal: claim response, task list and config", async () => {
    rig = await makeRig({ env: { CHALLENGE_MODE: "gesture" } });
    const job = await rig.createJob();
    const taskId = job.json.tasks[0].id as string;
    const c = await rig.claim(taskId);
    const leaks = [
      c.json,
      (await rig.call("GET", "/api/tasks")).json,
      (await rig.call("GET", "/api/config")).json,
      (await rig.call("GET", `/api/jobs/${job.json.job.id}`)).json,
    ].map((j) => JSON.stringify(j));
    for (const text of leaks) expect(text).not.toMatch(/fingers|"side"/);
    expect(rig.logs.join("\n")).not.toMatch(/fingers/);
  });

  it("refuses a submission before the reveal: no verify call, no fee, no attempt", async () => {
    rig = await makeRig({ env: { CHALLENGE_MODE: "gesture" } });
    const job = await rig.createJob();
    const taskId = job.json.tasks[0].id as string;
    const c = await rig.claim(taskId);
    const s = await rig.submit(taskId, c.json.claim.id as string);
    expect(s.status).toBe(409);
    expect(s.json.error.code).toBe("challenge_not_revealed");
    await rig.engine.idle();
    expect(rig.verify.calls).toHaveLength(0);
    // after the reveal the same claim can submit
    await rig.call("POST", `/api/claims/${c.json.claim.id}/challenge`);
    expect((await rig.submit(taskId, c.json.claim.id as string)).status).toBe(202);
  });

  it("reveal refuses malformed, released and used claims", async () => {
    rig = await makeRig({ env: { CHALLENGE_MODE: "gesture" } });
    const job = await rig.createJob();
    const taskId = job.json.tasks[0].id as string;
    expect((await rig.call("POST", "/api/claims/..%2F..%2Fetc/challenge")).status).toBe(404);
    const c = await rig.claim(taskId);
    const id = c.json.claim.id as string;
    await rig.call("POST", `/api/claims/${id}/challenge`);
    await rig.submit(taskId, id);
    await rig.engine.idle();
    expect((await rig.call("POST", `/api/claims/${id}/challenge`)).json.error.code).toBe(
      "already_submitted",
    );
    const job2 = await rig.createJob({ externalRef: "sec-gesture-2" });
    const t2 = job2.json.tasks[0].id as string;
    const c2 = await rig.claim(t2, "B");
    const id2 = c2.json.claim.id as string;
    await rig.call("POST", `/api/claims/${id2}/release`);
    expect((await rig.call("POST", `/api/claims/${id2}/challenge`)).json.error.code).toBe(
      "claim_expired",
    );
  });
});
