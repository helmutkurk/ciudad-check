// Test fixtures (not exported from index.ts): extractions, tasks, a fake image service.
import type {
  ObservedExtraction,
  OosExtraction,
  VerifyContext,
  VerifyImage,
  VerifyTask,
} from "@shelfie/core";
import { thresholdsFromPack } from "@shelfie/domain-shelf";
import type { ImageInfo, ImageService } from "./image.js";

export const T = thresholdsFromPack();

export const VALID_EAN = "4008400402222"; // Nutella 450 g, valid checksum
export const OTHER_EAN = "5449000000439"; // Coca-Cola 1,5 l, valid checksum

export const task = (over: Partial<VerifyTask> = {}): VerifyTask => ({
  taskId: "tsk_01",
  product: {
    name: "Example Pale Ale 0,33 l",
    ean: VALID_EAN,
    aliases: ["example pale ale"],
    priceMinEur: 1,
    priceMaxEur: 4,
  },
  store: { id: "s1", name: "Store A" },
  expectedCode: "K7Q-4XM",
  outcome: "OBSERVED",
  claimIssuedAt: "2026-10-30T10:00:00.000Z",
  claimExpiresAt: "2026-10-30T10:05:00.000Z",
  taskWindowEndsAt: "2026-10-30T10:15:00.000Z",
  receivedAt: "2026-10-30T10:01:00.000Z",
  ...over,
});

export const observed = (over: Partial<ObservedExtraction> = {}): ObservedExtraction => ({
  code: { text: "K7Q-4XM", confidence: 0.93, location: "paper next to the tag" },
  price: { text: "2,49 EUR", value: 2.49, currency: "EUR", confidence: 0.9, unit: "per piece" },
  product: { text: "Example Pale Ale 0,33 l", confidence: 0.88 },
  barcode: null,
  scene: { isShelfOrPriceTag: true, peopleVisible: false, glare: "low", blur: "none" },
  advisory: { tamperSuspected: false, looksLikeScreenPhoto: false, exifTime: null },
  overallConfidence: 0.88,
  notes: null,
  ...over,
});

export const oos = (over: Partial<OosExtraction> = {}): OosExtraction => ({
  code: { text: "K7Q-4XM", confidence: 0.93, location: "paper next to the label" },
  label: {
    visible: true,
    text: "Example Pale Ale 0,33 l 2,49 EUR",
    productText: "Example Pale Ale 0,33 l",
    barcodeDigits: null,
    priceText: "2,49 EUR",
    confidence: 0.82,
  },
  facing: {
    empty: true,
    productAboveLabel: false,
    inFrame: true,
    confidence: 0.85,
    description: "bare shelf above the label",
  },
  scene: { peopleVisible: false, glare: "low", blur: "none" },
  overallConfidence: 0.8,
  notes: null,
  ...over,
});

export const okInfo = (over: Partial<Extract<ImageInfo, { ok: true }>> = {}): ImageInfo => ({
  ok: true,
  width: 1600,
  height: 1200,
  variance: 900,
  ahash: "f0f0f0f0f0f0f0f0",
  ...over,
});

export class FakeImages implements ImageService {
  inspected = 0;
  constructor(private readonly byImage: (bytes: Uint8Array) => ImageInfo = () => okInfo()) {}
  inspect(bytes: Uint8Array): Promise<ImageInfo> {
    this.inspected++;
    return Promise.resolve(this.byImage(bytes));
  }
  prepareForVision(): Promise<{ mimeType: "image/jpeg"; base64: string }> {
    return Promise.resolve({ mimeType: "image/jpeg", base64: "cHJlcGFyZWQ=" });
  }
}

export const image = (text = "photo-1"): VerifyImage => {
  const base64 = Buffer.from(text).toString("base64");
  return { mimeType: "image/jpeg", base64, sha256: "0".repeat(64) };
};

export const ctx = (over: Partial<VerifyContext> = {}): VerifyContext => ({
  packId: "shelf-check",
  submissionId: "sub_01",
  previousImageSha256: [],
  ...over,
});
