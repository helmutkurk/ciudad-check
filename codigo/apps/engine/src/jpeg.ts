import { createHash } from "node:crypto";
import { AppError } from "@shelfie/core";

// Upload pipeline steps 3-6 of security.md 4.3: strict base64, magic bytes, SOF dimensions,
// metadata strip (APP1 EXIF/XMP, APP13 IPTC, COM, trailing data), sha256 of the cleaned bytes.
// Zero dependency. Pixels are not decoded (so polyglots that survive a marker walk are not
// fully excluded; security.md 4.3 notes the re-encode option). // verify Friday

export interface ImageLimits {
  maxBytes: number;
  minShortSide: number;
  minLongSide: number;
  maxSide: number;
  maxPixels: number;
}

export const DEFAULT_IMAGE_LIMITS = {
  minShortSide: 600,
  minLongSide: 800,
  maxSide: 4096,
  maxPixels: 16_000_000,
} as const;

export interface CleanImage {
  bytes: Buffer;
  width: number;
  height: number;
  sha256: string;
  /** Camera EXIF was present in the upload (advisory flag only; it never decides). */
  exifPresent: boolean;
}

const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

/** Strict base64 decode with a size check before decoding. */
export function decodeBase64Strict(b64: string, maxBytes: number): Buffer {
  if (b64.length % 4 !== 0 || !BASE64.test(b64)) {
    throw new AppError("image_not_decodable", "The image data is not valid base64.");
  }
  const padding = b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0;
  const estimated = (b64.length / 4) * 3 - padding;
  if (estimated > maxBytes) {
    throw new AppError("image_too_large", "The image is too large.", undefined, { maxBytes });
  }
  return Buffer.from(b64, "base64");
}

const bad = (msg: string): AppError => new AppError("image_not_decodable", msg);

const SOF_MARKERS = new Set([
  0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
]);

export function cleanJpeg(
  input: Buffer,
  limits: ImageLimits & { minShortSide?: number },
): CleanImage {
  if (input.length < 4 || input[0] !== 0xff || input[1] !== 0xd8 || input[2] !== 0xff) {
    throw bad("Only JPEG images are accepted.");
  }
  const out: Buffer[] = [Buffer.from([0xff, 0xd8])];
  let pos = 2;
  let width = 0;
  let height = 0;
  let exifPresent = false;
  let sawScan = false;

  for (;;) {
    if (pos >= input.length) throw bad("The JPEG is truncated.");
    if (input[pos] !== 0xff) throw bad("The JPEG structure is invalid.");
    while (input[pos + 1] === 0xff) pos++; // fill bytes
    const marker = input[pos + 1];
    if (marker === undefined) throw bad("The JPEG is truncated.");
    if (marker === 0xd9) {
      if (!sawScan) throw bad("The JPEG has no image data.");
      out.push(Buffer.from([0xff, 0xd9]));
      break; // everything after EOI (trailing data) is dropped
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0xd8) {
      pos += 2;
      continue;
    }
    if (pos + 4 > input.length) throw bad("The JPEG is truncated.");
    const len = input.readUInt16BE(pos + 2);
    if (len < 2 || pos + 2 + len > input.length) throw bad("The JPEG is truncated.");
    const seg = input.subarray(pos, pos + 2 + len);

    if (SOF_MARKERS.has(marker)) {
      if (len < 8) throw bad("The JPEG header is invalid.");
      height = input.readUInt16BE(pos + 5);
      width = input.readUInt16BE(pos + 7);
      out.push(seg);
    } else if (marker === 0xe1) {
      if (seg.subarray(4, 10).toString("latin1") === "Exif\0\0") exifPresent = true;
      // APP1 (EXIF, XMP) dropped
    } else if (marker === 0xed || marker === 0xfe) {
      // APP13 (IPTC) and COM dropped
    } else {
      out.push(seg);
    }
    pos += 2 + len;

    if (marker === 0xda) {
      if (width === 0 || height === 0) throw bad("The JPEG has no frame header.");
      sawScan = true;
      // entropy-coded data up to the next real marker
      let q = pos;
      while (q < input.length - 1) {
        if (input[q] === 0xff) {
          const n = input[q + 1];
          if (n !== undefined && n !== 0x00 && n !== 0xff && !(n >= 0xd0 && n <= 0xd7)) break;
        }
        q++;
      }
      if (q >= input.length - 1) throw bad("The JPEG is truncated.");
      out.push(input.subarray(pos, q));
      pos = q;
    }
  }

  const short = Math.min(width, height);
  const long = Math.max(width, height);
  if (
    short < limits.minShortSide ||
    long < limits.minLongSide ||
    long > limits.maxSide ||
    width * height > limits.maxPixels
  ) {
    throw new AppError(
      "image_not_decodable",
      "The image dimensions are outside the allowed range.",
      undefined,
      {
        width,
        height,
      },
    );
  }
  const bytes = Buffer.concat(out);
  if (bytes.length > limits.maxBytes) {
    throw new AppError("image_too_large", "The image is too large.", undefined, {
      maxBytes: limits.maxBytes,
    });
  }
  return {
    bytes,
    width,
    height,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    exifPresent,
  };
}
