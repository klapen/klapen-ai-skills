import { describe, it, expect } from "vitest";
import { AppState, matchesFilters } from "../../src/report/state";

describe("AppState", () => {
  it("defaults to the given initial view", () => {
    expect(new AppState("overview").view).toBe("overview");
    expect(new AppState("graph").view).toBe("graph");
  });

  it("notifies subscribers when the view changes", () => {
    const state = new AppState("graph");
    let calls = 0;
    state.subscribe(() => {
      calls += 1;
    });
    state.setView("map");
    expect(state.view).toBe("map");
    expect(calls).toBe(1);
  });

  it("notifies subscribers when the selection changes", () => {
    const state = new AppState();
    let calls = 0;
    state.subscribe(() => {
      calls += 1;
    });
    state.select("file:a.ts");
    expect(state.selectedNodeId).toBe("file:a.ts");
    expect(calls).toBe(1);
  });

  it("notifies subscribers when a filter changes", () => {
    const state = new AppState();
    let calls = 0;
    state.subscribe(() => {
      calls += 1;
    });
    state.setFilter("search", "helper");
    expect(state.filters.search).toBe("helper");
    expect(calls).toBe(1);
  });

  it.each([
    ["setLevel", "level", "folder"],
    ["setEdgeType", "edgeType", "co-change"],
    ["setColorBy", "colorBy", "risk"],
    ["setMetric", "metric", "riskScore"],
    ["setMapLayout", "mapLayout", "treemap"],
    ["setOrder", "order", "fanIn"],
    ["setSymFile", "symFile", "file:a.ts"],
    ["setLogScale", "logScale", true],
  ] as const)("%s updates %s and notifies once", (method, field, value) => {
    const state = new AppState();
    let calls = 0;
    state.subscribe(() => {
      calls += 1;
    });
    (state[method] as (v: unknown) => void)(value);
    expect(state[field]).toBe(value);
    expect(calls).toBe(1);
  });

  it("reset clears selection and filters and notifies once", () => {
    const state = new AppState();
    state.select("x");
    state.setFilter("showTests", false);
    let calls = 0;
    state.subscribe(() => {
      calls += 1;
    });
    state.reset();
    expect(state.selectedNodeId).toBeNull();
    expect(state.filters.showTests).toBe(true);
    expect(calls).toBe(1);
  });

  it("unsubscribe stops further notifications", () => {
    const state = new AppState();
    let calls = 0;
    const unsubscribe = state.subscribe(() => {
      calls += 1;
    });
    unsubscribe();
    state.select("x");
    expect(calls).toBe(0);
  });
});

describe("matchesFilters", () => {
  const baseFilters = { search: "", showTests: true, hideIsolated: true, minRisk: 0 };
  const node = { name: "Helper", relativePath: "src/helper.ts", isTest: false, riskScore: 40 };

  it("matches everything with default filters", () => {
    expect(matchesFilters(node, baseFilters)).toBe(true);
  });

  it("filters by case-insensitive search across name and relativePath", () => {
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
