/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment -- tests read untyped JSON responses */
import { readdirSync, readFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import { streetPack } from "@shelfie/domain-street";
import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "../http/app.js";
import { ADMIN, makeJpeg, makeRig } from "../testkit.js";
import type { Rig } from "../testkit.js";
import { StreetService } from "./service.js";
import { StreetStore } from "./store.js";
import { syntheticStreetPhoto } from "./synthetic.js";
import { HttpStreetVerifier } from "./verifier.js";

let rig: Rig;
afterEach(async () => {
  await rig.close();
});

const GT = { lat: 14.6349, lng: -90.5069 };
const fix = { ...GT, accuracyM: 10, fixAgeMs: 500 };
const missionBody = {
  kind: "confirm",
  category: "pothole",
  ...GT,
  radiusM: 30,
  payout: { amountMinor: 1250, currency: "GTQ" },
};
const reportBody = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  category: "pothole",
  photo: syntheticStreetPhoto(),
  location: fix,
  ...over,
});

describe("street admin auth", () => {
  it("POST /api/admin/missions is 401 without, with a wrong and with the shell token", async () => {
    rig = await makeRig();
    expect((await rig.call("POST", "/api/admin/missions", missionBody)).status).toBe(401);
    expect(
      (await rig.call("POST", "/api/admin/missions", missionBody, { "x-admin-token": "wrong" }))
        .status,
    ).toBe(401);
    expect((await rig.shell("POST", "/api/admin/missions", missionBody)).status).toBe(401);
    // a token in the body or query is not a token
    expect(
      (await rig.call("POST", `/api/admin/missions?token=${ADMIN}`, { ...missionBody, ADMIN }))
        .status,
    ).toBe(401);
    expect(rig.streetStore.missions.all()).toHaveLength(0);
    expect((await rig.admin("POST", "/api/admin/missions", missionBody)).status).toBe(201);
  });

  it("there is no public way to create a mission", async () => {
    rig = await makeRig();
    const r = await rig.call("POST", "/api/missions", missionBody);
    expect(r.status).toBe(404);
    expect(rig.streetStore.missions.all()).toHaveLength(0);
  });
});

describe("street body limits", () => {
  it("non-photo routes keep the 16 kb limit", async () => {
    rig = await makeRig();
    const pad = "x".repeat(20_000);
    const claim = await rig.call("POST", "/api/missions/mis_01/claim", { workerId: "wrk_a", pad });
    expect(claim.status).toBe(413);
    const admin = await rig.admin("POST", "/api/admin/missions", { ...missionBody, pad });
    expect(admin.status).toBe(413);
  });

  it("photo routes have a bounded parser: an oversize body is 413 on report and submit", async () => {
    rig = await makeRig();
    const huge = { mimeType: "image/jpeg", base64: "A".repeat(3_500_000) };
    const rep = await rig.call("POST", "/api/reports", reportBody({ photo: huge }));
    expect(rep.status).toBe(413);
    expect(rep.json.error.code).toBe("image_too_large");
    const sub = await rig.call("POST", "/api/missions/mis_01/submit", {
      workerId: "wrk_a",
      photo: huge,
      location: fix,
    });
    expect(sub.status).toBe(413);
    expect(rig.streetStore.photos.all()).toHaveLength(0);
  });

  it("a photo over the pack byte limit that fits the parser is still refused", async () => {
    rig = await makeRig();
    // 2.4 MB of base64 text decodes to 1.8 MB (allowed by the parser); pad the decoded size over 2 MB
    const big = Buffer.concat([makeJpeg(), Buffer.alloc(streetPack.thresholds.maxImageBytes)]);
    const r = await rig.call(
      "POST",
      "/api/reports",
      reportBody({ photo: { mimeType: "image/jpeg", base64: big.toString("base64") } }),
    );
    expect(r.status).toBe(413);
    expect(rig.streetStore.reports.all()).toHaveLength(0);
  });
});

describe("street input validation", () => {
  it("strict schemas: extra keys are refused in bodies and queries", async () => {
    rig = await makeRig();
    const cases: [string, string, unknown][] = [
      ["POST", "/api/reports", reportBody({ status: "verified" })],
      ["POST", "/api/reports", reportBody({ location: { ...fix, capturedAt: "2020-01-01" } })],
      ["POST", "/api/reports", reportBody({ photo: { ...syntheticStreetPhoto(), path: "/etc" } })],
      ["POST", "/api/reports", reportBody({ category: "bache" })],
      ["POST", "/api/reports", reportBody({ note: "x".repeat(281) })],
      ["POST", "/api/reports", reportBody({ photo: { mimeType: "image/png", base64: "AAAA" } })],
      ["POST", "/api/missions/mis_01/claim", { workerId: "wrk_a", claimedBy: "wrk_b" }],
      ["POST", "/api/missions/mis_01/claim", { workerId: "admin" }],
      ["POST", "/api/missions/mis_01/claim", { workerId: "wrk_../../x" }],
      ["GET", "/api/reports?bbox=1,2,3", undefined],
      ["GET", "/api/reports?bbox=1,2,3,4&status=new", undefined],
      ["GET", "/api/missions?near=14.6", undefined],
      ["GET", "/api/missions?radiusKm=5000", undefined],
      ["GET", "/api/missions?near[]=1,2", undefined],
    ];
    for (const [method, path, body] of cases) {
      const r = await rig.call(method, path, body);
      expect(r.status, `${method} ${path} ${JSON.stringify(body)?.slice(0, 80)}`).toBe(400);
      expect(r.json.error.code).toBe("invalid_request");
    }
    const admin = await rig.admin("POST", "/api/admin/missions", {
      ...missionBody,
      status: "passed",
      claimedBy: "wrk_a",
    });
    expect(admin.status).toBe(400);
    expect(rig.streetStore.reports.all()).toHaveLength(0);
    expect(rig.streetStore.missions.all()).toHaveLength(0);
  });

  it("ids are matched against their regex before any lookup or path use", async () => {
    rig = await makeRig();
    const bad = ["x", "mis_", "mis_a-b", "rep_01", `mis_${"a".repeat(33)}`, "mis_01%00", ".."];
    for (const id of bad) {
      const c = await rig.call("POST", `/api/missions/${id}/claim`, { workerId: "wrk_a" });
      expect(c.status, id).toBe(404);
      const e = await rig.call("GET", `/api/evidence/${id}`);
      expect(e.status, id).toBe(404);
    }
  });

  it("photo ids cannot traverse paths or reach other files", async () => {
    rig = await makeRig();
    const made = await rig.call("POST", "/api/reports", reportBody());
    expect(made.status).toBe(201);
    const id = made.json.report.photoId as string;
    for (const p of [
      "..%2F..%2F..%2Fetc%2Fpasswd",
      `..%2F${id}`,
      `${id}.jpg`,
      `${id}%00`,
      `${id}%2F..%2F${id}`,
      "pho_..",
      "ledger.jsonl",
    ]) {
      const r = await fetch(`${rig.base}/api/photos/${p}`);
      expect(r.status, p).toBe(404);
      expect(r.headers.get("content-type")).toMatch(/json/);
    }
    expect((await fetch(`${rig.base}/api/photos/${id}`)).status).toBe(200);
  });

  it("upload pipeline: not a JPEG is 422; EXIF, comments and trailing data never reach disk", async () => {
    rig = await makeRig();
    const png = Buffer.from("89504e470d0a1a0a0000000d49484452", "hex").toString("base64");
    const notJpeg = await rig.call(
      "POST",
      "/api/reports",
      reportBody({ photo: { mimeType: "image/jpeg", base64: png } }),
    );
    expect(notJpeg.status).toBe(422);
    expect(notJpeg.json.error.code).toBe("image_not_decodable");
    const notB64 = await rig.call(
      "POST",
      "/api/reports",
      reportBody({ photo: { mimeType: "image/jpeg", base64: "<script>alert(1)</script>" } }),
    );
    expect(notB64.status).toBe(422);

    const dirty = makeJpeg({ exif: true, trailing: true, tag: "dirty" }).toString("base64");
    const ok = await rig.call(
      "POST",
      "/api/reports",
      reportBody({ photo: { mimeType: "image/jpeg", base64: dirty } }),
    );
    expect(ok.status).toBe(201);
    const dir = `${rig.imageDir}-street`;
    const files = readdirSync(dir);
    expect(files).toEqual([`${ok.json.report.photoId as string}.jpg`]);
    const stored = readFileSync(join(dir, files[0] ?? "")).toString("latin1");
    expect(stored).not.toMatch(/GPSLatitude|TRAILING-SECRET-DATA|comment/);
  });

  it("responses never carry internal claim bookkeeping, file paths or photo bytes", async () => {
    rig = await makeRig();
    const mission = (await rig.admin("POST", "/api/admin/missions", missionBody)).json;
    const claim = await rig.call("POST", `/api/missions/${mission.id}/claim`, {
      workerId: "wrk_a",
    });
    const sub = await rig.call("POST", `/api/missions/${mission.id}/submit`, {
      workerId: "wrk_a",
      photo: syntheticStreetPhoto(),
      location: fix,
    });
    const ev = await rig.call("GET", `/api/evidence/${sub.json.submission.id}`);
    const text = JSON.stringify([claim.json, sub.json, ev.json]);
    expect(text).not.toMatch(/generation|attempts|claimedAt|pendingSubmissionId|\.jpg|base64/);
    expect(text).not.toContain(rig.imageDir);
  });
});

describe("street worker identity (demo limitation: not authentication)", () => {
  it("a wrong worker is 403 and does not reach the verifier or spend the claim", async () => {
    rig = await makeRig();
    const mission = (await rig.admin("POST", "/api/admin/missions", missionBody)).json;
    await rig.call("POST", `/api/missions/${mission.id}/claim`, { workerId: "wrk_owner" });
    const calls = rig.streetVerify.calls;
    const other = await rig.call("POST", `/api/missions/${mission.id}/submit`, {
      workerId: "wrk_other",
      photo: syntheticStreetPhoto(),
      location: fix,
    });
    expect(other.status).toBe(403);
    expect(other.json.error.code).toBe("forbidden");
    expect(rig.streetVerify.calls).toBe(calls);
    expect(rig.streetStore.payouts.all()).toHaveLength(0);
    // a second claim cannot steal it either
    const steal = await rig.call("POST", `/api/missions/${mission.id}/claim`, {
      workerId: "wrk_other",
    });
    expect(steal.status).toBe(409);
    const own = await rig.call("POST", `/api/missions/${mission.id}/submit`, {
      workerId: "wrk_owner",
      photo: syntheticStreetPhoto(),
      location: fix,
    });
    expect(own.json.mission.status).toBe("passed");
    expect(rig.streetStore.payouts.all().map((p) => p.workerId)).toEqual(["wrk_owner"]);
  });

  it("replaying a passed submit never pays twice", async () => {
    rig = await makeRig();
    const mission = (await rig.admin("POST", "/api/admin/missions", missionBody)).json;
    await rig.call("POST", `/api/missions/${mission.id}/claim`, { workerId: "wrk_a" });
    const body = { workerId: "wrk_a", photo: syntheticStreetPhoto(), location: fix };
    const results = await Promise.all(
      [1, 2, 3, 4].map(() => rig.call("POST", `/api/missions/${mission.id}/submit`, body)),
    );
    expect(results.map((r) => r.status).sort()).toEqual([200, 409, 409, 409]);
    expect((await rig.call("POST", `/api/missions/${mission.id}/submit`, body)).status).toBe(409);
    expect(rig.streetStore.payouts.all()).toHaveLength(1);
  });
});

describe("street rate limits and fake-payment guard", () => {
  it("reports are rate limited per IP with Retry-After", async () => {
    rig = await makeRig({
      app: { limits: { worker: null, claim: null, submit: null, report: 2 } },
    });
    expect((await rig.call("POST", "/api/reports", reportBody())).status).toBe(201);
    expect((await rig.call("POST", "/api/reports", reportBody())).status).toBe(201);
    const third = await rig.call("POST", "/api/reports", reportBody());
    expect(third.status).toBe(429);
    expect(third.headers.get("retry-after")).toBeTruthy();
  });

  it("the service refuses to exist without FAKE_PAYMENTS: there is no real payout path", async () => {
    rig = await makeRig();
    expect(
      () =>
        new StreetService({
          store: new StreetStore(),
          verifier: rig.streetVerify,
          pack: streetPack,
          clock: rig.clock,
          ids: rig.ids,
          logger: { debug() {}, info() {}, warn() {}, error() {}, child: () => null as never },
          imageDir: join(rig.imageDir, "nope"),
          fakePayments: false,
        }),
    ).toThrow(/FAKE_PAYMENTS/);
    const sum = await rig.call("GET", "/api/dashboard/summary");
    expect(sum.json.payouts.simulated).toBe(true);
  });
});

describe("street-only app (no legacy engine)", () => {
  it("mounts no legacy route; admin still needs the token; health names the mode", async () => {
    rig = await makeRig();
    const app = createApp({
      street: rig.street,
      env: rig.env,
      logger: { debug() {}, info() {}, warn() {}, error() {}, child: () => null as never },
      clock: rig.clock,
      limits: { worker: null, claim: null, submit: null, report: null },
    });
    const server = app.listen(0, "127.0.0.1");
    await new Promise((resolve) => server.once("listening", resolve));
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    try {
      for (const p of ["/api/jobs", "/api/tasks", "/api/ledger", "/api/payouts", "/api/catalog"]) {
        expect((await fetch(`${base}${p}`)).status, p).toBe(404);
      }
      const reset = await fetch(`${base}/api/admin/reset`, {
        method: "POST",
        headers: { "x-admin-token": ADMIN },
      });
      expect(reset.status).toBe(404);
      const noToken = await fetch(`${base}/api/admin/missions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(missionBody),
      });
      expect(noToken.status).toBe(401);
      const health = (await (await fetch(`${base}/api/health`)).json()) as Record<string, unknown>;
      expect(health).toMatchObject({
        ok: true,
        mode: "street",
        fakes: { payments: true, verifier: true },
      });
      expect((await fetch(`${base}/api/dashboard/summary`)).status).toBe(200);
    } finally {
      server.closeAllConnections();
      server.close();
    }
  });
});

describe("HTTP verifier client: the response is untrusted", () => {
  const req = {
    pack: "street-check" as const,
    submissionId: "sub_01",
    kind: "report" as const,
    category: "pothole" as const,
    photo: syntheticStreetPhoto(),
    location: { ...GT, accuracyM: 5, capturedAt: "2026-11-12T10:00:00.000Z" },
    target: { ...GT, radiusM: 30 },
  };
  const verdict = {
    passed: true,
    confidence: 0.9,
    gates: [{ name: "image_ok", passed: true, detail: "ok" }],
  };
  const client = (reply: () => Response | Promise<Response>, seen: Request[] = []) =>
    new HttpStreetVerifier({
      baseUrl: "http://127.0.0.1:1",
      engineToken: "engine-token-value",
      fetchImpl: (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
        seen.push(new Request(input, init));
        return Promise.resolve(reply());
      },
    });

  it("sends the engine token and accepts only a strict verdict", async () => {
    rig = await makeRig();
    const seen: Request[] = [];
    const out = await client(() => Response.json(verdict), seen).evaluate(req);
    expect(out.passed).toBe(true);
    expect(seen[0]?.url).toBe("http://127.0.0.1:1/evaluate");
    expect(seen[0]?.headers.get("x-engine-token")).toBe("engine-token-value");
    const bad: (() => Response | Promise<Response>)[] = [
      () => Response.json({ ...verdict, payout: { amountMinor: 999_999 } }),
      () =>
        Response.json({ ...verdict, gates: [{ name: "always_pass", passed: true, detail: "" }] }),
      () => Response.json({ ...verdict, confidence: 7 }),
      () => Response.json({ passed: "true" }),
      () => new Response("<html>", { status: 200 }),
      () => Response.json(verdict, { status: 500 }),
      () => Promise.reject(new Error("ECONNREFUSED 10.0.0.1 secret-host")),
    ];
    for (const reply of bad) {
      await expect(client(reply).evaluate(req)).rejects.toMatchObject({
        code: "dependency_unavailable",
        message: "The verifier is not available.",
      });
    }
  });
});
