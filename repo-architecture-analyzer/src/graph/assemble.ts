import path from "node:path";
import fs from "node:fs";
import ignore from "ignore";
import { buildEntityId } from "../shared/ids";
import type { AnalyzerConfig, CodeNode, CodeEdge, UnresolvedDependency, ArchitectureRule } from "../shared/types";
import type { WalkedFile } from "../analyzers/filesystem/walk";
import type { LanguageAnalysisResult } from "../analyzers/languages/typescript";
import type { CoChangePair } from "../analyzers/git/coChange";

export interface AssembledGraph {
  nodes: CodeNode[];
  edges: CodeEdge[];
  unresolvedDependencies: UnresolvedDependency[];
}

function folderChain(relativePath: string): string[] {
  const segments = relativePath.split("/").slice(0, -1);
  return segments.map((_, i) => segments.slice(0, i + 1).join("/"));
}

function countLines(absolutePath: string): number {
  try {
    return fs.readFileSync(absolutePath, "utf8").split("\n").length;
  } catch {
    return 0;
  }
}

function topLevelSegment(relativePath: string): string {
  return relativePath.split("/")[0] ?? relativePath;
}

function resolveLayer(relativePath: string, layers: ArchitectureRule[]): string | undefined {
  for (const rule of layers) {
    if (ignore().add(rule.match).ignores(relativePath)) return rule.name;
  }
  return undefined;
}

function isAllowedDependency(sourceLayer: string, targetLayer: string, layers: ArchitectureRule[]): boolean {
  const rule = layers.find((r) => r.name === sourceLayer);
  return rule ? rule.mayDependOn.includes(targetLayer) : true;
}

export function assembleGraph(
  repoRoot: string,
  repoName: string,
  files: WalkedFile[],
  languageResults: LanguageAnalysisResult[],
  coChangePairs: CoChangePair[],
  config: AnalyzerConfig
): AssembledGraph {
  const nodes: CodeNode[] = [];
  const nodeIdByRelativePath = new Map<string, string>();
  const relativePathByFileId = new Map<string, string>();
  const folderNodeIds = new Set<string>();

  const repositoryId = buildEntityId("repository", ".");
  nodes.push({ id: repositoryId, name: repoName, relativePath: ".", kind: "repository" });

  for (const file of files) {
    let parentId = repositoryId;
    for (const folderRel of folderChain(file.relativePath)) {
      const folderId = buildEntityId("folder", folderRel);
      if (!folderNodeIds.has(folderId)) {
        folderNodeIds.add(folderId);
        const parentFolderRel = folderRel.split("/").slice(0, -1).join("/");
        nodes.push({
          id: folderId,
          parentId: parentFolderRel ? buildEntityId("folder", parentFolderRel) : repositoryId,
          name: folderRel.split("/").pop() ?? folderRel,
          relativePath: folderRel,
          kind: "folder",
        });
      }
      parentId = folderId;
    }

    const fileId = buildEntityId("file", file.relativePath);
    nodeIdByRelativePath.set(file.relativePath, fileId);
    relativePathByFileId.set(fileId, file.relativePath);
    nodes.push({
      id: fileId,
      parentId,
      name: file.relativePath.split("/").pop() ?? file.relativePath,
      relativePath: file.relativePath,
      kind: "file",
      language: file.language ?? undefined,
      layer: resolveLayer(file.relativePath, config.layers),
      isTest: file.classification === "test",
      isGenerated: file.classification === "generated",
      loc: countLines(file.absolutePath),
      packageName: topLevelSegment(file.relativePath),
    });
  }

  // Entities are processed in two passes rather than one, deliberately deviating from a
  // single-pass "register id, then look up parent" approach. The Python analyzer
  // (src/analyzers/languages/python.ts) closes nested definitions in LIFO order: for a
  // class with a method, it emits the method entity before the class entity (the method
  // is popped off the parsing stack first). A single pass over `result.entities` that
  // looks up the parent class's id in a map populated as-you-go would miss that lookup
  // for such methods (the class id isn't registered yet) and silently fall back to
  // parenting the method under the file instead of the class. Registering every entity's
  // id first, then resolving parentId in a second pass, makes the graph's parentId chain
  // correct regardless of entity emission order.
  const entityIdByQualifiedName = new Map<string, string>();
  for (const result of languageResults) {
    for (const entity of result.entities) {
      const fileId = nodeIdByRelativePath.get(entity.relativePath);
      if (!fileId) continue;
      const entityId = buildEntityId(entity.kind, entity.relativePath, entity.qualifiedName);
      entityIdByQualifiedName.set(`${entity.relativePath}#${entity.qualifiedName}`, entityId);
    }
  }

  for (const result of languageResults) {
    for (const entity of result.entities) {
      const fileId = nodeIdByRelativePath.get(entity.relativePath);
      if (!fileId) continue;
      const entityId = entityIdByQualifiedName.get(`${entity.relativePath}#${entity.qualifiedName}`)!;
      const parentQualifiedName =
        entity.kind === "method" ? entity.qualifiedName.split(".").slice(0, -1).join(".") : undefined;
      const parentId = parentQualifiedName
        ? entityIdByQualifiedName.get(`${entity.relativePath}#${parentQualifiedName}`) ?? fileId
        : fileId;

      nodes.push({
        id: entityId,
        parentId,
        name: entity.name,
        qualifiedName: entity.qualifiedName,
        relativePath: entity.relativePath,
        kind: entity.kind,
        loc: entity.loc,
      });
    }
  }

  const edges: CodeEdge[] = [];
  const unresolvedDependencies: UnresolvedDependency[] = [];
  const importsByPair = new Map<string, { source: string; target: string; count: number }>();

  for (const result of languageResults) {
    for (const imp of result.imports) {
      const sourceId = nodeIdByRelativePath.get(imp.fromRelativePath);
      if (!sourceId) continue;

      if (!imp.resolvedRelativePath) {
        if (imp.specifier.startsWith(".")) {
          unresolvedDependencies.push({
            fromNodeId: sourceId,
            specifier: imp.specifier,
            reason: "Relative import could not be resolved to a file in the repository.",
          });
        }
        continue;
      }

      const targetId = nodeIdByRelativePath.get(imp.resolvedRelativePath);
      if (!targetId || targetId === sourceId) continue;

      const key = `${sourceId}->${targetId}`;
      const existing = importsByPair.get(key);
      if (existing) existing.count += 1;
      else importsByPair.set(key, { source: sourceId, target: targetId, count: 1 });
    }
  }

  const fanOutByFile = new Map<string, number>();
  const fanInByFile = new Map<string, number>();

  for (const [key, { source, target, count }] of importsByPair) {
    const sourceRel = relativePathByFileId.get(source)!;
    const targetRel = relativePathByFileId.get(target)!;
    const sourceLayer = resolveLayer(sourceRel, config.layers);
    const targetLayer = resolveLayer(targetRel, config.layers);
    const hasLayers = sourceLayer !== undefined && targetLayer !== undefined;

    edges.push({
      id: `edge:import:${key}`,
      source,
      target,
      type: "import",
      weight: count,
      occurrences: count,
      isCrossFolder: path.dirname(sourceRel) !== path.dirname(targetRel),
      isCrossPackage: topLevelSegment(sourceRel) !== topLevelSegment(targetRel),
      isCrossLayer: hasLayers ? sourceLayer !== targetLayer : undefined,
      isArchitectureViolation:
        hasLayers && sourceLayer !== targetLayer
          ? !isAllowedDependency(sourceLayer!, targetLayer!, config.layers)
          : undefined,
    });
    fanOutByFile.set(source, (fanOutByFile.get(source) ?? 0) + 1);
    fanInByFile.set(target, (fanInByFile.get(target) ?? 0) + 1);
  }

  for (const pair of coChangePairs) {
    const sourceId = nodeIdByRelativePath.get(pair.fileA);
    const targetId = nodeIdByRelativePath.get(pair.fileB);
    if (!sourceId || !targetId) continue;
    edges.push({
      id: `edge:co-change:${sourceId}->${targetId}`,
      source: sourceId,
      target: targetId,
      type: "co-change",
      weight: pair.commits,
      occurrences: pair.commits,
      confidence: pair.confidence,
    });
  }

  for (const node of nodes) {
    if (node.kind !== "file") continue;
    node.fanIn = fanInByFile.get(node.id) ?? 0;
    node.fanOut = fanOutByFile.get(node.id) ?? 0;
    const total = node.fanIn + node.fanOut;
    node.instability = total === 0 ? 0 : node.fanOut / total;
  }

  return { nodes, edges, unresolvedDependencies };
}
