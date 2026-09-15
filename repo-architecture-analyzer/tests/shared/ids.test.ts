import { describe, it, expect } from "vitest";
import path from "node:path";
import { normalizeRelativePath, buildEntityId } from "../../src/shared/ids";

describe("normalizeRelativePath", () => {
  it("returns a posix-style relative path for a nested file", () => {
    const root = path.resolve("/repo");
    const abs = path.resolve("/repo/src/utils/c.ts");
    expect(normalizeRelativePath(root, abs)).toBe("src/utils/c.ts");
  });
});

describe("buildEntityId", () => {
  it("builds a file-level id without a qualified name", () => {
    expect(buildEntityId("file", "src/utils/c.ts")).toBe("file:src/utils/c.ts");
  });

  it("builds a symbol-level id with a qualified name", () => {
    expect(buildEntityId("class", "src/utils/c.ts", "Helper")).toBe(
      "class:src/utils/c.ts#Helper"
    );
  });
});
