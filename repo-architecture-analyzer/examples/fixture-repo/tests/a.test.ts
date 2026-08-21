import { describe, it, expect } from "vitest";
import { AService } from "../src/a";

describe("AService", () => {
  it("runs without throwing", () => {
    expect(() => new AService().run()).not.toThrow();
  });
});
