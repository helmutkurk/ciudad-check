import { z } from "zod";

/**
 * Error codes and their HTTP status (contracts.md section 0 and endpoint sections).
 * `snake_case`, stable, machine-readable. Codes marked "extra" are not listed in contracts.md.
 */
export const ERROR_STATUS = {
  brand_token_missing: 401,
  brand_token_invalid: 401,
  order_cap_reached: 429,
  daily_cap_reached: 429,
  sokosumi_unavailable: 502,
  // 400-level generic
  invalid_request: 400,
  unauthorized: 401,
  payment_required: 402, // verifier only
  forbidden: 403, // extra: generic 403 (admin token wrong role)
  not_found: 404,
  rate_limited: 429,
  // 403 specific
  location_required: 403,
  wrong_city: 403,
  override_disabled: 403,
  // 409 conflict states
  task_not_open: 409,
  claim_expired: 409,
  already_submitted: 409,
  claim_already_active: 409,
  claim_window_closed: 409,
  challenge_not_revealed: 409, // gesture mode: submit before POST /api/claims/{id}/challenge
  invalid_transition: 409, // extra: illegal state machine transition
  // 413
  image_too_large: 413,
  // 422
  unprocessable: 422,
  input_schema_violation: 422,
  intake_rejected: 422,
  invalid_payout_address: 422,
  location_mismatch: 422,
  location_inaccurate: 422,
  capture_mode_not_allowed: 422,
  image_not_decodable: 422,
  duplicate_image: 422,
  // 5xx
  internal: 500,
  dependency_unavailable: 503,
  vision_unavailable: 503,
} as const;

export type ErrorCode = keyof typeof ERROR_STATUS;

export const ERROR_CODES = Object.keys(ERROR_STATUS) as [ErrorCode, ...ErrorCode[]];

export const ErrorCodeSchema = z.enum(ERROR_CODES);

export const ErrorBodySchema = z.object({
  error: z.object({
    code: ErrorCodeSchema,
    message: z.string(),
    details: z.record(z.string(), z.unknown()).default({}),
  }),
});
export type ErrorBody = z.infer<typeof ErrorBodySchema>;

/** The one error class. Components throw it; the HTTP layer turns it into ErrorBody. */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details: Record<string, unknown>;

  constructor(
    code: ErrorCode,
    message: string,
    status: number = ERROR_STATUS[code],
    details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.status = status;
    this.details = details;
  }

  toBody(): ErrorBody {
    return { error: { code: this.code, message: this.message, details: this.details } };
  }
}

export function isAppError(err: unknown): err is AppError {
  return err instanceof AppError;
}

/** Normalise anything thrown into an AppError (unknown errors become `internal`, message hidden). */
export function toAppError(err: unknown): AppError {
  if (isAppError(err)) return err;
  return new AppError("internal", "Internal error.");
}

/** Parse an unknown value with a zod schema; failures become 422 `input_schema_violation`. */
export function parseOrThrow<S extends z.ZodType>(
  schema: S,
  value: unknown,
  code: ErrorCode = "input_schema_violation",
): z.output<S> {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  throw new AppError(code, "Request does not match the expected schema.", ERROR_STATUS[code], {
    issues: result.error.issues.map((i) => ({
      path: i.path.join("."),
      code: i.code,
      message: i.message,
    })),
  });
}
