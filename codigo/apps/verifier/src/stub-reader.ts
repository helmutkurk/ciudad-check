import { AsyncLocalStorage } from "node:async_hooks";
import type { VerifyTask } from "@shelfie/core";
import { promptOutcome } from "@shelfie/domain-shelf";
import type { StubVisionOptions } from "@shelfie/vision";
import type { Evaluator } from "./evaluate.js";

// VERIFIER_MODE=stub: a deterministic "perfect reader" so the whole system runs without keys.
// It is NOT a model: it looks at the task's expected values, which the real model never sees,
// so a stub run is never evidence (the verdict reports provider "stub").
//
// Scenarios for smoke and cheat tests: append the ASCII marker `SHELFIE-STUB:<scenario>` after
// the end of a valid JPEG/PNG (decoders ignore trailing bytes). Scenarios: wrong_code, no_code,
// wrong_product, unreadable_price, absurd_price, product_present, no_label, other_label,
// slot_not_empty, screen. No marker = perfect read. In gesture mode wrong_code shows one finger
// too many and no_code shows no hand.

export type StubScenario =
  | "ok"
  | "wrong_code"
  | "no_code"
  | "wrong_product"
  | "unreadable_price"
  | "absurd_price"
  | "product_present"
  | "no_label"
  | "other_label"
  | "slot_not_empty"
  | "screen";

const MARKER = /SHELFIE-STUB:([a-z_]+)/;

export function scenarioFromBytes(bytes: Uint8Array): StubScenario {
  const tail = Buffer.from(bytes.subarray(Math.max(0, bytes.length - 256))).toString("latin1");
  const m = MARKER.exec(tail);
  const name = m?.[1];
  return (name as StubScenario | undefined) ?? "ok";
}

interface StubContext {
  task: VerifyTask;
  scenario: StubScenario;
}
const als = new AsyncLocalStorage<StubContext>();

function flipLast(code: string): string {
  const last = code.slice(-1);
  return code.slice(0, -1) + (last === "A" ? "B" : "A");
}

export function perfectExtraction(
  task: VerifyTask,
  outcome: VerifyTask["outcome"],
  scenario: StubScenario,
): unknown {
  const p = task.product;
  const mid =
    p.referencePriceEur ??
    (p.priceMinEur !== undefined && p.priceMaxEur !== undefined
      ? Math.round(((p.priceMinEur + p.priceMaxEur) / 2) * 100) / 100
      : 2.49);
  const value = scenario === "absurd_price" ? 249 : mid;
  const priceText = scenario === "unreadable_price" ? null : `${value.toFixed(2).replace(".", ",")} EUR`;
  const code = {
    text:
      scenario === "no_code" ? null : scenario === "wrong_code" ? flipLast(task.expectedCode) : task.expectedCode,
    confidence: scenario === "no_code" ? 0 : 0.95,
    location: "paper held next to the tag",
  };
  const g = task.expectedGesture;
  const gesture = g
    ? scenario === "no_code"
      ? { handVisible: false, fingers: null, side: null, confidence: 0 }
      : {
          handVisible: true,
          fingers: scenario === "wrong_code" ? (g.fingers === 5 ? 4 : g.fingers + 1) : g.fingers,
          side: g.side,
          confidence: 0.92,
        }
    : null;
  const advisory = {
    tamperSuspected: false,
    looksLikeScreenPhoto: scenario === "screen",
    exifTime: null,
  };
  const scene = { peopleVisible: false, glare: "low", blur: "none" };
  if (outcome === "OBSERVED") {
    return {
      code,
      gesture,
      price: {
        text: priceText,
        value: scenario === "unreadable_price" ? null : value,
        currency: "EUR",
        confidence: scenario === "unreadable_price" ? 0 : 0.9,
        unit: "per piece",
      },
      product: {
        text: scenario === "wrong_product" ? "Completely Different Item 1 kg" : p.name,
        confidence: 0.9,
      },
      barcode: null,
      scene: { isShelfOrPriceTag: true, ...scene },
      advisory,
      overallConfidence: 0.9,
      notes: "stub reader",
    };
  }
  return {
    code,
    gesture,
    advisory,
    label: {
      visible: scenario !== "no_label",
      text: scenario === "no_label" ? null : p.name,
      productText:
        scenario === "no_label" ? null : scenario === "other_label" ? "Another Product 500 g" : p.name,
      barcodeDigits: null,
      priceText: null,
      confidence: scenario === "no_label" ? 0 : 0.9,
    },
    facing: {
      empty: scenario === "product_present" || scenario === "slot_not_empty" ? false : true,
      productAboveLabel: scenario === "product_present" ? true : false,
      inFrame: true,
      confidence: 0.9,
      description: "stub reader",
    },
    scene,
    overallConfidence: 0.9,
    notes: "stub reader",
  };
}

export function stubVisionOptions(): StubVisionOptions {
  return {
    modelId: "perfect-reader",
    resolve: (req) => {
      const ctx = als.getStore();
      if (!ctx) return undefined;
      return perfectExtraction(ctx.task, promptOutcome(req.prompt), ctx.scenario);
    },
  };
}

/** Run `evaluate` with the task visible to the stub reader (stub mode only). */
export function withStubTask(gate: Evaluator): Evaluator {
  return {
    ...gate,
    evaluate: (task, image, ctx) => {
      const scenario = scenarioFromBytes(Buffer.from(image.base64, "base64"));
      return als.run({ task, scenario }, () => gate.evaluate(task, image, ctx));
    },
  };
}
