import { AppError, CreateJobResponseSchema } from "@shelfie/core";
import type { EngineEnv, IdGenerator } from "@shelfie/core";
import { z } from "zod";
import type { Engine } from "./engine.js";

export interface SokosumiTaskInput {
  orderId: string;
  storeId: string;
  productEan: string;
  maxCredits: number;
}
export interface SokosumiClient {
  createTask(
    input: SokosumiTaskInput,
    onCreated?: (taskId: string) => void,
  ): Promise<{ taskId: string; credits?: number }>;
  /**
   * Price Sokosumi charged for a Task, or undefined when unknown. The create answer carries no
   * price yet: Sokosumi sets it seconds later, when the coworker requests the payment.
   */
  taskCredits?(taskId: string): Promise<number | undefined>;
}

/** Local rehearsal only: same createJob method/body as the authenticated shell bridge. */
export class FakeSokosumiClient implements SokosumiClient {
  constructor(
    private readonly engine: Engine,
    private readonly env: EngineEnv,
    private readonly ids: IdGenerator,
  ) {}
  createTask(
    input: SokosumiTaskInput,
    onCreated?: (taskId: string) => void,
  ): Promise<{ taskId: string }> {
    const taskId = `fake-sokosumi-${input.orderId}-${this.ids.next("tsk")}`;
    onCreated?.(taskId);
    CreateJobResponseSchema.parse(
      this.engine.createJob(
        {
          packId: this.env.PACK_ID,
          source: "shell",
          externalRef: taskId,
          input: { productEan: input.productEan, stores: [{ id: input.storeId }] },
          orderRef: { orderId: input.orderId, storeId: input.storeId },
        },
        "shell",
      ).body,
    );
    return Promise.resolve({ taskId });
  }
}

const unavailable = () =>
  new AppError("sokosumi_unavailable", "Sokosumi request could not be confirmed.");

const CreatedResponse = z.object({
  data: z.object({
    id: z.string().regex(/^[A-Za-z0-9_-]{1,100}$/),
    credits: z.number().nullable().optional(),
  }),
});

const Credits = z.number().nonnegative().max(1_000_000_000).nullable().optional();
/** GET /v1/tasks/{id}: the price is `totalCredits` (`credits` as fallback, as the Sokosumi CLI reads it). */
const TaskResponse = z.object({ data: z.object({ totalCredits: Credits, credits: Credits }) });

/**
 * Real adapter (B-16). Request shape verified by A-25 (codigo/docs/verified.md): one READY
 * coworker Task per store, POST /v1/tasks with Bearer token and X-Organization-Slug; the shell
 * worker polls the coworker's Tasks, requests the Masumi payment and runs the bridge, which reads
 * the ids-only description {orderId, storeId, productEan} (bridge order correlation). Only Tasks
 * are created, never an extra agent job, so there is exactly one paid mechanism per store.
 * Sokosumi has no spend cap: the engine reserves credits before calling (orders.ts). Any failure
 * is reported as unavailable (the order then needs reconciliation; nothing is retried), and no
 * upstream body or error text is exposed (it may carry account details).
 */
export class RealSokosumiClient implements SokosumiClient {
  constructor(
    private readonly env: EngineEnv,
    private readonly fetchFn: typeof fetch = fetch,
  ) {
    if (
      env.SOKOSUMI_API_URL !== "https://api.preprod.sokosumi.com" ||
      !env.SOKOSUMI_API_TOKEN ||
      !env.SOKOSUMI_COWORKER_ID ||
      !env.SOKOSUMI_ORGANIZATION_SLUG
    ) {
      throw new AppError("internal", "Real Sokosumi configuration is incomplete.");
    }
  }

  async createTask(
    input: SokosumiTaskInput,
    onCreated?: (taskId: string) => void,
  ): Promise<{ taskId: string; credits?: number }> {
    let raw: unknown;
    try {
      const response = await this.fetchFn(new URL("/v1/tasks", this.env.SOKOSUMI_API_URL), {
        method: "POST",
        redirect: "error",
        signal: AbortSignal.timeout(15_000),
        headers: {
          Authorization: `Bearer ${this.env.SOKOSUMI_API_TOKEN}`,
          "X-Organization-Slug": this.env.SOKOSUMI_ORGANIZATION_SLUG!,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          coworkerId: this.env.SOKOSUMI_COWORKER_ID,
          name: `Shelfie check ${input.productEan} at ${input.storeId}`.slice(0, 200),
          description: JSON.stringify({
            orderId: input.orderId,
            storeId: input.storeId,
            productEan: input.productEan,
          }),
          status: "READY",
        }),
      });
      if (response.status !== 201 && response.status !== 200) throw unavailable();
      const text = await response.text();
      if (text.length > 64_000) throw unavailable();
      raw = JSON.parse(text);
    } catch {
      // Neither upstream response nor thrown error is safe to expose (may contain credentials).
      // A timeout or reset may still have created the Task: orders.ts marks it for reconciliation.
      throw unavailable();
    }
    // 2xx: the Task exists. Record any plausible id before validating the rest, so a Task is
    // never orphaned by a stricter-than-expected answer.
    const loose = (raw as { data?: { id?: unknown } } | null)?.data?.id;
    if (typeof loose === "string" && /^[A-Za-z0-9_.:-]{1,100}$/.test(loose)) onCreated?.(loose);
    const parsed = CreatedResponse.safeParse(raw);
    if (!parsed.success) throw unavailable();
    const taskId = parsed.data.data.id;
    if (loose !== taskId) onCreated?.(taskId);
    const credits = parsed.data.data.credits;
    if (typeof credits !== "number" || credits > input.maxCredits) {
      // Sokosumi has no cap in the create call; an unknown or higher price stops the order here.
      throw new AppError(
        "sokosumi_unavailable",
        "Task price unknown or above the credit cap; check Sokosumi.",
        502,
        {
          reason: "task_above_credit_cap",
          taskId,
        },
      );
    }
    return { taskId, credits };
  }

  /** Read-only price lookup; any failure is "unknown", never an error, and no body is exposed. */
  async taskCredits(taskId: string): Promise<number | undefined> {
    if (!/^[A-Za-z0-9_-]{1,100}$/.test(taskId)) return undefined;
    try {
      const response = await this.fetchFn(
        new URL(`/v1/tasks/${taskId}`, this.env.SOKOSUMI_API_URL),
        {
          method: "GET",
          redirect: "error",
          signal: AbortSignal.timeout(10_000),
          headers: {
            Authorization: `Bearer ${this.env.SOKOSUMI_API_TOKEN}`,
            "X-Organization-Slug": this.env.SOKOSUMI_ORGANIZATION_SLUG!,
            Accept: "application/json",
          },
        },
      );
      if (!response.ok) return undefined;
      const text = await response.text();
      if (text.length > 512_000) return undefined;
      const parsed = TaskResponse.safeParse(JSON.parse(text));
      if (!parsed.success) return undefined;
      return parsed.data.data.totalCredits ?? parsed.data.data.credits ?? undefined;
    } catch {
      return undefined;
    }
  }
}
