export type NodeKind =
  | "repository"
  | "workspace"
  | "package"
  | "folder"
  | "file"
  | "class"
  | "interface"
  | "function"
  | "method"
  | "module"
  | "component"
  | "other";

export interface CodeNode {
  id: string;
  parentId?: string;
  name: string;
  qualifiedName?: string;
  relativePath: string;
  kind: NodeKind;
  language?: string;
  layer?: string;
  packageName?: string;
  isTest?: boolean;
  isGenerated?: boolean;
  loc?: number;
  complexity?: number;
  nestingDepth?: number;
  fanIn?: number;
  fanOut?: number;
  instability?: number;
  centrality?: number;
  coverage?: number;
  commitCount?: number;
  churn?: number;
  contributorCount?: number;
  lastModified?: string;
  cycleCount?: number;
  riskScore?: number;
}

export type EdgeType =
  | "import"
  | "call"
  | "inheritance"
  | "implementation"
  | "type-reference"
  | "package-dependency"
  | "co-change";

export interface CodeEdge {
  id: string;
  source: string;
  target: string;
  type: EdgeType;
  weight: number;
  occurrences?: number;
  confidence?: number;
  isCrossFolder?: boolean;
  isCrossPackage?: boolean;
  isCrossLayer?: boolean;
  isArchitectureViolation?: boolean;
}

export interface DependencyCycle {
  id: string;
  nodeIds: string[];
}

export interface Community {
  id: string;
  label?: string;
  nodeIds: string[];
}

export interface UnresolvedDependency {
  fromNodeId: string;
  specifier: string;
  reason: string;
}

export interface ArchitectureRule {
  name: string;
  match: string[];
  mayDependOn: string[];
}

export interface AnalysisWarning {
  level: "info" | "warn" | "error";
  message: string;
  relativePath?: string;
}

export interface ParserCoverage {
  full: number;
  partial: number;
  skipped: number;
  failed: number;
}

export interface RepositoryMetadata {
  schemaVersion: string;
  generatedAt: string;
  repositoryName: string;
  repositoryRoot?: string;
  gitCommit?: string;
  gitBranch?: string;
  isDirty?: boolean;
  languages: string[];
  analyzerVersion: string;
  configurationHash: string;
  parserCoverage: ParserCoverage;
}

export interface RepositorySummary {
  files: number;
  sourceFiles: number;
  testFiles: number;
  entities: number;
  linesOfCode: number;
  dependencyEdges: number;
  cycles: number;
  architectureViolations: number;
  hotspots: number;
}

export interface RepositoryData {
  metadata: RepositoryMetadata;
  summary: RepositorySummary;
  nodes: CodeNode[];
  edges: CodeEdge[];
  cycles: DependencyCycle[];
  communities: Community[];
  unresolvedDependencies: UnresolvedDependency[];
  architectureRules: ArchitectureRule[];
  warnings: AnalysisWarning[];
}

export interface GitConfig {
  since: string;
  maxCommits: number;
  coChangeMinimumCommits: number;
  coChangeMinimumConfidence: number;
  bulkCommitFileThreshold: number;
  bulkCommitWeight: number;
  lockfilePatterns: string[];
}

export interface RiskWeights {
  complexityWeight: number;
  churnWeight: number;
  couplingWeight: number;
  cycleWeight: number;
  coverageWeight: number;
}

export interface AnalyzerConfig {
  // Reserved for future use (v2) — not read anywhere in v1. The intent is to let a config
  // scope analysis to specific top-level source directories in a monorepo, but nothing wires
  // it up yet; `include`/`exclude` are the only filters that currently take effect.
  sourceRoots: string[];
  testRoots: string[];
  include: string[];
  exclude: string[];
  layers: ArchitectureRule[];
  git: GitConfig;
  risk: RiskWeights;
  cache: { enabled: boolean };
}
