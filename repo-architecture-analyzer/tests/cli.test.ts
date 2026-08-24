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

describe("parseArgs — narrative flags", () => {
  it("parses --data-out and --narrative", () => {
    const args = parseArgs(["--data-out", "/tmp/data.json", "--narrative", "/tmp/narrative.json"]);
    expect(args.dataOut).toBe("/tmp/data.json");
    expect(args.narrative).toBe("/tmp/narrative.json");
  });
});

describe("main — --data-out", () => {
  const outputs: string[] = [];
  afterEach(() => {
    for (const f of outputs.splice(0)) fs.rmSync(f, { force: true });
  });

  it("writes the full RepositoryData JSON to --data-out, without a narrative field", () => {
    const outPath = path.join(os.tmpdir(), `repo-arch-cli-out-${Date.now()}.html`);
    const dataPath = path.join(os.tmpdir(), `repo-arch-cli-data-${Date.now()}.json`);
    outputs.push(outPath, dataPath);

    main(["--repo", FIXTURE_ROOT, "--out", outPath, "--data-out", dataPath, "--no-cache"]);

    expect(fs.existsSync(dataPath)).toBe(true);
    const data = JSON.parse(fs.readFileSync(dataPath, "utf8"));
    expect(data.metadata.repositoryName).toBe("fixture-repo");
    expect(data.narrative).toBeUndefined();
  });
});

describe("main — --narrative", () => {
  const outputs: string[] = [];
  afterEach(() => {
    for (const f of outputs.splice(0)) fs.rmSync(f, { force: true });
  });

  it("attaches and validates a narrative, embedding it in the report", () => {
    const outPath = path.join(os.tmpdir(), `repo-arch-cli-narrated-${Date.now()}.html`);
    const narrativePath = path.join(os.tmpdir(), `repo-arch-cli-narrative-${Date.now()}.json`);
    outputs.push(outPath, narrativePath);
    fs.writeFileSync(
      narrativePath,
      JSON.stringify({
        summary: "A tiny fixture repo.",
        keyInsights: ["a.ts and b.ts form a cycle."],
        readingList: [{ path: "a.ts", reason: "Part of the only cycle." }],
        views: { repoMap: "x", depMatrix: "x", hotspots: "x" },
      })
    );

    main(["--repo", FIXTURE_ROOT, "--out", outPath, "--narrative", narrativePath, "--no-cache"]);

    const html = fs.readFileSync(outPath, "utf8");
    expect(html).toContain("A tiny fixture repo.");
  });

  it("throws when the narrative file fails schema validation", () => {
    const outPath = path.join(os.tmpdir(), `repo-arch-cli-bad-narrated-${Date.now()}.html`);
    const narrativePath = path.join(os.tmpdir(), `repo-arch-cli-bad-narrative-${Date.now()}.json`);
    outputs.push(outPath, narrativePath);
    fs.writeFileSync(narrativePath, JSON.stringify({ summary: "missing other required fields" }));

    expect(() =>
      main(["--repo", FIXTURE_ROOT, "--out", outPath, "--narrative", narrativePath, "--no-cache"])
    ).toThrow(/failed schema validation/);
  });
});
