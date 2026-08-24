import { describe, it, expect } from "vitest";
import { AppState, matchesFilters } from "../../src/report/state";

describe("AppState", () => {
  it("notifies subscribers when the selection changes", () => {
    const state = new AppState();
    let calls = 0;
    state.subscribe(() => { calls += 1; });
    state.select("file:a.ts");
    expect(state.selectedNodeId).toBe("file:a.ts");
    expect(calls).toBe(1);
  });

  it("notifies subscribers when a filter changes", () => {
    const state = new AppState();
    let calls = 0;
    state.subscribe(() => { calls += 1; });
    state.setFilter("search", "helper");
    expect(state.filters.search).toBe("helper");
    expect(calls).toBe(1);
  });

  it("reset clears selection and filters and notifies once", () => {
    const state = new AppState();
    state.select("x");
    state.setFilter("showTests", false);
    let calls = 0;
    state.subscribe(() => { calls += 1; });
    state.reset();
    expect(state.selectedNodeId).toBeNull();
    expect(state.filters.showTests).toBe(true);
    expect(calls).toBe(1);
  });

  it("unsubscribe stops further notifications", () => {
    const state = new AppState();
    let calls = 0;
    const unsubscribe = state.subscribe(() => { calls += 1; });
    unsubscribe();
    state.select("x");
    expect(calls).toBe(0);
  });
});

describe("matchesFilters", () => {
  const baseFilters = {
    search: "", entityType: null, language: null, packageName: null,
    showTests: true, minEdgeWeight: 0, minRisk: 0,
  };
  const node = {
    name: "Helper", qualifiedName: "Helper", kind: "class",
    language: "typescript", packageName: "src", isTest: false, riskScore: 40,
  };

  it("matches everything with default filters", () => {
    expect(matchesFilters(node, baseFilters)).toBe(true);
  });

  it("filters by case-insensitive search across name and qualifiedName", () => {
    expect(matchesFilters(node, { ...baseFilters, search: "help" })).toBe(true);
    expect(matchesFilters(node, { ...baseFilters, search: "nomatch" })).toBe(false);
  });

  it("filters out test nodes when showTests is false", () => {
    expect(matchesFilters({ ...node, isTest: true }, { ...baseFilters, showTests: false })).toBe(false);
  });

  it("filters by minimum risk score", () => {
    expect(matchesFilters(node, { ...baseFilters, minRisk: 50 })).toBe(false);
    expect(matchesFilters(node, { ...baseFilters, minRisk: 30 })).toBe(true);
  });
});
