import type { ReasonCode, GateName } from "@shelfie/core";

// UI labels and worker messages (en/de). Shelf-specific strings live here only: the engine,
// payments and the UI frame never mention shelves (codigo/CLAUDE.md).

export type Lang = "en" | "de";

export const UI_LABELS: Record<Lang, Record<string, string>> = {
  en: {
    taskTitle: "Check {product} at {store}",
    claimButton: "Take this task",
    doneMessage: "Verified. Payment sent.",
    outOfStockButton: "Product not on the shelf",
    codeInstruction: "Write this code on paper and hold it next to the price tag.",
    codeInstructionOos: "Write this code on paper and hold it next to the shelf label.",
    gestureInstruction: "Hold up {fingers} fingers to the {side} of the price tag.",
    gestureInstructionOos: "Hold up {fingers} fingers to the {side} of the shelf label.",
    verdictPass: "Verified",
    verdictFail: "Not accepted",
    outcomeObserved: "Price observed",
    outcomeOutOfStock: "Not on the shelf",
    privacyNote: "Photograph shelves only. Keep people out of the frame.",
    fakeBanner: "FAKE PAYMENTS",
    overrideBadge: "DEMO OVERRIDE",
  },
  de: {
    taskTitle: "{product} bei {store} prüfen",
    claimButton: "Aufgabe übernehmen",
    doneMessage: "Geprüft. Zahlung gesendet.",
    outOfStockButton: "Produkt nicht im Regal",
    codeInstruction: "Schreibe diesen Code auf Papier und halte ihn neben das Preisschild.",
    codeInstructionOos: "Schreibe diesen Code auf Papier und halte ihn neben das Regaletikett.",
    gestureInstruction: "Zeige {fingers} Finger {side} neben dem Preisschild.",
    gestureInstructionOos: "Zeige {fingers} Finger {side} neben dem Regaletikett.",
    verdictPass: "Geprüft",
    verdictFail: "Nicht akzeptiert",
    outcomeObserved: "Preis erfasst",
    outcomeOutOfStock: "Nicht im Regal",
    privacyNote: "Nur Regale fotografieren. Keine Personen im Bild.",
    fakeBanner: "FAKE-ZAHLUNGEN",
    overrideBadge: "DEMO-OVERRIDE",
  },
};

type Vars = { expected?: string; product?: string };

const MESSAGES: Record<Lang, Record<GateName, string>> = {
  en: {
    image_ok: "The photo could not be used. Take a new one.",
    code_match: "We could not read the code {expected} in your photo. Hold the paper closer and try again.",
    not_screen: "This looks like a photo of a screen. Photograph the real shelf.",
    readable: "The price tag is not readable. Move closer and avoid glare.",
    product_match: "This does not look like {product}. Check that you are at the right product.",
    price_sanity: "That price looks wrong. Check the tag again.",
    timing: "Your claim expired. Take the task again.",
    not_duplicate: "This photo was already used.",
    label_visible: "The shelf label is not readable. Take the photo again with the label in frame.",
    label_match: "This label is for another product. Find the label of {product}.",
    slot_empty: "A product is visible at this spot. If it is there, use the normal price photo.",
  },
  de: {
    image_ok: "Das Foto konnte nicht verwendet werden. Mache ein neues.",
    code_match: "Wir konnten den Code {expected} auf deinem Foto nicht lesen. Halte das Papier näher und versuche es erneut.",
    not_screen: "Das sieht nach dem Foto eines Bildschirms aus. Fotografiere das echte Regal.",
    readable: "Das Preisschild ist nicht lesbar. Gehe näher heran und vermeide Spiegelungen.",
    product_match: "Das sieht nicht nach {product} aus. Prüfe, ob du beim richtigen Produkt bist.",
    price_sanity: "Der Preis wirkt falsch. Prüfe das Schild noch einmal.",
    timing: "Deine Reservierung ist abgelaufen. Übernimm die Aufgabe erneut.",
    not_duplicate: "Dieses Foto wurde bereits verwendet.",
    label_visible: "Das Regaletikett ist nicht lesbar. Fotografiere erneut mit dem Etikett im Bild.",
    label_match: "Dieses Etikett gehört zu einem anderen Produkt. Suche das Etikett von {product}.",
    slot_empty: "An dieser Stelle ist ein Produkt zu sehen. Wenn es da ist, nutze das normale Preisfoto.",
  },
};

/**
 * G2 and G6 messages in gesture mode (ADR-19). They never name the expected gesture: a rejection
 * must not tell a worker which sign would have passed.
 */
const GESTURE_MESSAGES: Record<Lang, { code_match: string; timing: string }> = {
  en: {
    code_match: "We could not see the hand sign you were given. Keep your hand and the tag in frame and try again.",
    timing: "The photo came too late after the hand sign was shown. Take the task again.",
  },
  de: {
    code_match: "Wir konnten dein Handzeichen nicht erkennen. Halte Hand und Schild ins Bild und versuche es erneut.",
    timing: "Das Foto kam zu spät nach dem Handzeichen. Übernimm die Aufgabe erneut.",
  },
};

const SIDE_WORDS: Record<Lang, Record<"left" | "right", string>> = {
  en: { left: "left", right: "right" },
  de: { left: "links", right: "rechts" },
};

/** "3 fingers to the left of the tag" (en) or "3 Finger links neben dem Schild" (de). */
export function describeGesture(
  g: { fingers: number; side: "left" | "right" },
  lang: Lang = "en",
): string {
  const side = SIDE_WORDS[lang][g.side];
  return lang === "de"
    ? `${g.fingers} Finger ${side} neben dem Schild`
    : `${g.fingers} fingers to the ${side} of the tag`;
}

/** Worker-facing instruction for a revealed gesture. */
export function gestureInstruction(
  g: { fingers: number; side: "left" | "right" },
  outOfStock: boolean,
  lang: Lang = "en",
): string {
  const key = outOfStock ? "gestureInstructionOos" : "gestureInstruction";
  return (UI_LABELS[lang][key] ?? "")
    .replace("{fingers}", String(g.fingers))
    .replace("{side}", SIDE_WORDS[lang][g.side]);
}

export const PASS_MESSAGE: Record<Lang, string> = {
  en: "Verified. Payment is on its way.",
  de: "Geprüft. Die Zahlung ist unterwegs.",
};

/** Plain-words message for the first failed gate (order = evaluation order). */
export function workerMessage(
  failedGate: GateName | null,
  vars: Vars = {},
  lang: Lang = "en",
  gestureMode = false,
): string {
  if (failedGate === null) return PASS_MESSAGE[lang];
  const text =
    gestureMode && (failedGate === "code_match" || failedGate === "timing")
      ? GESTURE_MESSAGES[lang][failedGate]
      : MESSAGES[lang][failedGate];
  return text
    .replace("{expected}", vars.expected ?? "")
    .replace("{product}", vars.product ?? "");
}

/** Short operator-facing reason text (English only, never shown to workers). */
export const REASON_TEXT: Record<ReasonCode, string> = {
  image_undecodable: "Image bytes could not be decoded as JPEG or PNG.",
  image_too_small: "Image is smaller than the minimum size.",
  image_too_large: "Image exceeds the maximum byte size.",
  image_blank: "Image is near-uniform (blank or covered lens).",
  code_missing: "No challenge code was seen in the photo.",
  code_mismatch: "The code in the photo differs from the issued code.",
  code_low_confidence: "The code was read with low confidence.",
  gesture_missing: "No hand with raised fingers was seen in the photo.",
  gesture_mismatch: "The finger count or the hand side differs from the issued gesture.",
  gesture_low_confidence: "The gesture was read with low confidence.",
  screen_recapture: "The photo shows a display screen, not the real shelf.",
  price_unreadable: "The price could not be parsed.",
  product_unreadable: "The product text is empty.",
  low_confidence: "Overall extraction confidence is below the threshold.",
  product_mismatch: "Product text does not match the requested product.",
  ean_mismatch: "A valid barcode was read and it is another product.",
  price_out_of_range: "Price is outside the plausible range.",
  price_deviates_from_reference: "Price deviates too much from the reference price.",
  price_format: "Price has more than two decimals or a currency other than EUR.",
  submitted_too_early: "Photo arrived before the minimum time after claim.",
  claim_expired: "Photo arrived after the claim expired.",
  window_closed: "Photo arrived after the task window closed.",
  challenge_stale: "Photo arrived too long after the gesture was revealed.",
  duplicate_image: "Identical image already used in this job.",
  near_duplicate_image: "Near-identical image already used in this job.",
  label_not_visible: "No shelf-edge label visible.",
  label_unreadable: "Shelf label present but not readable.",
  label_product_mismatch: "Label text belongs to another product.",
  label_ean_mismatch: "Label barcode belongs to another product.",
  product_present: "A product is visible in the slot.",
  slot_not_empty: "The facing is not seen empty.",
  facing_not_in_frame: "The facing area above the label is not in the frame.",
};
