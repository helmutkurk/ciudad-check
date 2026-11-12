import sharp from "sharp";
import type { ImageMimeType } from "@shelfie/core";

// Image handling for G1 and the vision request. The one place that touches pixels.
// Injectable (`ImageService`) so rules can be tested without decoding anything.

export type ImageInfo =
  | { ok: true; width: number; height: number; variance: number; ahash: string }
  | { ok: false; reason: "undecodable" };

export interface ImageService {
  inspect(bytes: Uint8Array, mimeType: ImageMimeType): Promise<ImageInfo>;
  /** Re-encoded JPEG, longest side <= 1600 px, metadata (EXIF/GPS) stripped. */
  prepareForVision(
    bytes: Uint8Array,
    mimeType: ImageMimeType,
  ): Promise<{ mimeType: "image/jpeg"; base64: string }>;
}

export const VISION_MAX_SIDE = 1600;
// Guards against decompression bombs: 40 megapixels.
const LIMIT_PIXELS = 40_000_000;

const FORMAT_FOR_MIME: Record<ImageMimeType, string> = {
  "image/jpeg": "jpeg",
  "image/png": "png",
};

export class SharpImageService implements ImageService {
  async inspect(bytes: Uint8Array, mimeType: ImageMimeType): Promise<ImageInfo> {
    try {
      const input = sharp(bytes, { failOn: "error", limitInputPixels: LIMIT_PIXELS });
      const meta = await input.metadata();
      if (meta.format !== FORMAT_FOR_MIME[mimeType] || !meta.width || !meta.height) {
        return { ok: false, reason: "undecodable" };
      }
      // Decode fully (failOn: error) while computing grayscale statistics.
      const stats = await input.clone().rotate().greyscale().stats();
      const stdev = stats.channels[0]?.stdev ?? 0;
      const small = await input
        .clone()
        .rotate()
        .greyscale()
        .resize(8, 8, { fit: "fill" })
        .raw()
        .toBuffer();
      const oriented = (meta.orientation ?? 1) >= 5;
      return {
        ok: true,
        width: oriented ? meta.height : meta.width,
        height: oriented ? meta.width : meta.height,
        variance: stdev * stdev,
        ahash: averageHash(small),
      };
    } catch {
      return { ok: false, reason: "undecodable" };
    }
  }

  async prepareForVision(
    bytes: Uint8Array,
    _mimeType: ImageMimeType,
  ): Promise<{ mimeType: "image/jpeg"; base64: string }> {
    const out = await sharp(bytes, { failOn: "error", limitInputPixels: LIMIT_PIXELS })
      .rotate() // apply EXIF orientation, then output carries no metadata
      .resize({
        width: VISION_MAX_SIDE,
        height: VISION_MAX_SIDE,
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({ quality: 85 })
      .toBuffer();
    return { mimeType: "image/jpeg", base64: out.toString("base64") };
  }
}

/** 8x8 average hash as 16 hex chars. */
export function averageHash(gray8x8: Uint8Array): string {
  let sum = 0;
  for (const v of gray8x8) sum += v;
  const mean = sum / Math.max(1, gray8x8.length);
  let bits = 0n;
  for (let i = 0; i < 64; i++) {
    bits = (bits << 1n) | ((gray8x8[i] ?? 0) >= mean ? 1n : 0n);
  }
  return bits.toString(16).padStart(16, "0");
}

export function hammingDistance(a: string, b: string): number {
  let x = BigInt(`0x${a}`) ^ BigInt(`0x${b}`);
  let n = 0;
  while (x > 0n) {
    n += Number(x & 1n);
    x >>= 1n;
  }
  return n;
}
