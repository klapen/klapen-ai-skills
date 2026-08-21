export interface AppFilters {
  search: string;
  entityType: string | null;
  language: string | null;
  packageName: string | null;
  showTests: boolean;
  minEdgeWeight: number;
  minRisk: number;
}

const DEFAULT_FILTERS: AppFilters = {
  search: "",
  entityType: null,
  language: null,
  packageName: null,
  showTests: true,
  minEdgeWeight: 0,
  minRisk: 0,
};

export type Listener = () => void;

export class AppState {
  selectedNodeId: string | null = null;
  filters: AppFilters = { ...DEFAULT_FILTERS };

  private listeners = new Set<Listener>();

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    for (const listener of this.listeners) listener();
  }

  select(nodeId: string | null): void {
    this.selectedNodeId = nodeId;
    this.notify();
  }

  setFilter<K extends keyof AppFilters>(key: K, value: AppFilters[K]): void {
    this.filters[key] = value;
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
  qualifiedName?: string;
  kind: string;
  language?: string;
  packageName?: string;
  isTest?: boolean;
  riskScore?: number;
}

export function matchesFilters(node: FilterableNode, filters: AppFilters): boolean {
  if (filters.search) {
    const needle = filters.search.toLowerCase();
    const haystack = `${node.name} ${node.qualifiedName ?? ""}`.toLowerCase();
    if (!haystack.includes(needle)) return false;
  }
  if (filters.entityType && node.kind !== filters.entityType) return false;
  if (filters.language && node.language !== filters.language) return false;
  if (filters.packageName && node.packageName !== filters.packageName) return false;
  if (!filters.showTests && node.isTest) return false;
  if (filters.minRisk > 0 && (node.riskScore ?? 0) < filters.minRisk) return false;
  return true;
}
