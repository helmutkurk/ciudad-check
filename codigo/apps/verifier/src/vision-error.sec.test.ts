import { describe, expect, it } from "vitest";
import { AppError } from "@shelfie/core";
import { publicErrorBody } from "./app.js";

// security.md logging rule: error responses never carry upstream messages. The vision adapter
// keeps the provider's status and error text in AppError details for logs and eval reports; the
// HTTP body that reaches the engine (and, through x402, the buyer) carries only the reason.

describe("vision_unavailable response body", () => {
  it("drops providerMessage and status, keeps the fixed reason", () => {
    const err = new AppError("vision_unavailable", "Vision provider unavailable.", undefined, {
      provider: "gemini",
      reason: "http_status",
      status: 400,
      providerMessage: "API key not valid. Please pass a valid API key.",
    });
    const body = publicErrorBody(err);
    expect(body).toEqual({
      error: {
        code: "vision_unavailable",
        message: "Vision provider unavailable.",
        details: { reason: "http_status" },
      },
    });
    expect(JSON.stringify(body)).not.toContain("API key");
  });

  it("leaves other error codes unchanged", () => {
    const err = new AppError("invalid_request", "Bad.", undefined, { field: "image" });
    expect(publicErrorBody(err)).toEqual(err.toBody());
  });
});
