// Server-Sent Events with reconnect. The caller adds a polling fallback while status != "open"
// (contracts.md 1.2 and 1.4: stream first, 3 s polling when it drops).

export type StreamStatus = "connecting" | "open" | "reconnecting" | "closed";

export interface MessageEventLike {
  data: string;
}
export interface EventSourceLike {
  addEventListener(type: string, listener: (event: MessageEventLike) => void): void;
  close(): void;
  onopen: ((event: Event) => void) | null;
  onerror: ((event: Event) => void) | null;
}
export type EventSourceFactory = (url: string) => EventSourceLike;

export interface StreamOptions {
  url: string;
  /** Wire event names, for example `task_opened`. */
  events: readonly string[];
  factory: EventSourceFactory;
  onEvent: (name: string, data: string) => void;
  onStatus?: (status: StreamStatus) => void;
  /** Reconnect delays in ms; the last value repeats. */
  backoffMs?: readonly number[];
}

export interface StreamHandle {
  close(): void;
}

export const DEFAULT_BACKOFF_MS = [1000, 2000, 4000, 8000, 15000] as const;

export function openStream(options: StreamOptions): StreamHandle {
  const backoff = options.backoffMs ?? DEFAULT_BACKOFF_MS;
  let source: EventSourceLike | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let failures = 0;
  let closed = false;

  const setStatus = (status: StreamStatus) => options.onStatus?.(status);

  const connect = () => {
    if (closed) return;
    setStatus(failures === 0 ? "connecting" : "reconnecting");
    const es = options.factory(options.url);
    source = es;
    es.onopen = () => {
      failures = 0;
      setStatus("open");
    };
    for (const name of options.events) {
      es.addEventListener(name, (event) => options.onEvent(name, event.data));
    }
    es.onerror = () => {
      // Close and reconnect ourselves so the delay follows our backoff, not the browser's.
      es.close();
      source = null;
      if (closed) return;
      setStatus("reconnecting");
      const delay = backoff[Math.min(failures, backoff.length - 1)] ?? 15000;
      failures += 1;
      timer = setTimeout(connect, delay);
    };
  };

  connect();

  return {
    close() {
      closed = true;
      if (timer) clearTimeout(timer);
      source?.close();
      source = null;
      setStatus("closed");
    },
  };
}
