import { STREET_PACK_ID, StreetPackConfigSchema, type StreetPackConfig } from "@shelfie/core";

/**
 * Street-check pack. Every threshold the verifier and engine use lives here, never inline in gates.
 * Worker instructions are Spanish (shown to workers); feat/street-core refines the wording.
 */
export const streetPack: StreetPackConfig = StreetPackConfigSchema.parse({
  id: STREET_PACK_ID,
  version: "0.1.0",
  worker: {
    capture: "photo",
    maxAttempts: 3,
    claimTtlSec: 900,
    instructions: {
      ramp: ["Toma la rampa completa, desde la banqueta, con el inicio y el final visibles."],
      sidewalk: ["Toma el tramo dañado de la banqueta con algo de contexto de la calle."],
      pothole: ["Toma el bache desde la orilla, con un objeto de referencia al lado si puedes."],
      graffiti: ["Toma la pared o el mobiliario completo, sin personas en la foto."],
      drain_cover: ["Toma la alcantarilla desde una distancia segura, nunca te acerques al borde."],
      street_light: ["Toma el poste completo con la luminaria visible."],
    },
  },
  extraction: {
    promptRef: "prompts.ts#buildStreetPrompt",
    outputSchemaRef: "core/street.ts#StreetExtractionSchema",
    imageRequired: true,
  },
  rules: [
    { name: "image_ok", params: { minShortSidePx: 600, maxBytes: 2_000_000, minVariance: 25 } },
    { name: "location_in_radius", params: { accuracyCapM: 50 } },
    { name: "fix_fresh", params: { maxFixAgeMs: 120_000 } },
    { name: "duplicate_photo", params: { maxHamming: 4 } },
    { name: "live_capture", params: {} },
    { name: "category_match", params: { minConfidence: 0.6 } },
    { name: "reference_object", params: { kinds: ["measure"] } },
    { name: "repaired", params: { kinds: ["repair_check"] } },
    { name: "before_after_same_place", params: { minConfidence: 0.6, kinds: ["repair_check"] } },
  ],
  location: {
    defaultRadiusM: 30,
    accuracyCapM: 50,
    maxAccuracyM: 100,
    maxFixAgeMs: 120_000,
    clusterRadiusM: 15,
  },
  thresholds: {
    minCategoryConfidence: 0.6,
    minSamePlaceConfidence: 0.6,
    duplicateHammingMax: 4,
    minVariance: 25,
    maxImageBytes: 2_000_000,
    minShortSidePx: 600,
  },
  payout: {
    defaultMinor: { GTQ: 1250, COP: 600_000 },
    maxMinor: { GTQ: 50_000, COP: 20_000_000 },
  },
  report: { templateRef: "report.ts#renderStreetReport" },
  ui: { title: "CiudadCheck", payoutLabel: "Pago (simulado)" },
});
