/**
 * CiudadCheck street contract (diseno/street-contract.md): categories, reports, missions,
 * submissions, verdicts, HTTP bodies, evidence pack, dashboard summary and the street pack config.
 * Every name carries a `Street` prefix so it never collides with the Shelfie schemas.
 */
import { z } from "zod";
import { IsoTimestampSchema, Sha256Schema } from "./common.js";
import { RuleConfigSchema } from "./pack.js";

export const STREET_PACK_ID = "street-check";

// ---- Categories and labels
export const STREET_CATEGORIES = [
  "ramp",
  "sidewalk",
  "pothole",
  "graffiti",
  "drain_cover",
  "street_light",
] as const;
export const StreetCategorySchema = z.enum(STREET_CATEGORIES);
export type StreetCategory = z.infer<typeof StreetCategorySchema>;

/** Guatemalan Spanish (default UI labels, as in the contract). */
export const STREET_CATEGORY_LABELS_ES: Record<StreetCategory, string> = {
  ramp: "Rampa",
  sidewalk: "Banqueta / acera",
  pothole: "Bache",
  graffiti: "Graffiti",
  drain_cover: "Alcantarilla sin tapa",
  street_light: "Luminaria apagada",
};
export const STREET_CATEGORY_LABELS_GT = STREET_CATEGORY_LABELS_ES;
/** Colombian Spanish (A4): "andén" instead of "banqueta". */
export const STREET_CATEGORY_LABELS_CO: Record<StreetCategory, string> = {
  ...STREET_CATEGORY_LABELS_ES,
  sidewalk: "Andén",
};

// ---- Countries and money (A4)
export const STREET_COUNTRIES = ["GT", "CO"] as const;
export const StreetCountrySchema = z.enum(STREET_COUNTRIES);
export type StreetCountry = z.infer<typeof StreetCountrySchema>;

export const STREET_CURRENCIES = ["GTQ", "COP"] as const;
export const StreetCurrencySchema = z.enum(STREET_CURRENCIES);
export type StreetCurrency = z.infer<typeof StreetCurrencySchema>;
export const STREET_COUNTRY_CURRENCY: Record<StreetCountry, StreetCurrency> = {
  GT: "GTQ",
  CO: "COP",
};

export function streetCategoryLabels(country: StreetCountry): Record<StreetCategory, string> {
  return country === "CO" ? STREET_CATEGORY_LABELS_CO : STREET_CATEGORY_LABELS_GT;
}

/** Rough bounding boxes (mainland plus islands). Points outside both return null. */
export function streetCountryForPoint(lat: number, lng: number): StreetCountry | null {
  if (lat >= 13.6 && lat <= 17.9 && lng >= -92.3 && lng <= -88.2) return "GT";
  if (lat >= -4.3 && lat <= 13.5 && lng >= -82 && lng <= -66.8) return "CO";
  return null;
}

// ---- Ids
const id = (p: string) => z.string().regex(new RegExp(`^${p}_[A-Za-z0-9]{1,32}$`));
export const StreetReportIdSchema = id("rep");
export const StreetMissionIdSchema = id("mis");
export const StreetSubmissionIdSchema = id("sub");
export const StreetPhotoIdSchema = id("pho");
export const StreetClusterIdSchema = id("clu");
export const StreetPayoutIdSchema = id("spy");
export const StreetWorkerIdSchema = id("wrk");

const Lat = z.number().min(-90).max(90);
const Lng = z.number().min(-180).max(180);
const AccuracyM = z.number().nonnegative().max(10_000);

/** Integer minor units (centavos). GTQ is the contract default; COP is A4. */
export const StreetMoneySchema = z.strictObject({
  amountMinor: z.number().int().positive().max(1_000_000_000),
  currency: StreetCurrencySchema,
});
export type StreetMoney = z.infer<typeof StreetMoneySchema>;
export const MoneyGtqSchema = z.strictObject({
  amountMinor: z.number().int().positive().max(10_000_000),
  currency: z.literal("GTQ"),
});
export type MoneyGtq = z.infer<typeof MoneyGtqSchema>;

function groupThousands(n: number, sep: string): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, sep);
}

/** GTQ 1250 -> "Q 12.50"; COP 500000 -> "$ 5.000" (es-CO, whole pesos). Integer math only. */
export function formatMoney(m: { amountMinor: number; currency: StreetCurrency }): string {
  const major = Math.trunc(m.amountMinor / 100);
  if (m.currency === "COP") return `$ ${groupThousands(major, ".")}`;
  return `Q ${groupThousands(major, ",")}.${String(m.amountMinor % 100).padStart(2, "0")}`;
}
/** Contract name kept as an alias. */
export function formatGtq(m: MoneyGtq): string {
  return formatMoney(m);
}

// ---- Enums
export const StreetReportStatusSchema = z.enum(["new", "verified", "rejected", "repaired"]);
export type StreetReportStatus = z.infer<typeof StreetReportStatusSchema>;
export const StreetMissionKindSchema = z.enum(["confirm", "measure", "repair_check"]);
export type StreetMissionKind = z.infer<typeof StreetMissionKindSchema>;
export const StreetMissionStatusSchema = z.enum([
  "open",
  "claimed",
  "submitted",
  "passed",
  "failed",
  "expired",
]);
export type StreetMissionStatus = z.infer<typeof StreetMissionStatusSchema>;
export const StreetEvaluateKindSchema = z.enum(["report", "confirm", "measure", "repair_check"]);
export type StreetEvaluateKind = z.infer<typeof StreetEvaluateKindSchema>;
export const StreetGateNameSchema = z.enum([
  "image_ok",
  "location_in_radius",
  "fix_fresh",
  "duplicate_photo",
  "live_capture",
  "category_match",
  "reference_object",
  "repaired",
  "before_after_same_place",
]);
export type StreetGateName = z.infer<typeof StreetGateNameSchema>;

// ---- Entities
export const StreetReportSchema = z.strictObject({
  id: StreetReportIdSchema,
  category: StreetCategorySchema,
  lat: Lat,
  lng: Lng,
  accuracyM: AccuracyM,
  capturedAt: IsoTimestampSchema,
  photoId: StreetPhotoIdSchema,
  note: z.string().max(280).optional(),
  status: StreetReportStatusSchema,
  clusterId: StreetClusterIdSchema,
  country: StreetCountrySchema.optional(),
});
export type StreetReport = z.infer<typeof StreetReportSchema>;

export const StreetMissionSchema = z.strictObject({
  id: StreetMissionIdSchema,
  kind: StreetMissionKindSchema,
  category: StreetCategorySchema,
  lat: Lat,
  lng: Lng,
  radiusM: z.number().int().min(5).max(500),
  beforeReportId: StreetReportIdSchema.optional(),
  payout: StreetMoneySchema,
  status: StreetMissionStatusSchema,
  claimedBy: StreetWorkerIdSchema.optional(),
  expiresAt: IsoTimestampSchema,
  country: StreetCountrySchema.optional(),
});
export type StreetMission = z.infer<typeof StreetMissionSchema>;

export const StreetGateResultSchema = z.strictObject({
  name: StreetGateNameSchema,
  passed: z.boolean(),
  detail: z.string().max(300),
});
export type StreetGateResult = z.infer<typeof StreetGateResultSchema>;

/** Normalised (0-1) box of a face or number plate to blur before storage. */
export const StreetBlurBoxSchema = z.strictObject({
  kind: z.enum(["face", "plate"]),
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  w: z.number().min(0).max(1),
  h: z.number().min(0).max(1),
});
export type StreetBlurBox = z.infer<typeof StreetBlurBoxSchema>;

export const StreetVerdictSchema = z.strictObject({
  passed: z.boolean(),
  category: StreetCategorySchema.optional(),
  confidence: z.number().min(0).max(1),
  gates: z.array(StreetGateResultSchema).max(12),
  blurBoxes: z.array(StreetBlurBoxSchema).max(50).optional(),
});
export type StreetVerdict = z.infer<typeof StreetVerdictSchema>;

export const StreetSubmissionSchema = z.strictObject({
  id: StreetSubmissionIdSchema,
  missionId: StreetMissionIdSchema.optional(),
  reportId: StreetReportIdSchema.optional(),
  photoId: StreetPhotoIdSchema,
  lat: Lat,
  lng: Lng,
  accuracyM: AccuracyM,
  capturedAt: IsoTimestampSchema,
  verdict: StreetVerdictSchema.optional(),
});
export type StreetSubmission = z.infer<typeof StreetSubmissionSchema>;

// ---- Verifier
export const StreetPhotoInputSchema = z.strictObject({
  mimeType: z.literal("image/jpeg"),
  base64: z.string().min(1).max(4_000_000),
});
export type StreetPhotoInput = z.infer<typeof StreetPhotoInputSchema>;

export const StreetEvaluateRequestSchema = z
  .strictObject({
    pack: z.literal(STREET_PACK_ID),
    submissionId: StreetSubmissionIdSchema,
    kind: StreetEvaluateKindSchema,
    category: StreetCategorySchema,
    photo: StreetPhotoInputSchema,
    beforePhoto: StreetPhotoInputSchema.optional(),
    location: z.strictObject({
      lat: Lat,
      lng: Lng,
      accuracyM: AccuracyM,
      capturedAt: IsoTimestampSchema,
    }),
    target: z.strictObject({ lat: Lat, lng: Lng, radiusM: z.number().positive().max(500) }),
  })
  .refine((v) => v.kind !== "repair_check" || v.beforePhoto !== undefined, "beforePhoto required");
export type StreetEvaluateRequest = z.infer<typeof StreetEvaluateRequestSchema>;

/** Untrusted model output; the verifier validates it before any gate reads it. */
export const StreetExtractionSchema = z.strictObject({
  category: StreetCategorySchema.or(z.literal("none")),
  categoryConfidence: z.number().min(0).max(1),
  issueVisible: z.boolean(),
  repaired: z.boolean().nullable(),
  referenceObject: z.strictObject({
    present: z.boolean(),
    kind: z.string().max(60).nullable(),
    estimatedSizeCm: z.number().min(0).max(2000).nullable(),
  }),
  samePlaceAsBefore: z.boolean().nullable(),
  samePlaceConfidence: z.number().min(0).max(1).nullable(),
  looksLikeScreenPhoto: z.boolean(),
  peopleVisible: z.boolean(),
  blurBoxes: z.array(StreetBlurBoxSchema).max(50),
  notes: z.string().max(300),
});
export type StreetExtraction = z.infer<typeof StreetExtractionSchema>;

// ---- HTTP bodies (A3: the client sends fixAgeMs; the engine stamps capturedAt)
export const StreetFixSchema = z.strictObject({
  lat: Lat,
  lng: Lng,
  accuracyM: AccuracyM,
  fixAgeMs: z.number().nonnegative().max(3_600_000),
});
export type StreetFix = z.infer<typeof StreetFixSchema>;

export const CreateStreetReportBodySchema = z.strictObject({
  category: StreetCategorySchema,
  photo: StreetPhotoInputSchema,
  location: StreetFixSchema,
  note: z.string().max(280).optional(),
});
export type CreateStreetReportBody = z.infer<typeof CreateStreetReportBodySchema>;

export const CreateStreetMissionBodySchema = z
  .strictObject({
    kind: StreetMissionKindSchema,
    category: StreetCategorySchema,
    lat: Lat,
    lng: Lng,
    radiusM: z.number().int().min(5).max(500),
    beforeReportId: StreetReportIdSchema.optional(),
    payout: StreetMoneySchema,
    expiresInSec: z.number().int().min(60).max(604_800).default(86_400),
  })
  .refine(
    (v) => v.kind !== "repair_check" || v.beforeReportId !== undefined,
    "beforeReportId required",
  );
export type CreateStreetMissionBody = z.infer<typeof CreateStreetMissionBodySchema>;

/** Demo limitation: workerId is chosen by the phone and is NOT authentication (street-contract.md). */
export const ClaimStreetMissionBodySchema = z.strictObject({ workerId: StreetWorkerIdSchema });
export type ClaimStreetMissionBody = z.infer<typeof ClaimStreetMissionBodySchema>;

export const SubmitStreetMissionBodySchema = z.strictObject({
  workerId: StreetWorkerIdSchema,
  photo: StreetPhotoInputSchema,
  location: StreetFixSchema,
});
export type SubmitStreetMissionBody = z.infer<typeof SubmitStreetMissionBodySchema>;

export const StreetReportsQuerySchema = z.strictObject({
  bbox: z
    .string()
    .regex(/^-?\d+(\.\d+)?(,-?\d+(\.\d+)?){3}$/)
    .optional(),
});
export type StreetReportsQuery = z.infer<typeof StreetReportsQuerySchema>;

export const StreetMissionsQuerySchema = z.strictObject({
  near: z
    .string()
    .regex(/^-?\d+(\.\d+)?,-?\d+(\.\d+)?$/)
    .optional(),
  radiusKm: z.coerce.number().positive().max(50).default(5),
});
export type StreetMissionsQuery = z.infer<typeof StreetMissionsQuerySchema>;

/** A1: the report response carries the verdict so the UI can show the Spanish reason. */
export const CreateStreetReportResponseSchema = z.strictObject({
  report: StreetReportSchema,
  submission: StreetSubmissionSchema,
  verdict: StreetVerdictSchema.nullable(),
});
export type CreateStreetReportResponse = z.infer<typeof CreateStreetReportResponseSchema>;

export const SubmitStreetMissionResponseSchema = z.strictObject({
  submission: StreetSubmissionSchema,
  verdict: StreetVerdictSchema,
  mission: StreetMissionSchema,
});
export type SubmitStreetMissionResponse = z.infer<typeof SubmitStreetMissionResponseSchema>;

// ---- Payouts, evidence, dashboard
export const StreetPayoutSchema = z.strictObject({
  id: StreetPayoutIdSchema,
  missionId: StreetMissionIdSchema,
  submissionId: StreetSubmissionIdSchema,
  workerId: StreetWorkerIdSchema,
  amountMinor: z.number().int().positive(),
  currency: StreetCurrencySchema,
  status: z.literal("simulated"),
  paidAt: IsoTimestampSchema,
});
export type StreetPayout = z.infer<typeof StreetPayoutSchema>;

export const StreetEvidencePackSchema = z.strictObject({
  submissionId: StreetSubmissionIdSchema,
  kind: StreetEvaluateKindSchema,
  category: StreetCategorySchema,
  photo: z.strictObject({ photoId: StreetPhotoIdSchema, sha256: Sha256Schema }),
  capturedAt: IsoTimestampSchema,
  place: z.strictObject({
    lat: Lat,
    lng: Lng,
    accuracyM: AccuracyM,
    distanceM: z.number().nonnegative().nullable(),
  }),
  passed: z.boolean().nullable(),
  confidence: z.number().min(0).max(1).nullable(),
  gates: z.array(StreetGateResultSchema),
  payout: StreetPayoutSchema.nullable(),
  fakes: z.strictObject({ payments: z.boolean(), verifier: z.boolean() }),
});
export type StreetEvidencePack = z.infer<typeof StreetEvidencePackSchema>;

export const StreetDashboardSummarySchema = z.strictObject({
  reports: z.strictObject({
    total: z.number().int(),
    byCategory: z.record(
      StreetCategorySchema,
      z.record(StreetReportStatusSchema, z.number().int()),
    ),
  }),
  missions: z.strictObject({
    total: z.number().int(),
    byStatus: z.record(StreetMissionStatusSchema, z.number().int()),
    byCategory: z.record(StreetCategorySchema, z.number().int()),
  }),
  payouts: z.strictObject({
    count: z.number().int(),
    /** Total per currency in minor units (A4). */
    totalMinor: z.record(StreetCurrencySchema, z.number().int()),
    simulated: z.boolean(),
  }),
});
export type StreetDashboardSummary = z.infer<typeof StreetDashboardSummarySchema>;

// ---- Street pack config (separate from the Shelfie PackConfigSchema)
export const StreetPackConfigSchema = z.strictObject({
  id: z.literal(STREET_PACK_ID),
  version: z.string(),
  worker: z.strictObject({
    capture: z.literal("photo"),
    maxAttempts: z.number().int().positive(),
    claimTtlSec: z.number().int().positive(),
    instructions: z.record(StreetCategorySchema, z.array(z.string())),
  }),
  extraction: z.strictObject({
    promptRef: z.string(),
    outputSchemaRef: z.string(),
    imageRequired: z.literal(true),
  }),
  rules: z.array(RuleConfigSchema),
  location: z.strictObject({
    defaultRadiusM: z.number().positive(),
    accuracyCapM: z.number().positive(),
    maxAccuracyM: z.number().positive(),
    maxFixAgeMs: z.number().positive(),
    clusterRadiusM: z.number().positive(),
  }),
  thresholds: z.strictObject({
    minCategoryConfidence: z.number(),
    minSamePlaceConfidence: z.number(),
    duplicateHammingMax: z.number().int(),
    minVariance: z.number(),
    maxImageBytes: z.number().int(),
    minShortSidePx: z.number().int(),
  }),
  payout: z.strictObject({
    /** Default and maximum payout per currency, minor units (A4). */
    defaultMinor: z.record(StreetCurrencySchema, z.number().int().positive()),
    maxMinor: z.record(StreetCurrencySchema, z.number().int().positive()),
  }),
  report: z.strictObject({ templateRef: z.string() }),
  ui: z.record(z.string(), z.string()),
});
export type StreetPackConfig = z.infer<typeof StreetPackConfigSchema>;
