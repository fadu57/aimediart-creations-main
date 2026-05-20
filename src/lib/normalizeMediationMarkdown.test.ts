import { describe, expect, it } from "vitest";
import { normalizeMediationMarkdownSource } from "@/lib/normalizeMediationMarkdown";

describe("normalizeMediationMarkdownSource", () => {
  it("restaure les \\n littéraux", () => {
    expect(normalizeMediationMarkdownSource("Vers un\\nVers deux")).toBe("Vers un\nVers deux");
  });

  it("retire un bloc code fence", () => {
    expect(normalizeMediationMarkdownSource("```\nLigne\n```")).toBe("Ligne");
  });
});
