// A structurally valid JPEG (SOI, SOF0, SOS, EOI) with no real pixels. Enough for the engine upload
// pipeline and the fake verifier; a real decoder (the verifier's sharp) rejects it. Used by tests,
// the seed and the smoke script: demo data is synthetic, never a photo of a real place or person.

const u16 = (n: number): Buffer => Buffer.from([(n >> 8) & 0xff, n & 0xff]);

/** `tag` goes into the entropy data: it makes the bytes unique and can carry a fake-verifier marker. */
export function syntheticStreetJpeg(tag: string, width = 1600, height = 1200): Buffer {
  const safeTag = tag.replace(/[^\x20-\x7e]/g, "?");
  return Buffer.concat([
    Buffer.from([0xff, 0xd8]),
    Buffer.from([0xff, 0xc0]),
    u16(17),
    Buffer.from([8]),
    u16(height),
    u16(width),
    Buffer.from([3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1]),
    Buffer.from([0xff, 0xda]),
    u16(12),
    Buffer.from([3, 1, 0, 2, 0x11, 3, 0x11, 0, 63, 0]),
    Buffer.from(`SYNTHETIC ${safeTag} ${"x".repeat(64)}`, "latin1"),
    Buffer.from([0xff, 0xd9]),
  ]);
}

let counter = 0;
/** Unique synthetic photo as the contract's `photo` input. */
export function syntheticStreetPhoto(tag = ""): { mimeType: "image/jpeg"; base64: string } {
  counter += 1;
  return {
    mimeType: "image/jpeg",
    base64: syntheticStreetJpeg(`${tag} #${counter} ${Date.now().toString(36)}`).toString("base64"),
  };
}
