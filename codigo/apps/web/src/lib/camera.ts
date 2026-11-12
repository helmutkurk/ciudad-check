// Live capture only. There is no file input anywhere in the worker app (ADR-17); the photo comes
// from a getUserMedia stream drawn to a canvas, which also strips any EXIF.

export interface MediaDevicesLike {
  getUserMedia(constraints: MediaStreamConstraints): Promise<MediaStream>;
}

export interface CapturedPhoto {
  base64: string; // JPEG bytes, no "data:" prefix
  mimeType: "image/jpeg";
  width: number;
  height: number;
  previewUrl: string;
}
export type CapturePhotoFn = (video: HTMLVideoElement) => Promise<CapturedPhoto>;

export type CameraFailure = "denied" | "missing" | "unsupported";

export class CameraError extends Error {
  readonly kind: CameraFailure;
  constructor(kind: CameraFailure) {
    super(`Camera ${kind}`);
    this.name = "CameraError";
    this.kind = kind;
  }
}

export async function startCamera(devices: MediaDevicesLike | undefined): Promise<MediaStream> {
  if (!devices) throw new CameraError("unsupported");
  try {
    return await devices.getUserMedia({
      // Ask for HD: without a size, Chrome/Safari on phones often deliver 640x480, which the
      // engine rejects (short side < 600 px, jpeg.ts) and which cannot resolve a price tag.
      video: {
        facingMode: { ideal: "environment" },
        width: { ideal: 1920 },
        height: { ideal: 1080 },
      },
      audio: false,
    });
  } catch (err) {
    const name = err instanceof DOMException ? err.name : "";
    if (name === "NotFoundError" || name === "OverconstrainedError")
      throw new CameraError("missing");
    throw new CameraError("denied");
  }
}

export function stopStream(stream: MediaStream | null): void {
  stream?.getTracks().forEach((t) => t.stop());
}

const MAX_SIDE = 1600;

/** Draw the current frame to a canvas, resize to MAX_SIDE, encode JPEG 0.85. */
export const captureFromVideo: CapturePhotoFn = async (video) => {
  const sw = video.videoWidth;
  const sh = video.videoHeight;
  if (!sw || !sh) throw new CameraError("unsupported");
  const scale = Math.min(1, MAX_SIDE / Math.max(sw, sh));
  const width = Math.round(sw * scale);
  const height = Math.round(sh * scale);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new CameraError("unsupported");
  ctx.drawImage(video, 0, 0, width, height);
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", 0.85),
  );
  if (!blob) throw new CameraError("unsupported");
  const base64 = await blobToBase64(blob);
  return { base64, mimeType: "image/jpeg", width, height, previewUrl: URL.createObjectURL(blob) };
};

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader(); // reads our own canvas output, not a user-chosen file
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.onerror = () => reject(new CameraError("unsupported"));
    reader.readAsDataURL(blob);
  });
}
