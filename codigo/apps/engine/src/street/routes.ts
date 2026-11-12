import express from "express";
import type { Request, RequestHandler, Response, Router } from "express";
import type { StreetService } from "./service.js";

type Handler = (req: Request, res: Response) => unknown;
const h =
  (fn: Handler): RequestHandler =>
  (req, res, next) => {
    Promise.resolve()
      .then(() => fn(req, res))
      .catch(next);
  };
const param = (req: Request, name: string): string => {
  const v = req.params[name];
  return typeof v === "string" ? v : "";
};

export interface StreetRouteLimits {
  /** Reads (lists, evidence, summary, photos). */
  read: RequestHandler;
  report: RequestHandler;
  claim: RequestHandler;
  submit: RequestHandler;
}

/** The two street routes that carry a photo and therefore need the big JSON parser. */
export function isStreetPhotoUpload(req: Request): boolean {
  return (
    req.method === "POST" &&
    (req.path === "/api/reports" || /^\/api\/missions\/[^/]+\/submit$/.test(req.path))
  );
}

/** JSON body limit for the photo routes: one max-size image as base64 plus the small fields. */
export function streetPhotoBodyLimit(maxImageBytes: number): number {
  return Math.ceil((maxImageBytes * 4) / 3) + 4096;
}

/**
 * Public street routes, mounted at `/api`. Bodies, queries and ids are validated by the service
 * with the strict contract schemas; this layer only wires limits and status codes.
 */
export function streetRouter(service: StreetService, limits: StreetRouteLimits): Router {
  const r = express.Router();
  const bigJson = express.json({
    limit: streetPhotoBodyLimit(service.maxImageBytes),
    strict: true,
  });

  r.post(
    "/reports",
    limits.report,
    bigJson,
    h(async (req, res) => res.status(201).json(await service.createReport(req.body))),
  );
  r.get(
    "/reports",
    limits.read,
    h((req, res) => res.json(service.listReports(req.query))),
  );
  r.get(
    "/missions",
    limits.read,
    h((req, res) => res.json(service.listMissions(req.query))),
  );
  r.post(
    "/missions/:id/claim",
    limits.claim,
    h((req, res) => res.json(service.claim(param(req, "id"), req.body))),
  );
  r.post(
    "/missions/:id/submit",
    limits.submit,
    bigJson,
    h(async (req, res) => res.json(await service.submit(param(req, "id"), req.body))),
  );
  r.get(
    "/evidence/:submissionId",
    limits.read,
    h((req, res) => res.json(service.evidence(param(req, "submissionId")))),
  );
  r.get(
    "/dashboard/summary",
    limits.read,
    h((_req, res) => res.json(service.summary())),
  );
  // A2. Demo only: photos are synthetic. Real photos need the blur step first (TODO: apply the
  // verifier's blurBoxes before a photo is ever served).
  r.get(
    "/photos/:photoId",
    limits.read,
    h((req, res) => {
      const bytes = service.photo(param(req, "photoId"));
      res.setHeader("Content-Type", "image/jpeg");
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.send(bytes);
    }),
  );
  return r;
}

/** Admin street routes, registered on the one admin router (auth is applied there once). */
export function streetAdminRoutes(admin: Router, service: StreetService): void {
  admin.post(
    "/missions",
    h((req, res) => res.status(201).json(service.createMission(req.body))),
  );
}
