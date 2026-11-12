// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const tokens = readFileSync(new URL("./tokens.css", import.meta.url), "utf8");

describe("light theme only", () => {
  it("has no dark palette, no theme attribute and no prefers-color-scheme rules", () => {
    expect(tokens).not.toMatch(/data-theme/);
    expect(tokens).not.toMatch(/prefers-color-scheme/);
    expect(tokens).toMatch(/color-scheme:\s*light;/);
  });
});
