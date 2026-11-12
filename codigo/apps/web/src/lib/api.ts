import {
  AppError,
  BrandProfileSchema,
  BrandSummarySchema,
  BrandTransactionsResponseSchema,
  OrderViewSchema,
  OrderListResponseSchema,
  OverrideResponseSchema,
  CatalogResponseSchema,
  ClaimResponseSchema,
  ConfigResponseSchema,
  CreateJobResponseSchema,
  DecisionResponseSchema,
  ErrorBodySchema,
  HealthResponseSchema,
  JobListResponseSchema,
  JobViewSchema,
  LedgerListResponseSchema,
  PayoutListResponseSchema,
  ReleaseClaimResponseSchema,
  RevealChallengeResponseSchema,
  SubmissionViewSchema,
  SubmitPhotoResponseSchema,
  TaskListResponseSchema,
} from "@shelfie/core/browser";
import type {
  CreateOrderRequest,
  ClaimRequest,
  CreateJobRequest,
  ErrorCode,
  SubmitPhotoRequest,
  ClaimLocation,
} from "@shelfie/core/browser";
import { z } from "zod";

/** GET /api/admin/ping (operator gate): the only success body is `{ ok: true }`. */
const AdminPingResponseSchema = z.strictObject({ ok: z.literal(true) });

// Typed client for the engine API (contracts.md section 1). Every response is parsed with the
// zod schema from @shelfie/core; errors become AppError with the stable code from the body.

type FetchFn = typeof fetch;

export interface ApiClientOptions {
  /** `VITE_API_BASE`; empty string = same origin. */
  base: string;
  fetchFn?: FetchFn;
}

interface RequestOptions {
  method?: "GET" | "POST";
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

function codeForStatus(status: number): ErrorCode {
  if (status === 401) return "unauthorized";
  if (status === 403) return "forbidden";
  if (status === 404) return "not_found";
  if (status === 429) return "rate_limited";
  if (status === 503) return "dependency_unavailable";
  if (status >= 400 && status < 500) return "invalid_request";
  return "internal";
}

export class ApiClient {
  readonly base: string;
  private readonly fetchFn: FetchFn;

  constructor(options: ApiClientOptions) {
    this.base = options.base.replace(/\/+$/, "");
    this.fetchFn = options.fetchFn ?? ((input, init) => fetch(input, init));
  }

  url(path: string): string {
    return `${this.base}${path}`;
  }

  private async request<S extends z.ZodType>(
    schema: S,
    path: string,
    options: RequestOptions = {},
  ): Promise<z.output<S>> {
    const headers: Record<string, string> = { Accept: "application/json", ...options.headers };
    const init: RequestInit = {
      method: options.method ?? "GET",
      headers,
      credentials: "same-origin", // session cookie is HttpOnly; the page never reads it
    };
    if (options.body !== undefined) {
      headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(options.body);
    }
    if (options.signal) init.signal = options.signal;

    let res: Response;
    try {
      res = await this.fetchFn(this.url(path), init);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") throw err;
      throw new AppError("dependency_unavailable", "Cannot reach the server.", 503);
    }

    let json: unknown = null;
    const text = await res.text();
    if (text.length > 0) {
      try {
        json = JSON.parse(text);
      } catch {
        json = null;
      }
    }

    if (!res.ok) {
      const parsed = ErrorBodySchema.safeParse(json);
      if (parsed.success) {
        const { code, message, details } = parsed.data.error;
        throw new AppError(code, message, res.status, details);
      }
      throw new AppError(codeForStatus(res.status), `Request failed (${res.status}).`, res.status);
    }

    const result = schema.safeParse(json);
    if (!result.success) {
      throw new AppError("internal", "Unexpected response from the server.", 502, {
        path,
        issues: result.error.issues.length,
      });
    }
    return result.data;
  }

  // ---- public / worker
  config(signal?: AbortSignal) {
    return this.request(ConfigResponseSchema, "/api/config", withSignal(signal));
  }
  catalog(signal?: AbortSignal) {
    return this.request(CatalogResponseSchema, "/api/catalog", withSignal(signal));
  }
  health(signal?: AbortSignal) {
    return this.request(HealthResponseSchema, "/api/health", withSignal(signal));
  }
  tasks(location: ClaimLocation | undefined, signal?: AbortSignal) {
    return this.request(
      TaskListResponseSchema,
      `/api/tasks${locationQuery(location, true)}`,
      withSignal(signal),
    );
  }
  tasksStreamUrl(location: ClaimLocation | undefined): string {
    return this.url(`/api/tasks/stream${locationQuery(location, false)}`);
  }
  claim(taskId: string, body: ClaimRequest) {
    return this.request(ClaimResponseSchema, `/api/tasks/${encodeURIComponent(taskId)}/claim`, {
      method: "POST",
      body,
    });
  }
  /** Gesture mode (ADR-19): reveal the hand sign when the camera opens; idempotent. */
  revealChallenge(claimId: string) {
    return this.request(
      RevealChallengeResponseSchema,
      `/api/claims/${encodeURIComponent(claimId)}/challenge`,
      { method: "POST", body: {} },
    );
  }
  release(claimId: string) {
    return this.request(
      ReleaseClaimResponseSchema,
      `/api/claims/${encodeURIComponent(claimId)}/release`,
      { method: "POST", body: {} },
    );
  }
  submit(taskId: string, body: SubmitPhotoRequest) {
    return this.request(
      SubmitPhotoResponseSchema,
      `/api/tasks/${encodeURIComponent(taskId)}/submissions`,
      { method: "POST", body },
    );
  }
  submission(id: string, signal?: AbortSignal) {
    return this.request(
      SubmissionViewSchema,
      `/api/submissions/${encodeURIComponent(id)}`,
      withSignal(signal),
    );
  }

  // ---- customer / dashboard
  createOrder(body: CreateOrderRequest, brandToken: string, key: string) {
    return this.request(OrderViewSchema, "/api/orders", {
      method: "POST",
      body,
      headers: { "X-Brand-Token": brandToken, "Idempotency-Key": key },
    });
  }
  /** ADR-21: validates a brand access code and returns the brand profile (never the code). */
  brandMe(brandToken: string, signal?: AbortSignal) {
    return this.request(BrandProfileSchema, "/api/brand/me", {
      ...withSignal(signal),
      headers: { "X-Brand-Token": brandToken },
    });
  }
  /** Spend and check counts over the brand's own orders. */
  brandSummary(brandToken: string, signal?: AbortSignal) {
    return this.request(BrandSummarySchema, "/api/brand/summary", {
      ...withSignal(signal),
      headers: { "X-Brand-Token": brandToken },
    });
  }
  /** On-chain transactions of the brand's own orders (scoped by the engine). */
  brandTransactions(brandToken: string, signal?: AbortSignal) {
    return this.request(BrandTransactionsResponseSchema, "/api/brand/transactions", {
      ...withSignal(signal),
      headers: { "X-Brand-Token": brandToken },
    });
  }
  orders(brandToken: string, signal?: AbortSignal) {
    return this.request(OrderListResponseSchema, "/api/orders", {
      ...withSignal(signal),
      headers: { "X-Brand-Token": brandToken },
    });
  }
  order(id: string, brandToken: string, signal?: AbortSignal) {
    return this.request(OrderViewSchema, `/api/orders/${encodeURIComponent(id)}`, {
      ...withSignal(signal),
      headers: { "X-Brand-Token": brandToken },
    });
  }
  override(submissionId: string, adminToken: string) {
    return this.request(
      OverrideResponseSchema,
      `/api/admin/submissions/${encodeURIComponent(submissionId)}/override`,
      {
        method: "POST",
        body: { pass: true, reason: "Operator demo correction" },
        headers: { "X-Admin-Token": adminToken },
      },
    );
  }
  jobs(signal?: AbortSignal) {
    return this.request(JobListResponseSchema, "/api/jobs", withSignal(signal));
  }
  job(id: string, signal?: AbortSignal) {
    return this.request(JobViewSchema, `/api/jobs/${encodeURIComponent(id)}`, withSignal(signal));
  }
  decision(id: string, signal?: AbortSignal) {
    return this.request(
      DecisionResponseSchema,
      `/api/jobs/${encodeURIComponent(id)}/decision?waitSec=0`,
      withSignal(signal),
    );
  }
  payouts(jobId: string, signal?: AbortSignal) {
    return this.request(
      PayoutListResponseSchema,
      `/api/payouts?jobId=${encodeURIComponent(jobId)}`,
      withSignal(signal),
    );
  }
  ledger(afterSeq: number, signal?: AbortSignal) {
    return this.request(
      LedgerListResponseSchema,
      `/api/ledger?afterSeq=${afterSeq}&limit=200`,
      withSignal(signal),
    );
  }
  ledgerStreamUrl(): string {
    return this.url("/api/ledger/stream");
  }
  /** Operator gate: checks the admin token before the dashboard shows operator views. */
  adminPing(adminToken: string, signal?: AbortSignal) {
    return this.request(AdminPingResponseSchema, "/api/admin/ping", {
      ...withSignal(signal),
      headers: { "X-Admin-Token": adminToken },
    });
  }
  /** Operator path: POST /api/jobs with the admin token (held in memory by the dashboard only). */
  createJob(body: CreateJobRequest, adminToken: string) {
    return this.request(CreateJobResponseSchema, "/api/jobs", {
      method: "POST",
      body,
      headers: { "X-Admin-Token": adminToken },
    });
  }
}

function withSignal(signal: AbortSignal | undefined): RequestOptions {
  return signal ? { signal } : {};
}

function locationQuery(location: ClaimLocation | undefined, withStatus: boolean): string {
  const parts: string[] = [];
  if (withStatus) parts.push("status=OPEN");
  if (location) {
    parts.push(`lat=${location.lat}`, `lon=${location.lon}`);
  }
  return parts.length > 0 ? `?${parts.join("&")}` : "";
}
