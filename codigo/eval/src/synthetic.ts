import { createHash } from "node:crypto";
import sharp from "sharp";

// Stand-in photos for stub-mode runs without a photo set: deterministic textured JPEGs (so G1
// passes) with the stub scenario marker appended after the image data (decoders ignore it).
// They carry no content; only the stub reader looks at the marker. Never use for live runs.

export async function syntheticPhoto(file: string, scenario: string | undefined): Promise<Buffer> {
  const w = 1000;
  const h = 800;
  const raw = Buffer.alloc(w * h * 3);
  let s = createHash("sha256").update(file).digest().readUInt32LE(0) || 1;
  for (let i = 0; i < raw.length; i++) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    raw[i] = s >>> 24;
  }
  const jpg = await sharp(raw, { raw: { width: w, height: h, channels: 3 } })
    .jpeg({ quality: 80 })
    .toBuffer();
  return scenario && scenario !== "ok" ? Buffer.concat([jpg, Buffer.from(`\nSHELFIE-STUB:${scenario}`)]) : jpg;
}
