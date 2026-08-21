import path from "node:path";

export function normalizeRelativePath(repoRoot: string, absolutePath: string): string {
  const rel = path.relative(repoRoot, absolutePath);
  return rel.split(path.sep).join("/");
}

export function buildEntityId(
  kind: string,
  relativePath: string,
  qualifiedName?: string
): string {
  const base = `${kind}:${relativePath}`;
  return qualifiedName ? `${base}#${qualifiedName}` : base;
}
