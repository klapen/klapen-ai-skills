import type { CodeNode, CodeEdge, DependencyCycle } from "../shared/types";

export function findCycles(nodes: CodeNode[], edges: CodeEdge[]): DependencyCycle[] {
  const adjacency = new Map<string, string[]>();
  for (const node of nodes) adjacency.set(node.id, []);
  for (const edge of edges) {
    if (edge.type !== "import") continue;
    adjacency.get(edge.source)?.push(edge.target);
  }

  let index = 0;
  const indices = new Map<string, number>();
  const lowlink = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const cycles: DependencyCycle[] = [];
  let cycleCounter = 0;

  function strongConnect(v: string): void {
    indices.set(v, index);
    lowlink.set(v, index);
    index += 1;
    stack.push(v);
    onStack.add(v);

    for (const w of adjacency.get(v) ?? []) {
      if (!indices.has(w)) {
        strongConnect(w);
        lowlink.set(v, Math.min(lowlink.get(v)!, lowlink.get(w)!));
      } else if (onStack.has(w)) {
        lowlink.set(v, Math.min(lowlink.get(v)!, indices.get(w)!));
      }
    }

    if (lowlink.get(v) === indices.get(v)) {
      const component: string[] = [];
      let w: string;
      do {
        w = stack.pop()!;
        onStack.delete(w);
        component.push(w);
      } while (w !== v);

      if (component.length > 1) {
        cycleCounter += 1;
        cycles.push({ id: `cycle:${cycleCounter}`, nodeIds: component });
      }
    }
  }

  for (const node of nodes) {
    if (!indices.has(node.id)) strongConnect(node.id);
  }

  return cycles;
}

export function annotateCycleCounts(nodes: CodeNode[], cycles: DependencyCycle[]): void {
  const countByNodeId = new Map<string, number>();
  for (const cycle of cycles) {
    for (const nodeId of cycle.nodeIds) {
      countByNodeId.set(nodeId, (countByNodeId.get(nodeId) ?? 0) + 1);
    }
  }
  for (const node of nodes) {
    const count = countByNodeId.get(node.id);
    if (count !== undefined) node.cycleCount = count;
  }
}
