import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { VerifyRequestSchema } from "@shelfie/core";
import { execute, loadLabels } from "./index.js";
import { syntheticPhoto } from "./synthetic.js";

const tmp = (): string => mkdtempSync(join(tmpdir(), "shelfie-eval-"));
afterEach(() => vi.unstubAllGlobals());

describe("external photos and dry HTTP evaluation", () => {
  it("loads all 14 WhatsApp labels, including one-finger truth but only valid issued challenges", () => {
    const f = loadLabels(
      fileURLToPath(new URL("../labels.whatsapp-2026-10-31.json", import.meta.url)),
    );
    expect(f.labels).toHaveLength(14);
    expect(f.labels[0]?.truth.gesture).toEqual({ fingers: 1, side: "left" });
    expect(f.labels.every((l) => l.expectedGesture && l.expectedGesture.fingers >= 2)).toBe(true);
  });

  it("reads absolute paths and basenames with spaces, sends authenticated dry requests with unique IDs", async () => {
    const dir = tmp();
    const names = ["WhatsApp Image at 01.20.08 (1).jpeg", "WhatsApp Image at 01.20.08 (2).jpeg"];
    for (const name of names) writeFileSync(join(dir, name), await syntheticPhoto(name, "ok"));
    const source = loadLabels(fileURLToPath(new URL("../labels.json", import.meta.url))).labels[0]!;
    const labelsPath = join(dir, "labels.json");
    writeFileSync(
      labelsPath,
      JSON.stringify({
        version: 1,
        labels: names.map((name, i) => ({
          ...source,
          file: i === 0 ? join(dir, name) : name,
        })),
      }),
    );
    const fixture = (await execute({ mode: "stub", write: false })).results.entries[0]!.actual!;
    const requests: ReturnType<typeof VerifyRequestSchema.parse>[] = [];
    const fetchMock = vi.fn((url: URL, init?: RequestInit) => {
      expect(url.href).toBe("http://127.0.0.1:4199/v1/verify-dry");
      expect(init?.redirect).toBe("error");
      expect(init?.signal).toBeDefined();
      if (typeof init?.body !== "string") throw new Error("Expected JSON string body");
      const body = VerifyRequestSchema.parse(JSON.parse(init.body));
      const headers = new Headers(init?.headers);
      expect(headers.get("x-admin-token")).toBe("test-admin-token");
      expect(headers.get("idempotency-key")).toBe(`verify:${body.submissionId}`);
      requests.push(body);
      return Promise.resolve(
        Response.json({
          ...fixture,
          submissionId: body.submissionId,
          outcome: body.task.outcome,
          gates: [],
          cached: false,
        }),
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    const r = await execute({
      mode: "live",
      labelsPath,
      photosDir: dir,
      write: false,
      env: { EVAL_VERIFIER_URL: "http://127.0.0.1:4199", ADMIN_TOKEN: "test-admin-token" },
    });
    expect(r.metrics.ran).toBe(2);
    expect(r.metrics.matched).toBe(2);
    expect(r.results.meta.thresholds).toEqual({
      source: "remote verifier; thresholds not reported by dry endpoint",
    });
    expect(new Set(requests.map((r) => r.submissionId)).size).toBe(2);
    expect(new Set(requests.map((r) => r.task.taskId)).size).toBe(2);
    expect(r.markdown).toMatch(/NOT evidence/);
    expect(JSON.stringify(r)).not.toContain("test-admin-token");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("reports HTTP failures without response bodies and never falls back to a paid route", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(new Response("PRIVATE upstream body", { status: 503 })),
    );
    vi.stubGlobal("fetch", fetchMock);
    const r = await execute({
      mode: "live",
      synthetic: true,
      write: false,
      verifierUrl: "http://127.0.0.1:4199",
      env: { ADMIN_TOKEN: "test-admin-token" },
    });
    expect(
      r.results.entries.every((e) => e.status === "error" && e.error?.httpStatus === 503),
    ).toBe(true);
    expect(JSON.stringify(r)).not.toMatch(/PRIVATE|test-admin-token/);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("rejects malformed verdicts and refuses HTTP mode without an admin token", async () => {
    const fetchMock = vi.fn(() => Promise.resolve(Response.json({ pass: true })));
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      execute({ mode: "live", write: false, verifierUrl: "http://127.0.0.1:4199", env: {} }),
    ).rejects.toThrow(/ADMIN_TOKEN/);
    expect(fetchMock).not.toHaveBeenCalled();
    const r = await execute({
      mode: "live",
      synthetic: true,
      write: false,
      verifierUrl: "http://127.0.0.1:4199",
      env: { ADMIN_TOKEN: "test-admin-token" },
    });
    expect(r.results.entries.every((e) => e.status === "error")).toBe(true);
  });

  it("requires live opt-in and validates the origin before sending photos or credentials", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const env = { ADMIN_TOKEN: "test-admin-token", EVAL_VERIFIER_URL: "http://127.0.0.1:4199" };
    const stub = await execute({ mode: "stub", env, write: false });
    expect(stub.metrics.matched).toBe(3);
    await expect(
      execute({ mode: "stub", verifierUrl: env.EVAL_VERIFIER_URL, env, write: false }),
    ).rejects.toThrow(/requires --mode live/);
    for (const verifierUrl of [
      "http://example.com",
      "https://user:secret@example.com",
      "https://example.com/?token=secret",
      "https://example.com/v1/verify",
      "file:///tmp/verifier",
    ]) {
      await expect(execute({ mode: "live", verifierUrl, env, write: false })).rejects.toThrow();
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("redacts network failures, does not retry, and lets the flag override the URL environment", async () => {
    const fetchMock = vi.fn((url: URL) => {
      expect(url.origin).toBe("http://127.0.0.1:4199");
      return Promise.reject(new Error("private token in upstream error"));
    });
    vi.stubGlobal("fetch", fetchMock);
    const r = await execute({
      mode: "live",
      synthetic: true,
      write: false,
      verifierUrl: "http://127.0.0.1:4199",
      env: { ADMIN_TOKEN: "test-admin-token", EVAL_VERIFIER_URL: "https://unused.example" },
    });
    expect(
      r.results.entries.every((e) => e.status === "error" && e.error?.reason === "network"),
    ).toBe(true);
    expect(JSON.stringify(r)).not.toMatch(/private token|test-admin-token/);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
