/**
 * Injectable clock. Domain code never calls Date.now(); it receives a Clock.
 */
export interface Clock {
  /** Current time as a Date (a fresh object on every call). */
  now(): Date;
  /** Current time in epoch milliseconds. */
  nowMs(): number;
  /** Current time as ISO-8601 UTC string (contracts: timestamps are ISO-8601 UTC). */
  nowIso(): string;
}

export const systemClock: Clock = {
  now: () => new Date(),
  nowMs: () => Date.now(),
  nowIso: () => new Date().toISOString(),
};

/** Controllable clock for tests and demos. */
export class FakeClock implements Clock {
  private ms: number;

  constructor(startIso: string = "2026-10-30T09:00:00.000Z") {
    const parsed = Date.parse(startIso);
    if (Number.isNaN(parsed)) throw new Error("FakeClock: invalid start timestamp");
    this.ms = parsed;
  }

  now(): Date {
    return new Date(this.ms);
  }

  nowMs(): number {
    return this.ms;
  }

  nowIso(): string {
    return new Date(this.ms).toISOString();
  }

  advance(ms: number): void {
    this.ms += ms;
  }

  advanceSec(sec: number): void {
    this.ms += sec * 1000;
  }

  set(iso: string): void {
    const parsed = Date.parse(iso);
    if (Number.isNaN(parsed)) throw new Error("FakeClock: invalid timestamp");
    this.ms = parsed;
  }
}

/** ISO timestamp `sec` seconds after `iso`. */
export function addSeconds(iso: string, sec: number): string {
  return new Date(Date.parse(iso) + sec * 1000).toISOString();
}
