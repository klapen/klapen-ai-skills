import type { CodeNode, RiskWeights } from "../shared/types";

const ENTITY_KINDS = new Set(["class", "interface", "function", "method"]);

export function annotateRiskScores(nodes: CodeNode[], weights: RiskWeights): void {
  const fileNodes = nodes.filter((n) => n.kind === "file");

  const complexityByFile = new Map<string, number>();
  for (const node of nodes) {
    if (!ENTITY_KINDS.has(node.kind)) continue;
    complexityByFile.set(node.relativePath, (complexityByFile.get(node.relativePath) ?? 0) + (node.complexity ?? 0));
  }

  const maxComplexity = Math.max(1, ...fileNodes.map((n) => complexityByFile.get(n.relativePath) ?? 0));
  const maxChurn = Math.max(1, ...fileNodes.map((n) => n.churn ?? 0));
  const maxCoupling = Math.max(1, ...fileNodes.map((n) => (n.fanIn ?? 0) + (n.fanOut ?? 0)));

  for (const node of fileNodes) {
    const complexity = complexityByFile.get(node.relativePath) ?? 0;
    node.complexity = complexity;

    const normalizedComplexity = complexity / maxComplexity;
    const normalizedChurn = (node.churn ?? 0) / maxChurn;
    const normalizedCoupling = ((node.fanIn ?? 0) + (node.fanOut ?? 0)) / maxCoupling;
    const cycleParticipation = (node.cycleCount ?? 0) > 0 ? 1 : 0;
    const missingCoverage = node.coverage === undefined ? 0 : 1 - node.coverage / 100;

    const risk =
      weights.complexityWeight * normalizedComplexity +
      weights.churnWeight * normalizedChurn +
      weights.couplingWeight * normalizedCoupling +
      weights.cycleWeight * cycleParticipation +
      weights.coverageWeight * missingCoverage;

    node.riskScore = Math.round(risk * 100);
  }
}
