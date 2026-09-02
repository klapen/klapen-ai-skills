import * as d3 from "d3";
import type { DerivedFacts } from "./derive";

const GROUP_PALETTE = [
  "#63b3ff",
  "#8b7bff",
  "#3fb9a8",
  "#e6b450",
  "#ff8b6b",
  "#c46bd8",
  "#6ec28f",
  "#d88f6b",
  "#5f8ad4",
  "#9aa3af",
];

export interface ReportColorScales {
  group: d3.ScaleOrdinal<string, string, string>;
  risk: d3.ScaleSequential<string>;
}

export function createColorScales(facts: DerivedFacts): ReportColorScales {
  const group = d3
    .scaleOrdinal<string, string>()
    .domain(facts.groups)
    .range(facts.groups.map((_, i) => GROUP_PALETTE[i] ?? "#4b535e"))
    .unknown("#4b535e");

  const maxRisk = d3.max(facts.files, (f) => f.riskScore ?? 0) || 1;
  const risk = d3
    .scaleSequential(d3.interpolateRgbBasis(["#39424f", "#63b3ff", "#e6b450", "#ff6b6b"]))
    .domain([0, maxRisk]);

  return { group, risk };
}
