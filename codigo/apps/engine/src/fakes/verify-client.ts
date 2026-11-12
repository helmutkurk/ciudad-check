import { gatesFor } from "@shelfie/core";
import type {
  GateName,
  GateResult,
  VerifyClient,
  VerifyRequest,
  VerifyResponse,
} from "@shelfie/core";

/**
 * In-process stand-in for the paid verifier (`VERIFIER_PAYMENT=off`, `FAKE_PAYMENTS=1`).
 * Decides from a marker inside the image bytes so scripts can drive outcomes without a model:
 *   STUB_VERDICT=FAIL_CODE        -> code_match fails (both gate sets)
 *   STUB_VERDICT=FAIL_PRICE       -> price_sanity fails (price photo)
 *   STUB_VERDICT=PRODUCT_PRESENT  -> slot_empty fails (out-of-stock photo)
 * No marker -> PASS, so a real phone photo passes on fakes. Same key twice -> cached verdict, no
 * second "payment". Hashes are visibly fake (`fake-verify-tx-N`).
 */
export type StubMarker = "FAIL_CODE" | "FAIL_PRICE" | "PRODUCT_PRESENT";

export class FakeVerifyClient implements VerifyClient {
  readonly calls: { req: VerifyRequest; key: string }[] = [];
  private readonly cache = new Map<string, { verdict: VerifyResponse; txHash: string }>();
  private transportFailures = 0;
  private nextOverride: Partial<
    Pick<VerifyResponse, "pass" | "failedGates" | "workerMessage">
  > | null = null;
  private counter = 0;

  /** Make the next `n` calls throw (simulates timeouts/transport errors). */
  failNext(n: number): void {
    this.transportFailures = n;
  }

  /** Force the verdict of the next (uncached) call. */
  scriptNext(v: Partial<Pick<VerifyResponse, "pass" | "failedGates" | "workerMessage">>): void {
    this.nextOverride = v;
  }

  verify(
    req: VerifyRequest,
    key: string,
  ): Promise<{ verdict: VerifyResponse; txHash: string; receipt: unknown }> {
    this.calls.push({ req, key });
    if (this.transportFailures > 0) {
      this.transportFailures--;
      return Promise.reject(new Error("fake verifier: simulated transport error"));
    }
    const hit = this.cache.get(key);
    if (hit) {
      return Promise.resolve({
        verdict: { ...hit.verdict, cached: true },
        txHash: hit.txHash,
        receipt: { fake: true, cached: true },
      });
    }
    const verdict = this.decide(req);
    const txHash = `fake-verify-tx-${++this.counter}`;
    this.cache.set(key, { verdict, txHash });
    return Promise.resolve({ verdict, txHash, receipt: { fake: true } });
  }

  private decide(req: VerifyRequest): VerifyResponse {
    const outcome = req.task.outcome;
    const bytes = Buffer.from(req.image.base64, "base64").toString("latin1");
    let failed: GateName[] = [];
    let message = "";
    if (this.nextOverride) {
      const o = this.nextOverride;
      this.nextOverride = null;
      failed = o.pass === false ? (o.failedGates ?? ["code_match"]) : [];
      message = o.workerMessage ?? "";
    } else if (bytes.includes("STUB_VERDICT=FAIL_CODE")) {
      failed = ["code_match"];
    } else if (bytes.includes("STUB_VERDICT=FAIL_SCREEN")) {
      failed = ["not_screen"];
    } else if (bytes.includes("STUB_VERDICT=FAIL_PRICE") && outcome === "OBSERVED") {
      failed = ["price_sanity"];
    } else if (bytes.includes("STUB_VERDICT=PRODUCT_PRESENT") && outcome === "OUT_OF_STOCK") {
      failed = ["slot_empty"];
    }
    const gates: GateResult[] = gatesFor(outcome).map((name) =>
      failed.includes(name)
        ? { name, pass: false, reasonCode: reasonFor(name) }
        : { name, pass: true },
    );
    const pass = failed.length === 0;
    return {
      submissionId: req.submissionId,
      outcome,
      pass,
      gates,
      failedGates: failed,
      extraction:
        outcome === "OBSERVED"
          ? {
              price: { text: "2.49", value: 2.49, currency: "EUR", confidence: 0.9 },
              product: { text: req.task.product.name, confidence: 0.9 },
            }
          : {
              label: { visible: true, productText: req.task.product.name, confidence: 0.9 },
              facing: { empty: true, confidence: 0.9 },
            },
      workerMessage: pass
        ? "Verified."
        : message || `We could not verify your photo (${failed.join(", ")}). Please try again.`,
      model: { provider: "fake", id: "fake-verifier", latencyMs: 1 },
      cached: false,
    };
  }
}

function reasonFor(name: GateName): GateResult["reasonCode"] {
  switch (name) {
    case "code_match":
      return "code_mismatch";
    case "not_screen":
      return "screen_recapture";
    case "price_sanity":
      return "price_out_of_range";
    case "slot_empty":
      return "product_present";
    default:
      return undefined;
  }
}
