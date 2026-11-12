import type { FeedEvent } from "@shelfie/core";

export interface FeedSubscriber {
  city: string | null; // null = all cities (location check off)
  send(event: FeedEvent): void;
}

/** In-process pub/sub for the worker feed (SSE `task_opened`, `task_closed`, `ping`). Best effort. */
export class Feed {
  private readonly subs = new Set<FeedSubscriber>();
  private readonly perIp = new Map<string, number>();

  subscribe(sub: FeedSubscriber, ip: string, maxPerIp: number): (() => void) | null {
    const n = this.perIp.get(ip) ?? 0;
    if (n >= maxPerIp) return null;
    this.perIp.set(ip, n + 1);
    this.subs.add(sub);
    return () => {
      if (this.subs.delete(sub)) this.perIp.set(ip, Math.max(0, (this.perIp.get(ip) ?? 1) - 1));
    };
  }

  /** `cityId` is the task's city; `task_closed` is sent to every subscriber (the id is harmless). */
  publish(event: FeedEvent, cityId: string | null): void {
    for (const s of this.subs) {
      if (event.type === "task_opened" && s.city !== null && cityId !== null && s.city !== cityId)
        continue;
      try {
        s.send(event);
      } catch {
        // a broken connection never breaks the engine
      }
    }
  }

  ping(): void {
    for (const s of this.subs) {
      try {
        s.send({ type: "ping" });
      } catch {
        // ignore
      }
    }
  }

  size(): number {
    return this.subs.size;
  }
}
