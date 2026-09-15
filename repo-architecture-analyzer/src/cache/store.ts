import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";

export function hashContent(content: string): string {
  return crypto.createHash("sha1").update(content).digest("hex");
}

function resolveRepoSlug(repoRoot: string): string {
  let remote: string | null = null;
  try {
    remote = execFileSync("git", ["-C", repoRoot, "remote", "get-url", "origin"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    remote = null;
  }
  const basis = remote || path.resolve(repoRoot);
  return hashContent(basis).slice(0, 16);
}

export function resolveCacheDir(repoRoot: string): string {
  return path.join(os.homedir(), ".cache", "repo-architecture-analyzer", resolveRepoSlug(repoRoot));
}

export class CacheStore {
  private readonly filePath: string;
  private data: Record<string, unknown> = {};

  constructor(cacheDir: string) {
    this.filePath = path.join(cacheDir, "cache.json");
    if (fs.existsSync(this.filePath)) {
      try {
        this.data = JSON.parse(fs.readFileSync(this.filePath, "utf8"));
      } catch {
        this.data = {};
      }
    }
  }

  get<T>(key: string): T | undefined {
    return this.data[key] as T | undefined;
  }

  set(key: string, value: unknown): void {
    this.data[key] = value;
  }

  clear(): void {
    this.data = {};
  }

  save(): void {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    fs.writeFileSync(this.filePath, JSON.stringify(this.data));
  }
}
