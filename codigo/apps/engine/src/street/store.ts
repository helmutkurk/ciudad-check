import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import {
  IsoTimestampSchema,
  Sha256Schema,
  StreetCategorySchema,
  StreetEvaluateKindSchema,
  StreetMissionSchema,
  StreetPayoutSchema,
  StreetPhotoIdSchema,
  StreetReportSchema,
  StreetSubmissionSchema,
  StreetWorkerIdSchema,
} from "@shelfie/core";
import type { StreetPayout, StreetReport } from "@shelfie/core";
import { z } from "zod";

// Street persistence, separate from the legacy MemoryStore (its collection list is fixed and its
// journal rejects unknown collections). Same idea: every put is one JSON line, replayed and
// validated on start, last write wins.

/** Mission plus engine-internal claim bookkeeping (never sent to clients). */
export const StreetMissionRecordSchema = z.strictObject({
  id: z.string(),
  mission: StreetMissionSchema,
  claimedAt: IsoTimestampSchema.optional(),
  /** Failed verdicts so far; the mission fails for good at pack.worker.maxAttempts. */
  attempts: z.number().int().nonnegative(),
  /** Bumped on every claim, release and reservation: a late verifier result with an old value is stale. */
  generation: z.number().int().nonnegative(),
  /** The submission that holds the `submitted` reservation. */
  pendingSubmissionId: z.string().optional(),
  submittedAt: IsoTimestampSchema.optional(),
});
export type StreetMissionRecord = z.infer<typeof StreetMissionRecordSchema>;

export const StreetSubmissionRecordSchema = z.strictObject({
  id: z.string(),
  submission: StreetSubmissionSchema,
  kind: StreetEvaluateKindSchema,
  category: StreetCategorySchema,
  workerId: StreetWorkerIdSchema.optional(),
  distanceM: z.number().nonnegative().nullable(),
  /** The verdict came from the in-engine fake verifier. */
  fakeVerifier: z.boolean(),
});
export type StreetSubmissionRecord = z.infer<typeof StreetSubmissionRecordSchema>;

export const StreetPhotoRecordSchema = z.strictObject({
  id: StreetPhotoIdSchema,
  sha256: Sha256Schema,
  /** File name inside the street image directory (`<photoId>.jpg`), never a path from a client. */
  file: z.string().regex(/^pho_[A-Za-z0-9]{1,32}\.jpg$/),
});
export type StreetPhotoRecord = z.infer<typeof StreetPhotoRecordSchema>;

const SCHEMAS = {
  reports: StreetReportSchema,
  missions: StreetMissionRecordSchema,
  submissions: StreetSubmissionRecordSchema,
  payouts: StreetPayoutSchema,
  photos: StreetPhotoRecordSchema,
} as const;
type Name = keyof typeof SCHEMAS;

export class StreetCollection<T extends { id: string }> {
  private readonly map = new Map<string, T>();
  constructor(private readonly sink: (value: T) => void) {}
  get(id: string): T | undefined {
    return this.map.get(id);
  }
  put(value: T): void {
    this.map.set(value.id, value);
    this.sink(value);
  }
  all(): T[] {
    return [...this.map.values()];
  }
  /** Replay only: no journal write. */
  load(value: T): void {
    this.map.set(value.id, value);
  }
}

export class StreetStore {
  readonly reports: StreetCollection<StreetReport>;
  readonly missions: StreetCollection<StreetMissionRecord>;
  readonly submissions: StreetCollection<StreetSubmissionRecord>;
  readonly payouts: StreetCollection<StreetPayout>;
  readonly photos: StreetCollection<StreetPhotoRecord>;

  constructor(private readonly journalPath?: string) {
    const col = <T extends { id: string }>(name: Name): StreetCollection<T> =>
      new StreetCollection<T>((v) => {
        this.append(name, v);
      });
    this.reports = col("reports");
    this.missions = col("missions");
    this.submissions = col("submissions");
    this.payouts = col("payouts");
    this.photos = col("photos");
    if (journalPath !== undefined) {
      mkdirSync(dirname(journalPath), { recursive: true });
      if (existsSync(journalPath)) this.replay(readFileSync(journalPath, "utf8"));
    }
  }

  private append(name: Name, value: unknown): void {
    if (this.journalPath === undefined) return;
    appendFileSync(this.journalPath, `${JSON.stringify({ c: name, v: value })}\n`, { mode: 0o600 });
  }

  private replay(text: string): void {
    const lines = text.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const raw = lines[i] ?? "";
      if (raw.trim() === "") continue;
      let rec: { c?: unknown; v?: unknown };
      try {
        rec = JSON.parse(raw) as typeof rec;
      } catch {
        throw new Error(`Street journal is corrupt at line ${i + 1}; refusing to start.`);
      }
      if (typeof rec.c !== "string" || !Object.hasOwn(SCHEMAS, rec.c)) {
        throw new Error(`Street journal has an unknown record at line ${i + 1}.`);
      }
      const name = rec.c as Name;
      const parsed = (SCHEMAS[name] as z.ZodType).safeParse(rec.v);
      if (!parsed.success) {
        throw new Error(`Street journal record at line ${i + 1} fails its schema.`);
      }
      (this[name] as unknown as StreetCollection<{ id: string }>).load(
        parsed.data as { id: string },
      );
    }
  }
}
