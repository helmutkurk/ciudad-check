/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment -- tests read untyped JSON responses */
import { createHash } from "node:crypto";
import {
  CreateStreetReportResponseSchema,
  StreetDashboardSummarySchema,
  StreetEvidencePackSchema,
  StreetMissionSchema,
  StreetReportSchema,
  SubmitStreetMissionResponseSchema,
} from "@shelfie/core";
import { afterEach, describe, expect, it } from "vitest";
import { makeRig } from "../testkit.js";
import type { Rig } from "../testkit.js";
import { syntheticStreetPhoto } from "./synthetic.js";

let rig: Rig;
afterEach(async () => {
  await rig.close();
});

const GT = { lat: 14.6349, lng: -90.5069 };
const fix = { ...GT, accuracyM: 10, fixAgeMs: 500 };
const W = "wrk_http1";

describe("street HTTP flow (contract shapes)", () => {
  it("report -> admin mission -> claim -> submit pass -> evidence -> summary -> photo", async () => {
    rig = await makeRig();
    const rep = await rig.call("POST", "/api/reports", {
      category: "pothole",
      photo: syntheticStreetPhoto(),
      location: fix,
      note: "Frente a la tienda",
    });
    expect(rep.status).toBe(201);
    const created = CreateStreetReportResponseSchema.parse(rep.json);
    expect(created.report).toMatchObject({ status: "verified", note: "Frente a la tienda" });

    const list = await rig.call("GET", "/api/reports?bbox=-90.6,14.5,-90.4,14.7");
    expect(list.status).toBe(200);
    expect(StreetReportSchema.array().parse(list.json)).toHaveLength(1);
    expect((await rig.call("GET", "/api/reports?bbox=-74.2,4.5,-74.0,4.8")).json).toEqual([]);

    const mis = await rig.admin("POST", "/api/admin/missions", {
      kind: "repair_check",
      category: "pothole",
      ...GT,
      radiusM: 30,
      beforeReportId: created.report.id,
      payout: { amountMinor: 2500, currency: "GTQ" },
    });
    expect(mis.status).toBe(201);
    const mission = StreetMissionSchema.parse(mis.json);
    expect(mission.status).toBe("open");

    const near = await rig.call("GET", `/api/missions?near=${GT.lat},${GT.lng}&radiusKm=1`);
    expect(
      StreetMissionSchema.array()
        .parse(near.json)
        .map((m) => m.id),
    ).toEqual([mission.id]);

    const claim = await rig.call("POST", `/api/missions/${mission.id}/claim`, { workerId: W });
    expect(claim.status).toBe(200);
    expect(StreetMissionSchema.parse(claim.json)).toMatchObject({
      status: "claimed",
      claimedBy: W,
    });

    const sub = await rig.call("POST", `/api/missions/${mission.id}/submit`, {
      workerId: W,
      photo: syntheticStreetPhoto(),
      location: fix,
    });
    expect(sub.status).toBe(200);
    const done = SubmitStreetMissionResponseSchema.parse(sub.json);
    expect(done.verdict.passed).toBe(true);
    expect(done.mission.status).toBe("passed");

    const ev = await rig.call("GET", `/api/evidence/${done.submission.id}`);
    expect(ev.status).toBe(200);
    const pack = StreetEvidencePackSchema.parse(ev.json);
    expect(pack.payout).toMatchObject({ status: "simulated", amountMinor: 2500, currency: "GTQ" });
    expect(pack.fakes).toEqual({ payments: true, verifier: true });

    const sum = await rig.call("GET", "/api/dashboard/summary");
    const summary = StreetDashboardSummarySchema.parse(sum.json);
    expect(summary.reports.byCategory.pothole?.repaired).toBe(1);
    expect(summary.missions.byStatus.passed).toBe(1);
    expect(summary.payouts).toEqual({
      count: 1,
      totalMinor: { GTQ: 2500, COP: 0 },
      simulated: true,
    });

    const photo = await fetch(`${rig.base}/api/photos/${pack.photo.photoId}`);
    expect(photo.status).toBe(200);
    expect(photo.headers.get("content-type")).toBe("image/jpeg");
    expect(photo.headers.get("x-content-type-options")).toBe("nosniff");
    const bytes = Buffer.from(await photo.arrayBuffer());
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(pack.photo.sha256);
  });

  it("a failed location gate returns 200 with the Spanish reason and no payout", async () => {
    rig = await makeRig();
    const mission = (
      await rig.admin("POST", "/api/admin/missions", {
        kind: "confirm",
        category: "graffiti",
        ...GT,
        radiusM: 20,
        payout: { amountMinor: 1250, currency: "GTQ" },
      })
    ).json;
    await rig.call("POST", `/api/missions/${mission.id}/claim`, { workerId: W });
    const sub = await rig.call("POST", `/api/missions/${mission.id}/submit`, {
      workerId: W,
      photo: syntheticStreetPhoto(),
      location: { ...fix, lat: GT.lat + 0.01 },
    });
    expect(sub.status).toBe(200);
    expect(sub.json.verdict.passed).toBe(false);
    expect(sub.json.mission.status).toBe("open");
    const gates = sub.json.verdict.gates as { name: string; detail: string }[];
    const gate = gates.find((g) => g.name === "location_in_radius");
    expect(gate?.detail).toMatch(/máximo permitido/);
    const ev = await rig.call("GET", `/api/evidence/${sub.json.submission.id}`);
    expect(ev.json.payout).toBeNull();
    expect(ev.json.passed).toBe(false);
  });

  it("conflicts and unknown ids use the common error body", async () => {
    rig = await makeRig();
    const none = await rig.call("POST", "/api/missions/mis_nope/claim", { workerId: W });
    expect(none.status).toBe(404);
    expect(none.json.error.code).toBe("not_found");
    expect((await rig.call("GET", "/api/evidence/sub_nope")).status).toBe(404);
    expect((await rig.call("GET", "/api/photos/pho_nope")).status).toBe(404);
    const mission = (
      await rig.admin("POST", "/api/admin/missions", {
        kind: "confirm",
        category: "ramp",
        ...GT,
        radiusM: 20,
        payout: { amountMinor: 1250, currency: "GTQ" },
      })
    ).json;
    const early = await rig.call("POST", `/api/missions/${mission.id}/submit`, {
      workerId: W,
      photo: syntheticStreetPhoto(),
      location: fix,
    });
    expect(early.status).toBe(409);
    expect(early.json.error.code).toBe("task_not_open");
  });
});
