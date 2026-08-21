import { describe, it, expect, vi, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs, main } from "../src/cli";

const FIXTURE_ROOT = fileURLToPath(new URL("../examples/fixture-repo", import.meta.url));

describe("parseArgs", () => {
  it("parses repo, out, and boolean flags", () => {
    const args = parseArgs(["--repo", "/tmp/x", "--out", "/tmp/y.html", "--no-cache", "--force"]);
    expect(args.repo).toBe(path.resolve("/tmp/x"));
    expect(args.out).toBe("/tmp/y.html");
    expect(args.noCache).toBe(true);
    expect(args.force).toBe(true);
  });

  it("accumulates repeated --include/--exclude flags", () => {
    const args = parseArgs(["--include", "a/**", "--include", "b/**", "--exclude", "c/**"]);
    expect(args.include).toEqual(["a/**", "b/**"]);
    expect(args.exclude).toEqual(["c/**"]);
  });

  it("throws on an unknown flag", () => {
    expect(() => parseArgs(["--bogus"])).toThrow(/Unknown argument/);
  });
});

describe("main", () => {
  const outputs: string[] = [];
  afterEach(() => {
    for (const f of outputs.splice(0)) fs.rmSync(f, { force: true });
  });

  it("writes a report file and prints a JSON summary to stdout", () => {
    const outPath = path.join(os.tmpdir(), `repo-arch-cli-${Date.now()}.html`);
    outputs.push(outPath);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    main(["--repo", FIXTURE_ROOT, "--out", outPath, "--no-cache"]);

    expect(fs.existsSync(outPath)).toBe(true);
    expect(fs.readFileSync(outPath, "utf8")).toContain("window.__REPO_ARCH_DATA__");
    expect(logSpy).toHaveBeenCalled();
    const printed = JSON.parse(logSpy.mock.calls[0][0] as string);
    expect(printed.outputPath).toBe(outPath);

    logSpy.mockRestore();
  });
});
