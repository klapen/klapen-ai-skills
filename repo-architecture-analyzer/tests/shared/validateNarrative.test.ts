import { describe, it, expect } from "vitest";
import { validateNarrativeContent } from "../../src/shared/validate";
import type { NarrativeContent } from "../../src/shared/types";

function minimalNarrative(): NarrativeContent {
  return {
    summary: "A small TypeScript service with a single entry point.",
    keyInsights: ["src/index.ts has the highest fan-in (4) of any file."],
    readingList: [
      { path: "src/index.ts", reason: "Main entry point; everything else is imported from here." },
    ],
    views: {
      repoMap: "The map is dominated by the src/ folder.",
      depMatrix: "No cycles were found in this repo.",
      hotspots: "No file crosses the risk threshold.",
    },
  };
}

describe("validateNarrativeContent", () => {
  it("accepts a well-formed narrative", () => {
    const result = validateNarrativeContent(minimalNarrative());
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("rejects a narrative missing summary", () => {
    const data = minimalNarrative() as any;
    delete data.summary;
    const result = validateNarrativeContent(data);
    expect(result.valid).toBe(false);
  });

  it("rejects an empty keyInsights array", () => {
    const data = minimalNarrative();
    data.keyInsights = [];
    const result = validateNarrativeContent(data);
    expect(result.valid).toBe(false);
  });

  it("rejects a reading list entry missing reason", () => {
    const data = minimalNarrative() as any;
    data.readingList = [{ path: "src/index.ts" }];
    const result = validateNarrativeContent(data);
    expect(result.valid).toBe(false);
  });

  it("rejects views missing a required key", () => {
    const data = minimalNarrative() as any;
    delete data.views.hotspots;
    const result = validateNarrativeContent(data);
    expect(result.valid).toBe(false);
  });
});
