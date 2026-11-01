import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { makeBlockfrostQuery, parseAuditEnv, runAudit } from "./ledger-audit.js";
import { fixture } from "./ledger-audit-fixtures.js";
const address = `addr_test1${"a".repeat(30)}`;
describe("read-only audit security", () => {
  it("rejects other networks, non-preprod public addresses and project ids", () => {
    expect(() => parseAuditEnv({ NETWORK: "preview" })).toThrow();
    expect(() => parseAuditEnv({ WALLET_ADDRESS_PAY: "wrong-address" })).toThrow();
    expect(() => parseAuditEnv({ BLOCKFROST_PROJECT_ID: "preview-not-a-real-key" })).toThrow();
  });
  it("does not retain signing secrets or unrelated env secrets", () => {
    const env = parseAuditEnv({
      PAY_MNEMONIC_1: "SYNTHETIC_SECRET",
      ADMIN_TOKEN: "SYNTHETIC_TOKEN",
      WALLET_ADDRESS_PAY: address,
    });
    expect(JSON.stringify(env)).not.toContain("SYNTHETIC");
  });
  it("only performs GET requests to a fixed preprod origin, refuses redirects and hides responses", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("sensitive upstream error", { status: 403 }));
    const query = makeBlockfrostQuery("preprod-SYNTHETIC", fetchImpl, 0);
    await expect(query("/blocks/latest")).rejects.toThrow("Blockfrost HTTP 403");
    const [url, options] = fetchImpl.mock.calls[0]!;
    expect(url).toBe("https://cardano-preprod.blockfrost.io/api/v0/blocks/latest");
    expect(options?.method).toBe("GET");
    expect(options?.redirect).toBe("error");
    await expect(query("https://invalid.example")).rejects.toThrow();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
  it("prints neither invalid flag values nor unknown exception messages", async () => {
    const lines: string[] = [];
    expect(
      await runAudit(["--SYNTHETIC_SECRET"], {}, (s) => {
        lines.push(s);
      }),
    ).toBe(1);
    expect(lines.join("\n")).not.toContain("SYNTHETIC_SECRET");
    expect(lines.join("\n")).toContain("FAIL");
  });
  it("rejects loose/non-ISO --since and future windows before reading any input", async () => {
    const out = vi.fn();
    expect(await runAudit(["--since", "yesterday"], {}, out)).toBe(1);
    expect(await runAudit(["--since", "2999-01-01T00:00:00Z"], {}, out)).toBe(1);
  });
  it("reads all five fixtures without changing bytes or calling fetch under --no-chain", async () => {
    const dir = mkdtempSync(join(tmpdir(), "shelfie-audit-"));
    const f = fixture();
    const files = {
      ledger: f.ledger,
      store: f.journal,
      "payout-store": f.payouts,
      "verify-state": f.verify,
      "tx-log": f.documented,
    };
    const args = ["--no-chain"];
    const fetchImpl = vi.fn().mockRejectedValue(new Error("No sockets allowed"));
    vi.stubGlobal("fetch", fetchImpl);
    try {
      for (const [key, text] of Object.entries(files)) {
        const path = join(dir, key);
        writeFileSync(path, text);
        args.push(`--${key}`, path);
      }
      const lines: string[] = [];
      expect(
        await runAudit(args, { NETWORK: "preprod" }, (s) => {
          lines.push(s);
        }),
      ).toBe(0);
      expect(lines.join("\n")).toContain("PASS (local only");
      expect(fetchImpl).not.toHaveBeenCalled();
      for (const [key, text] of Object.entries(files))
        expect(readFileSync(join(dir, key), "utf8")).toBe(text);
      rmSync(join(dir, "payout-store"));
      expect(await runAudit(args, {}, () => {})).toBe(1);
    } finally {
      vi.unstubAllGlobals();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
