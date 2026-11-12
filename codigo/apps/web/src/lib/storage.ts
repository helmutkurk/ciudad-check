import { PayoutAddressSchema } from "@shelfie/core/browser";
import { z } from "zod";

// localStorage holds only: workerId, display name, payout address, consent version, a location
// hint, a photo history (ids and names). No token, no session, no secret (security.md 3.4).
// Every access is wrapped: private windows and blocked storage throw, so there is a memory
// fallback.

export interface KeyValueStore {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
}

export function createSafeStorage(): KeyValueStore {
  const memory = new Map<string, string>();
  return {
    get(key) {
      try {
        const v = window.localStorage.getItem(key);
        if (v !== null) return v;
      } catch {
        /* storage unavailable */
      }
      return memory.get(key) ?? null;
    },
    set(key, value) {
      memory.set(key, value);
      try {
        window.localStorage.setItem(key, value);
      } catch {
        /* storage unavailable */
      }
    },
    remove(key) {
      memory.delete(key);
      try {
        window.localStorage.removeItem(key);
      } catch {
        /* storage unavailable */
      }
    },
  };
}

export function createMemoryStorage(initial: Record<string, string> = {}): KeyValueStore {
  const map = new Map(Object.entries(initial));
  return {
    get: (k) => map.get(k) ?? null,
    set: (k, v) => void map.set(k, v),
    remove: (k) => void map.delete(k),
  };
}

const K_WORKER = "shelfie.workerId";
const K_PROFILE = "shelfie.profile";
const K_CONSENT = "shelfie.consent";
const K_LOCATION = "shelfie.locationHint";

const ProfileSchema = z.object({
  name: z.string().max(60),
  address: PayoutAddressSchema,
});
export type Profile = z.infer<typeof ProfileSchema>;

export function loadWorkerId(store: KeyValueStore, newId: (prefix: string) => string): string {
  const existing = store.get(K_WORKER);
  if (existing && /^wrk_[A-Za-z0-9]+$/.test(existing)) return existing;
  const id = newId("wrk");
  store.set(K_WORKER, id);
  return id;
}

export function loadProfile(store: KeyValueStore): Profile | null {
  const raw = store.get(K_PROFILE);
  if (!raw) return null;
  try {
    const parsed = ProfileSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function saveProfile(store: KeyValueStore, profile: Profile): void {
  store.set(K_PROFILE, JSON.stringify(profile));
}

export function hasConsent(store: KeyValueStore, version: string): boolean {
  return store.get(K_CONSENT) === version;
}
export function saveConsent(store: KeyValueStore, version: string): void {
  store.set(K_CONSENT, version);
}
export function clearConsent(store: KeyValueStore): void {
  store.remove(K_CONSENT);
}

export function locationHint(store: KeyValueStore): boolean {
  return store.get(K_LOCATION) === "1";
}
export function saveLocationHint(store: KeyValueStore): void {
  store.set(K_LOCATION, "1");
}

// Photo history on this device (ids and names only, no photo, no secret): the engine has no
// worker history endpoint, so the Wallet tab lists what this phone submitted and reads each
// submission's verdict and payout from GET /api/submissions/{id}.
const K_HISTORY = "shelfie.history";
const HISTORY_MAX = 20;
const HistoryEntrySchema = z.object({
  submissionId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
  productName: z.string().max(120),
  storeName: z.string().max(160),
  payoutAmount: z.string().regex(/^\d{1,20}$/),
  at: z.string().max(40),
});
export type HistoryEntry = z.infer<typeof HistoryEntrySchema>;

export function loadHistory(store: KeyValueStore): HistoryEntry[] {
  const raw = store.get(K_HISTORY);
  if (!raw) return [];
  try {
    const parsed = z.array(HistoryEntrySchema).max(HISTORY_MAX).safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}

/** Newest first, one entry per submission, at most HISTORY_MAX. Returns the new list. */
export function addHistory(store: KeyValueStore, entry: HistoryEntry): HistoryEntry[] {
  if (!HistoryEntrySchema.safeParse(entry).success) return loadHistory(store);
  const next = [entry, ...loadHistory(store).filter((e) => e.submissionId !== entry.submissionId)];
  const capped = next.slice(0, HISTORY_MAX);
  store.set(K_HISTORY, JSON.stringify(capped));
  return capped;
}
