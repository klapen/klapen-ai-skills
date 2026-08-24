export type ViewId = "overview" | "graph" | "symbols" | "map" | "matrix" | "hotspots";
export type GraphLevel = "file" | "folder";
export type EdgeType = "import" | "co-change";
export type ColorBy = "folder" | "risk";
export type MapMetric = "loc" | "riskScore" | "complexity" | "churn";
export type MapLayout = "icicle" | "treemap";
export type MatrixOrder = "hierarchy" | "fanIn" | "risk";

export interface AppFilters {
  search: string;
  showTests: boolean;
  hideIsolated: boolean;
  minRisk: number;
}

const DEFAULT_FILTERS: AppFilters = {
  search: "",
  showTests: true,
  hideIsolated: true,
  minRisk: 0,
};

export type Listener = () => void;

export class AppState {
  view: ViewId;
  selectedNodeId: string | null = null;
  filters: AppFilters = { ...DEFAULT_FILTERS };
  level: GraphLevel = "file";
  edgeType: EdgeType = "import";
  colorBy: ColorBy = "folder";
  metric: MapMetric = "loc";
  mapLayout: MapLayout = "icicle";
  order: MatrixOrder = "hierarchy";
  symFile: string | null = null;
  logScale = false;

  private listeners = new Set<Listener>();

  constructor(defaultView: ViewId = "graph") {
    this.view = defaultView;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    for (const listener of this.listeners) listener();
  }

  setView(view: ViewId): void {
    this.view = view;
    this.notify();
  }

  select(nodeId: string | null): void {
    this.selectedNodeId = nodeId;
    this.notify();
  }

  setFilter<K extends keyof AppFilters>(key: K, value: AppFilters[K]): void {
    this.filters[key] = value;
    this.notify();
  }

  setLevel(level: GraphLevel): void {
    this.level = level;
    this.notify();
  }

  setEdgeType(edgeType: EdgeType): void {
    this.edgeType = edgeType;
    this.notify();
  }

  setColorBy(colorBy: ColorBy): void {
    this.colorBy = colorBy;
    this.notify();
  }

  setMetric(metric: MapMetric): void {
    this.metric = metric;
    this.notify();
  }

  setMapLayout(layout: MapLayout): void {
    this.mapLayout = layout;
    this.notify();
  }

  setOrder(order: MatrixOrder): void {
    this.order = order;
    this.notify();
  }

  setSymFile(id: string | null): void {
    this.symFile = id;
    this.notify();
  }

  setLogScale(enabled: boolean): void {
    this.logScale = enabled;
    this.notify();
  }

  reset(): void {
    this.selectedNodeId = null;
    this.filters = { ...DEFAULT_FILTERS };
    this.notify();
  }
}

export interface FilterableNode {
  name: string;
  relativePath?: string;
  isTest?: boolean;
  riskScore?: number;
}

export function matchesFilters(node: FilterableNode, filters: AppFilters): boolean {
  if (filters.search) {
    const needle = filters.search.toLowerCase();
    const haystack = `${node.name} ${node.relativePath ?? ""}`.toLowerCase();
    if (!haystack.includes(needle)) return false;
  }
  if (!filters.showTests && node.isTest) return false;
  if (filters.minRisk > 0 && (node.riskScore ?? 0) < filters.minRisk) return false;
  return true;
}
