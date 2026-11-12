import { AppError, StreetVerdictSchema } from "@shelfie/core";
import type {
  Clock,
  StreetEvaluateRequest,
  StreetGateName,
  StreetGateResult,
  StreetPackConfig,
  StreetVerdict,
} from "@shelfie/core";
import { distanceM } from "./cluster.js";

/** Engine-side port to the verifier. The engine never imports the verifier package (sharp, x402). */
export interface StreetVerifier {
  /** True for the in-engine fake: shown in the evidence pack and on the dashboard. */
  readonly fake: boolean;
  evaluate(req: StreetEvaluateRequest): Promise<StreetVerdict>;
}

/** Markers a synthetic photo can carry in its bytes to force a failing gate in the fake. */
const MARKERS: Record<string, StreetGateName> = {
  "STUB_VERDICT=FAIL_CATEGORY": "category_match",
  "STUB_VERDICT=FAIL_REPAIRED": "repaired",
  "STUB_VERDICT=FAIL_DUPLICATE": "duplicate_photo",
  "STUB_VERDICT=FAIL_REFERENCE": "reference_object",
};

const FAIL_DETAIL: Partial<Record<StreetGateName, string>> = {
  category_match: "La foto no muestra la categoría esperada.",
  repaired: "El problema todavía se ve; no está reparado.",
  duplicate_photo: "Esta foto ya se usó en otro envío.",
  reference_object: "No se ve un objeto de referencia junto al problema.",
};

const PASS_DETAIL: Record<StreetGateName, string> = {
  image_ok: "La imagen es válida.",
  location_in_radius: "",
  fix_fresh: "",
  duplicate_photo: "La foto no se había usado antes.",
  live_capture: "La foto parece tomada en el lugar.",
  category_match: "La foto corresponde a la categoría.",
  reference_object: "Se ve un objeto de referencia.",
  repaired: "El problema ya no se ve: reparación confirmada.",
  before_after_same_place: 'La foto coincide con el lugar de la foto de "antes".',
};

/**
 * In-process fake (default with FAKE_PAYMENTS=1). `location_in_radius` and `fix_fresh` are computed
 * for real from the pack thresholds; the vision gates pass unless the photo carries a marker.
 * Never evidence of a real verification.
 */
export class FakeStreetVerifier implements StreetVerifier {
  readonly fake = true;
  calls = 0;
  constructor(
    private readonly pack: StreetPackConfig,
    private readonly clock: Clock,
  ) {}

  evaluate(req: StreetEvaluateRequest): Promise<StreetVerdict> {
    this.calls += 1;
    const loc = this.pack.location;
    const forced = new Set<StreetGateName>();
    const bytes = Buffer.from(req.photo.base64, "base64").toString("latin1");
    for (const [marker, gate] of Object.entries(MARKERS)) {
      if (bytes.includes(marker)) forced.add(gate);
    }

    const d = Math.round(distanceM(req.location, req.target));
    const allowed = Math.round(
      req.target.radiusM + Math.min(req.location.accuracyM, loc.accuracyCapM),
    );
    const accurate = req.location.accuracyM <= loc.maxAccuracyM;
    const ageMs = this.clock.nowMs() - Date.parse(req.location.capturedAt);
    const fresh = ageMs <= loc.maxFixAgeMs;

    const names: StreetGateName[] = [
      "image_ok",
      "location_in_radius",
      "fix_fresh",
      "duplicate_photo",
      "live_capture",
      "category_match",
    ];
    if (req.kind === "measure") names.push("reference_object");
    if (req.kind === "repair_check") names.push("repaired", "before_after_same_place");

    const gates: StreetGateResult[] = names.map((name) => {
      if (name === "location_in_radius") {
        if (!accurate) {
          return {
            name,
            passed: false,
            detail: `La ubicación es poco precisa (±${Math.round(req.location.accuracyM)} m). Sal a cielo abierto e intenta de nuevo.`,
          };
        }
        return d <= allowed
          ? { name, passed: true, detail: `Estás a ${d} m del punto (máximo ${allowed} m).` }
          : {
              name,
              passed: false,
              detail: `Estás a ${d} m del punto; el máximo permitido es ${allowed} m.`,
            };
      }
      if (name === "fix_fresh") {
        return fresh
          ? { name, passed: true, detail: "La ubicación es reciente." }
          : {
              name,
              passed: false,
              detail: "La ubicación es antigua. Actualiza el GPS e intenta de nuevo.",
            };
      }
      if (forced.has(name)) {
        return { name, passed: false, detail: FAIL_DETAIL[name] ?? "No pasó la verificación." };
      }
      return { name, passed: true, detail: PASS_DETAIL[name] };
    });
    const passed = gates.every((g) => g.passed);
    const categoryOk = !forced.has("category_match");
    return Promise.resolve({
      passed,
      ...(categoryOk ? { category: req.category } : {}),
      confidence: categoryOk ? 0.9 : 0.2,
      gates,
      blurBoxes: [],
    });
  }
}

export interface HttpStreetVerifierOptions {
  baseUrl: string;
  /** Sent as `x-engine-token` when set. */
  engineToken?: string | undefined;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

/** HTTP client for the real verifier's `POST /evaluate`. Any failure is `dependency_unavailable`. */
export class HttpStreetVerifier implements StreetVerifier {
  readonly fake = false;
  constructor(private readonly opts: HttpStreetVerifierOptions) {}

  async evaluate(req: StreetEvaluateRequest): Promise<StreetVerdict> {
    const down = (): AppError =>
      new AppError("dependency_unavailable", "The verifier is not available.");
    let body: unknown;
    try {
      const res = await (this.opts.fetchImpl ?? fetch)(new URL("/evaluate", this.opts.baseUrl), {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(this.opts.engineToken ? { "x-engine-token": this.opts.engineToken } : {}),
        },
        body: JSON.stringify(req),
        signal: AbortSignal.timeout(this.opts.timeoutMs ?? 20_000),
      });
      if (!res.ok) throw down();
      body = await res.json();
    } catch {
      throw down();
    }
    // The response is untrusted input: strict schema, nothing else is read from it.
    const parsed = StreetVerdictSchema.safeParse(body);
    if (!parsed.success) throw down();
    return parsed.data;
  }
}
