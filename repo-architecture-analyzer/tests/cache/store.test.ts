import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { hashContent, resolveCacheDir, CacheStore } from "../../src/cache/store";

describe("hashContent", () => {
  it("is deterministic and content-sensitive", () => {
    expect(hashContent("a")).toBe(hashContent("a"));
    expect(hashContent("a")).not.toBe(hashContent("b"));
  });
});

describe("resolveCacheDir", () => {
  it("is deterministic per repo root, differs across roots, and lives under ~/.cache", () => {
    const tmpA = fs.mkdtempSync(path.join(os.tmpdir(), "repo-arch-cache-a-"));
    const tmpB = fs.mkdtempSync(path.join(os.tmpdir(), "repo-arch-cache-b-"));

    expect(resolveCacheDir(tmpA)).toBe(resolveCacheDir(tmpA));
    expect(resolveCacheDir(tmpA)).not.toBe(resolveCacheDir(tmpB));
    expect(resolveCacheDir(tmpA).startsWith(path.join(os.homedir(), ".cache", "repo-architecture-analyzer"))).toBe(true);

    fs.rmSync(tmpA, { recursive: true, force: true });
    fs.rmSync(tmpB, { recursive: true, force: true });
  });
});

describe("CacheStore", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
  });

  it("starts empty when no cache file exists yet", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "repo-arch-store-"));
    dirs.push(dir);
    expect(new CacheStore(dir).get("missing")).toBeUndefined();
  });

  it("persists values across instances after save()", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "repo-arch-store-"));
    dirs.push(dir);

    const first = new CacheStore(dir);
    first.set("git:abc123", { commitsAnalyzed: 42 });
    first.save();

    const second = new CacheStore(dir);
    expect(second.get<{ commitsAnalyzed: number }>("git:abc123")).toEqual({ commitsAnalyzed: 42 });
  });
});
