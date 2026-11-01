import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { FeedEventSchema, LedgerEventSchema } from "@shelfie/core/browser";
import type {
  CatalogResponse,
  ClaimLocation,
  FeedEvent,
  LedgerEvent,
  TaskListItem,
} from "@shelfie/core/browser";
import { useDeps } from "../deps.js";
import type { ApiClient } from "./api.js";
import { openStream } from "./sse.js";
import type { StreamStatus } from "./sse.js";

export const POLL_FALLBACK_MS = 3000;

// One catalog request per client instance, shared by every screen that needs store positions.
// Failures are not cached, so the next mount retries.
const catalogCache = new WeakMap<ApiClient, Promise<CatalogResponse>>();

function loadCatalogOnce(api: ApiClient): Promise<CatalogResponse> {
  const cached = catalogCache.get(api);
  if (cached) return cached;
  const request = api.catalog().catch((err: unknown) => {
    catalogCache.delete(api);
    throw err;
  });
  catalogCache.set(api, request);
  return request;
}

/** Public catalog (store positions, names, addresses), cached in memory for the page lifetime. */
export function useCatalog(): {
  catalog: CatalogResponse | undefined;
  loading: boolean;
  error: unknown;
} {
  const { api } = useDeps();
  const [catalog, setCatalog] = useState<CatalogResponse | undefined>(undefined);
  const [error, setError] = useState<unknown>(undefined);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    void loadCatalogOnce(api).then(
      (c) => {
        if (!alive) return;
        setCatalog(c);
        setError(undefined);
        setLoading(false);
      },
      (err: unknown) => {
        if (!alive) return;
        setError(err);
        setLoading(false);
      },
    );
    return () => {
      alive = false;
    };
  }, [api]);

  return { catalog, loading, error };
}
export const RECONCILE_OPEN_MS = 15_000;
const LEAVE_MS = 220;

/** Run `fn` now and every `intervalMs`; never overlaps; aborts on unmount. */
export function usePolling<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  intervalMs: number,
  enabled = true,
): { data: T | undefined; error: unknown; reload: () => void } {
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<unknown>(undefined);
  const [nonce, setNonce] = useState(0);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    let busy = false;
    const run = () => {
      if (busy) return;
      busy = true;
      fnRef
        .current(controller.signal)
        .then((value) => {
          if (controller.signal.aborted) return;
          setData(value);
          setError(undefined);
        })
        .catch((err: unknown) => {
          if (!controller.signal.aborted) setError(err);
        })
        .finally(() => {
          busy = false;
        });
    };
    run();
    const id = setInterval(run, intervalMs);
    return () => {
      controller.abort();
      clearInterval(id);
    };
  }, [intervalMs, enabled, nonce]);

  return { data, error, reload: () => setNonce((n) => n + 1) };
}

// ------------------------------------------------------------------ task feed
export interface FeedRow {
  task: TaskListItem;
  leaving: boolean;
}
export interface FeedState {
  rows: FeedRow[];
  pending: TaskListItem[];
}
export type FeedAction =
  | { type: "replace"; tasks: TaskListItem[] }
  | { type: "event"; event: FeedEvent; atTop: boolean }
  | { type: "remove"; taskId: string }
  | { type: "flush" };

export const emptyFeed: FeedState = { rows: [], pending: [] };

/** Pure reducer so the feed rules are testable without a DOM. */
export function feedReducer(state: FeedState, action: FeedAction): FeedState {
  switch (action.type) {
    case "replace": {
      const incoming = new Map(action.tasks.map((t) => [t.id as string, t]));
      const kept = state.rows
        .filter((r) => incoming.has(r.task.id))
        .map((r) => ({ task: incoming.get(r.task.id) ?? r.task, leaving: false }));
      const have = new Set(kept.map((r) => r.task.id as string));
      const added = action.tasks
        .filter((t) => !have.has(t.id))
        .map((task) => ({ task, leaving: false }));
      return { rows: [...kept, ...added], pending: [] };
    }
    case "event": {
      const ev = action.event;
      if (ev.type === "task_opened") {
        const known =
          state.rows.some((r) => r.task.id === ev.task.id) ||
          state.pending.some((t) => t.id === ev.task.id);
        if (known) return state;
        if (action.atTop)
          return { ...state, rows: [{ task: ev.task, leaving: false }, ...state.rows] };
        return { ...state, pending: [ev.task, ...state.pending] };
      }
      if (ev.type === "task_closed") {
        return {
          rows: state.rows.map((r) => (r.task.id === ev.taskId ? { ...r, leaving: true } : r)),
          pending: state.pending.filter((t) => t.id !== ev.taskId),
        };
      }
      return state;
    }
    case "remove":
      return { ...state, rows: state.rows.filter((r) => r.task.id !== action.taskId) };
    case "flush":
      return {
        rows: [...state.pending.map((task) => ({ task, leaving: false })), ...state.rows],
        pending: [],
      };
  }
}

/** Wire event -> FeedEvent. The data payload is the event without `type` (core api.ts). */
export function parseFeedEvent(name: string, data: string): FeedEvent | null {
  let payload: unknown = {};
  if (data.trim().length > 0) {
    try {
      payload = JSON.parse(data);
    } catch {
      return null;
    }
  }
  if (typeof payload !== "object" || payload === null) return null;
  let body = payload as Record<string, unknown>;
  // verify Friday: contracts 1.2 says task_opened carries "the full task object"; accept it bare.
  if (name === "task_opened" && !("task" in body) && "id" in body) body = { task: body };
  const parsed = FeedEventSchema.safeParse({ ...body, type: name });
  return parsed.success ? parsed.data : null;
}

export interface TaskFeed {
  rows: FeedRow[];
  pendingCount: number;
  flush: () => void;
  status: StreamStatus;
  loading: boolean;
  error: unknown;
}

export function useTaskFeed(location: ClaimLocation | undefined): TaskFeed {
  const { api, createEventSource } = useDeps();
  const [state, dispatch] = useReducer(feedReducer, emptyFeed);
  const [status, setStatus] = useState<StreamStatus>("connecting");
  const [loading, setLoading] = useState(location !== undefined);
  const [error, setError] = useState<unknown>(undefined);
  const timers = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());

  const lat = location?.lat;
  const lon = location?.lon;

  // Initial load, and polling while the stream is not open (3 s fallback).
  useEffect(() => {
    if (lat === undefined || lon === undefined) return;
    const loc: ClaimLocation = { lat, lon };
    const controller = new AbortController();
    const load = () =>
      api
        .tasks(loc, controller.signal)
        .then((res) => {
          if (controller.signal.aborted) return;
          dispatch({ type: "replace", tasks: res.tasks });
          setError(undefined);
        })
        .catch((err: unknown) => {
          if (!controller.signal.aborted) setError(err);
        })
        .finally(() => setLoading(false));
    void load();
    return () => controller.abort();
  }, [api, lat, lon]);

  useEffect(() => {
    if (lat === undefined || lon === undefined) return;
    const loc: ClaimLocation = { lat, lon };
    const handle = openStream({
      url: api.tasksStreamUrl(loc),
      events: ["task_opened", "task_closed", "ping"],
      factory: createEventSource,
      onStatus: setStatus,
      onEvent: (name, data) => {
        const event = parseFeedEvent(name, data);
        if (!event) return;
        dispatch({ type: "event", event, atTop: window.scrollY < 40 });
        if (event.type === "task_closed") {
          const t = setTimeout(() => {
            timers.current.delete(t);
            dispatch({ type: "remove", taskId: event.taskId });
          }, LEAVE_MS);
          timers.current.add(t);
        }
      },
    });
    const pending = timers.current;
    return () => {
      handle.close();
      pending.forEach(clearTimeout);
      pending.clear();
    };
  }, [api, createEventSource, lat, lon]);

  useEffect(() => {
    if (lat === undefined || lon === undefined) return;
    const loc: ClaimLocation = { lat, lon };
    // Slow reconcile even while the stream is "open": a proxy that buffers SSE (Vercel rewrite,
    // D-32) opens the stream but delivers no events, which would freeze the feed silently.
    const id = setInterval(
      () => {
        api
          .tasks(loc)
          .then((res) => dispatch({ type: "replace", tasks: res.tasks }))
          .catch(() => undefined);
      },
      status === "open" ? RECONCILE_OPEN_MS : POLL_FALLBACK_MS,
    );
    return () => clearInterval(id);
  }, [api, lat, lon, status]);

  const flush = useCallback(() => dispatch({ type: "flush" }), []);
  return { rows: state.rows, pendingCount: state.pending.length, flush, status, loading, error };
}

// ------------------------------------------------------------------ ledger
export function mergeLedger(current: LedgerEvent[], incoming: LedgerEvent[]): LedgerEvent[] {
  const bySeq = new Map(current.map((e) => [e.seq, e]));
  for (const e of incoming) bySeq.set(e.seq, e);
  return [...bySeq.values()].sort((a, b) => a.seq - b.seq).slice(-500);
}

export function useLedger(): { entries: LedgerEvent[]; status: StreamStatus; error: unknown } {
  const { api, createEventSource } = useDeps();
  const [entries, setEntries] = useState<LedgerEvent[]>([]);
  const [status, setStatus] = useState<StreamStatus>("connecting");
  const [error, setError] = useState<unknown>(undefined);
  const lastSeq = useRef(0);

  const absorb = useCallback((incoming: LedgerEvent[]) => {
    if (incoming.length === 0) return;
    setEntries((cur) => {
      const next = mergeLedger(cur, incoming);
      lastSeq.current = next.length > 0 ? (next[next.length - 1]?.seq ?? 0) : 0;
      return next;
    });
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    api
      .ledger(0, controller.signal)
      .then((res) => absorb(res.entries))
      .catch((err: unknown) => {
        if (!controller.signal.aborted) setError(err);
      });
    const handle = openStream({
      url: api.ledgerStreamUrl(),
      events: ["entry"],
      factory: createEventSource,
      onStatus: setStatus,
      onEvent: (_name, data) => {
        try {
          const parsed = LedgerEventSchema.safeParse(JSON.parse(data));
          if (parsed.success) absorb([parsed.data]);
        } catch {
          /* ignore a malformed frame */
        }
      },
    });
    return () => {
      controller.abort();
      handle.close();
    };
  }, [api, createEventSource, absorb]);

  useEffect(() => {
    if (status === "open") return;
    const id = setInterval(() => {
      api
        .ledger(lastSeq.current)
        .then((res) => absorb(res.entries))
        .catch(() => undefined);
    }, POLL_FALLBACK_MS);
    return () => clearInterval(id);
  }, [api, status, absorb]);

  return { entries, status, error };
}
