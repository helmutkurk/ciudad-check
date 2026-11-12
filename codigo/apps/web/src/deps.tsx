import { createContext, useContext } from "react";
import { ApiClient } from "./lib/api.js";
import { captureFromVideo } from "./lib/camera.js";
import type { CapturePhotoFn, MediaDevicesLike } from "./lib/camera.js";
import type { WebEnv } from "./lib/env.js";
import { randomHexId } from "./lib/format.js";
import type { GeolocationLike } from "./lib/geo.js";
import type { EventSourceFactory } from "./lib/sse.js";
import { createSafeStorage } from "./lib/storage.js";
import type { KeyValueStore } from "./lib/storage.js";

/** Everything with side effects, injectable so tests need no network, camera or GPS. */
export interface Deps {
  api: ApiClient;
  env: WebEnv;
  createEventSource: EventSourceFactory;
  now: () => Date;
  newId: (prefix: string) => string;
  geolocation: GeolocationLike | undefined;
  mediaDevices: MediaDevicesLike | undefined;
  isSecureContext: () => boolean;
  capturePhoto: CapturePhotoFn;
  storage: KeyValueStore;
}

export function createBrowserDeps(env: WebEnv): Deps {
  return {
    api: new ApiClient({ base: env.VITE_API_BASE }),
    env,
    createEventSource: (url) => new EventSource(url),
    now: () => new Date(),
    newId: randomHexId,
    geolocation: typeof navigator !== "undefined" ? navigator.geolocation : undefined,
    mediaDevices: typeof navigator !== "undefined" ? navigator.mediaDevices : undefined,
    isSecureContext: () => window.isSecureContext,
    capturePhoto: captureFromVideo,
    storage: createSafeStorage(),
  };
}

const DepsContext = createContext<Deps | null>(null);
export const DepsProvider = DepsContext.Provider;

export function useDeps(): Deps {
  const deps = useContext(DepsContext);
  if (!deps) throw new Error("DepsProvider missing");
  return deps;
}
