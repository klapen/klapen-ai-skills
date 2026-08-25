import { describe, it, expect } from "vitest";
import { validateNarrativeContent } from "../../src/shared/validate";
import type { NarrativeContent, NarrativeLangContent } from "../../src/shared/types";

function langContent(): NarrativeLangContent {
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

function minimalNarrative(): NarrativeContent {
  return { en: langContent(), es: langContent() };
}

describe("validateNarrativeContent", () => {
  it("accepts a well-formed bilingual narrative", () => {
    const result = validateNarrativeContent(minimalNarrative());
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("rejects a narrative missing the es language", () => {
    const data = minimalNarrative() as any;
    delete data.es;
    const result = validateNarrativeContent(data);
    expect(result.valid).toBe(false);
  });

  it("rejects a narrative missing the en language", () => {
    const data = minimalNarrative() as any;
    delete data.en;
    const result = validateNarrativeContent(data);
    expect(result.valid).toBe(false);
  });

  it("rejects a language entry missing summary", () => {
    const data = minimalNarrative() as any;
    delete data.en.summary;
    const result = validateNarrativeContent(data);
    expect(result.valid).toBe(false);
  });

  it("rejects an empty keyInsights array", () => {
    const data = minimalNarrative();
    data.es.keyInsights = [];
    const result = validateNarrativeContent(data);
    expect(result.valid).toBe(false);
  });

  it("rejects a reading list entry missing reason", () => {
    const data = minimalNarrative() as any;
    data.en.readingList = [{ path: "src/index.ts" }];
    const result = validateNarrativeContent(data);
    expect(result.valid).toBe(false);
  });

  it("rejects views missing a required key", () => {
    const data = minimalNarrative() as any;
    delete data.es.views.hotspots;
    const result = validateNarrativeContent(data);
    expect(result.valid).toBe(false);
  });
});
