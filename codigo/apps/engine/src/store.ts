import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import {
  OrderRecordSchema,
  ClaimSchema,
  JobSchema,
  PayoutSchema,
  SettlementSchema,
  SubmissionSchema,
  TaskSchema,
  VerdictSchema,
} from "@shelfie/core";
import type {
  OrderRecord,
  Claim,
  Job,
  Payout,
  Settlement,
  Submission,
  Task,
  Verdict,
} from "@shelfie/core";
import type { z } from "zod";

/** A keyed collection. Values are treated as immutable: `put` a new object to change one. */
export interface Collection<T extends { id: string }> {
  get(id: string): T | undefined;
  put(value: T): void;
  all(): T[];
}

/**
 * The persistence seam (ADR-10). The engine only talks to this interface, so SQLite can replace
 * the journal-backed memory store without touching the engine.
 */
export interface Store {
  readonly orders: Collection<OrderRecord>;
  readonly jobs: Collection<Job>;
  readonly tasks: Collection<Task>;
  readonly claims: Collection<Claim>;
  readonly submissions: Collection<Submission>;
  readonly verdicts: Collection<Verdict>;
  readonly payouts: Collection<Payout>;
  readonly settlements: Collection<Settlement>;
  /** Drop job/worker state (admin reset). Order credit reservations and evidence ledger are preserved. */
  clear(): void;
}

const SCHEMAS = {
  orders: OrderRecordSchema,
  jobs: JobSchema,
  tasks: TaskSchema,
  claims: ClaimSchema,
  submissions: SubmissionSchema,
  verdicts: VerdictSchema,
  payouts: PayoutSchema,
  settlements: SettlementSchema,
} as const;
type CollectionName = keyof typeof SCHEMAS;

type Sink = (name: CollectionName, value: unknown) => void;

class MemCollection<T extends { id: string }> implements Collection<T> {
  private readonly map = new Map<string, T>();
  constructor(
    private readonly name: CollectionName,
    private readonly sink: Sink,
  ) {}
  get(id: string): T | undefined {
    return this.map.get(id);
  }
  put(value: T): void {
    this.map.set(value.id, value);
    this.sink(this.name, value);
  }
  all(): T[] {
    return [...this.map.values()];
  }
  load(value: T): void {
    this.map.set(value.id, value);
  }
  reset(): void {
    this.map.clear();
  }
}

/**
 * In-memory store. With a `journalPath` every `put` is appended as one JSON line
 * (`{c, v}`); on start the journal is replayed (last write wins) and every record is validated
 * with its zod schema. `clear()` appends a `{c:"*",op:"clear"}` marker (append-only log).
 */
export class MemoryStore implements Store {
  private readonly sink: Sink;
  readonly orders: MemCollection<OrderRecord>;
  readonly jobs: MemCollection<Job>;
  readonly tasks: MemCollection<Task>;
  readonly claims: MemCollection<Claim>;
  readonly submissions: MemCollection<Submission>;
  readonly verdicts: MemCollection<Verdict>;
  readonly payouts: MemCollection<Payout>;
  readonly settlements: MemCollection<Settlement>;
  private readonly journalPath: string | undefined;

  constructor(journalPath?: string) {
    this.journalPath = journalPath;
    this.sink = (name, value) => {
      if (this.journalPath !== undefined) {
        appendFileSync(this.journalPath, `${JSON.stringify({ c: name, v: value })}\n`, {
          mode: 0o600,
        });
      }
    };
    this.orders = new MemCollection<OrderRecord>("orders", this.sink);
    this.jobs = new MemCollection<Job>("jobs", this.sink);
    this.tasks = new MemCollection<Task>("tasks", this.sink);
    this.claims = new MemCollection<Claim>("claims", this.sink);
    this.submissions = new MemCollection<Submission>("submissions", this.sink);
    this.verdicts = new MemCollection<Verdict>("verdicts", this.sink);
    this.payouts = new MemCollection<Payout>("payouts", this.sink);
    this.settlements = new MemCollection<Settlement>("settlements", this.sink);
    if (journalPath !== undefined) {
      mkdirSync(dirname(journalPath), { recursive: true });
      if (existsSync(journalPath)) this.replay(readFileSync(journalPath, "utf8"));
    }
  }

  private replay(text: string): void {
    const lines = text.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const raw = lines[i] ?? "";
      if (raw.trim() === "") continue;
      let rec: { c?: unknown; v?: unknown; op?: unknown };
      try {
        rec = JSON.parse(raw) as typeof rec;
      } catch {
        throw new Error(`Engine journal is corrupt at line ${i + 1}; refusing to start.`);
      }
      if (rec.c === "*" && rec.op === "clear") {
        this.resetAll();
        continue;
      }
      if (typeof rec.c !== "string" || !(rec.c in SCHEMAS)) {
        throw new Error(`Engine journal has an unknown record at line ${i + 1}.`);
      }
      const name = rec.c as CollectionName;
      const parsed = (SCHEMAS[name] as z.ZodType).safeParse(rec.v);
      if (!parsed.success)
        throw new Error(`Engine journal record at line ${i + 1} fails its schema.`);
      (this[name] as MemCollection<{ id: string }>).load(parsed.data as { id: string });
    }
  }

  private resetAll(): void {
    for (const name of Object.keys(SCHEMAS) as CollectionName[]) {
      if (name !== "orders") this[name].reset();
    }
  }

  clear(): void {
    this.resetAll();
    if (this.journalPath !== undefined) {
      appendFileSync(this.journalPath, `${JSON.stringify({ c: "*", op: "clear" })}\n`, {
        mode: 0o600,
      });
    }
  }
}
