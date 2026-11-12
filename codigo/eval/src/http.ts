import { AppError, VerifyRequestSchema, VerifyResponseSchema } from "@shelfie/core";
import type { Evaluator } from "@shelfie/verifier";
import { z } from "zod";

/** Admin dry route only: no x402, redirects, retries or raw upstream error output. */
export function createDryEvaluator(
  baseUrl: string,
  adminToken: string | undefined,
): Pick<Evaluator, "evaluate"> {
  const url = new URL(z.url().parse(baseUrl));
  const loopback = ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/" ||
    (url.protocol !== "https:" && !(url.protocol === "http:" && loopback))
  ) {
    throw new Error(
      "verifier URL must be an HTTPS origin or loopback HTTP origin, without credentials",
    );
  }
  if (!adminToken) throw new Error("Dry HTTP evaluation requires ADMIN_TOKEN in the environment");
  const endpoint = new URL("/v1/verify-dry", url);

  return {
    async evaluate(task, image, ctx) {
      const body = VerifyRequestSchema.parse({ ...ctx, task, image });
      let response: Response;
      try {
        response = await fetch(endpoint, {
          method: "POST",
          redirect: "error",
          headers: {
            "content-type": "application/json",
            "x-admin-token": adminToken,
            "idempotency-key": `verify:${ctx.submissionId}`,
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(60_000),
        });
      } catch {
        throw new AppError("vision_unavailable", "Dry verifier request failed.", undefined, {
          reason: "network",
        });
      }
      if (!response.ok) {
        await response.body?.cancel();
        throw new AppError(
          "vision_unavailable",
          "Dry verifier returned an HTTP error.",
          undefined,
          { reason: "http_status", status: response.status },
        );
      }
      try {
        const verdict = VerifyResponseSchema.parse(await response.json());
        if (verdict.submissionId !== ctx.submissionId || verdict.outcome !== task.outcome) {
          throw new Error("Mismatched verdict");
        }
        return verdict;
      } catch {
        throw new AppError(
          "vision_unavailable",
          "Dry verifier returned an invalid verdict.",
          undefined,
          { reason: "schema_violation" },
        );
      }
    },
  };
}
