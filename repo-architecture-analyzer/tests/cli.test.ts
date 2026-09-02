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

  it("still writes a narrative-free --data-out file even when --narrative is also passed", () => {
    const outPath = path.join(os.tmpdir(), `repo-arch-cli-out-narr-${Date.now()}.html`);
    const dataPath = path.join(os.tmpdir(), `repo-arch-cli-data-narr-${Date.now()}.json`);
    const narrativePath = path.join(os.tmpdir(), `repo-arch-cli-data-narr-narrative-${Date.now()}.json`);
    outputs.push(outPath, dataPath, narrativePath);
    fs.writeFileSync(
      narrativePath,
      JSON.stringify({
        en: {
          summary: "A tiny fixture repo.",
          keyInsights: ["ok"],
          readingList: [{ path: "a.ts", reason: "ok" }],
          views: { repoMap: "x", depMatrix: "x", hotspots: "x" },
        },
        es: {
          summary: "Un pequeño repositorio de prueba.",
          keyInsights: ["ok"],
          readingList: [{ path: "a.ts", reason: "ok" }],
          views: { repoMap: "x", depMatrix: "x", hotspots: "x" },
        },
      })
    );

    main([
      "--repo",
      FIXTURE_ROOT,
      "--out",
      outPath,
      "--data-out",
      dataPath,
      "--narrative",
      narrativePath,
      "--no-cache",
    ]);

    const data = JSON.parse(fs.readFileSync(dataPath, "utf8"));
    expect(data.narrative).toBeUndefined();

    const html = fs.readFileSync(outPath, "utf8");
    expect(html).toContain("A tiny fixture repo.");
  });

  it("creates a missing nested parent directory for --data-out", () => {
    const outPath = path.join(os.tmpdir(), `repo-arch-cli-mkdir-out-${Date.now()}.html`);
    const rootDir = path.join(os.tmpdir(), `repo-arch-cli-mkdir-${Date.now()}`);
    const dataPath = path.join(rootDir, "nested", "deeper", "data.json");
    outputs.push(outPath);

    expect(fs.existsSync(rootDir)).toBe(false);

    try {
      main(["--repo", FIXTURE_ROOT, "--out", outPath, "--data-out", dataPath, "--no-cache"]);
      expect(fs.existsSync(dataPath)).toBe(true);
    } finally {
      fs.rmSync(rootDir, { recursive: true, force: true });
    }
  });
});

describe("parseArgs — missing flag values", () => {
  it("throws when --narrative is the last argument with no value", () => {
    expect(() => parseArgs(["--narrative"])).toThrow(/Missing value/);
  });

  it("throws when --data-out is the last argument with no value", () => {
    expect(() => parseArgs(["--data-out"])).toThrow(/Missing value/);
  });
});

describe("main — output determinism between direct render and data-out/render-only round trip", () => {
  const outputs: string[] = [];
  afterEach(() => {
    for (const f of outputs.splice(0)) fs.rmSync(f, { force: true });
  });

  function stripGeneratedAt(html: string): string {
    return html.replace(/"generatedAt":"[^"]*"/g, '"generatedAt":"<normalized>"');
  }

  it("produces byte-identical HTML (ignoring generatedAt) via a direct render and a data-out + render-only round trip", () => {
    const directPath = path.join(os.tmpdir(), `repo-arch-cli-determinism-direct-${Date.now()}.html`);
    const throwawayPath = path.join(os.tmpdir(), `repo-arch-cli-determinism-throwaway-${Date.now()}.html`);
    const dataPath = path.join(os.tmpdir(), `repo-arch-cli-determinism-data-${Date.now()}.json`);
    const roundTripPath = path.join(os.tmpdir(), `repo-arch-cli-determinism-roundtrip-${Date.now()}.html`);
    outputs.push(directPath, throwawayPath, dataPath, roundTripPath);

    main(["--repo", FIXTURE_ROOT, "--out", directPath, "--no-cache"]);
    main(["--repo", FIXTURE_ROOT, "--out", throwawayPath, "--data-out", dataPath, "--no-cache"]);
    main(["--render-only", "--data", dataPath, "--out", roundTripPath]);

    const directHtml = stripGeneratedAt(fs.readFileSync(directPath, "utf8"));
    const roundTripHtml = stripGeneratedAt(fs.readFileSync(roundTripPath, "utf8"));
    expect(roundTripHtml).toBe(directHtml);
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
        en: {
          summary: "A tiny fixture repo.",
          keyInsights: ["a.ts and b.ts form a cycle."],
          readingList: [{ path: "a.ts", reason: "Part of the only cycle." }],
          views: { repoMap: "x", depMatrix: "x", hotspots: "x" },
        },
        es: {
          summary: "Un pequeño repositorio de prueba.",
          keyInsights: ["a.ts y b.ts forman un ciclo."],
          readingList: [{ path: "a.ts", reason: "Parte del único ciclo." }],
          views: { repoMap: "x", depMatrix: "x", hotspots: "x" },
        },
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

describe("parseArgs — render-only flags", () => {
  it("parses --render-only and --data", () => {
    const args = parseArgs(["--render-only", "--data", "/tmp/data.json"]);
    expect(args.renderOnly).toBe(true);
    expect(args.data).toBe("/tmp/data.json");
  });
});

describe("main — --render-only", () => {
  const outputs: string[] = [];
  afterEach(() => {
    for (const f of outputs.splice(0)) fs.rmSync(f, { force: true });
  });

  it("renders a report from a saved data.json without re-running analysis", () => {
    const dataPath = path.join(os.tmpdir(), `repo-arch-render-data-${Date.now()}.json`);
    const throwawayPath = path.join(os.tmpdir(), `repo-arch-render-throwaway-${Date.now()}.html`);
    const outPath = path.join(os.tmpdir(), `repo-arch-render-out-${Date.now()}.html`);
    outputs.push(dataPath, throwawayPath, outPath);

    main(["--repo", FIXTURE_ROOT, "--out", throwawayPath, "--data-out", dataPath, "--no-cache"]);
    main(["--render-only", "--data", dataPath, "--out", outPath]);

    expect(fs.existsSync(outPath)).toBe(true);
    const html = fs.readFileSync(outPath, "utf8");
    expect(html).toContain("window.__REPO_ARCH_DATA__");
    // Narrative content only renders client-side once the bundled runtime JS executes, so a
    // raw-string check can't look for rendered markup here — check the embedded JSON payload
    // itself has no "narrative" key instead (JSON.stringify omits an undefined property).
    expect(html).not.toContain('"narrative":');
  });

  it("attaches narrative when --narrative is also passed", () => {
    const dataPath = path.join(os.tmpdir(), `repo-arch-render-narr-data-${Date.now()}.json`);
    const throwawayPath = path.join(os.tmpdir(), `repo-arch-render-narr-throwaway-${Date.now()}.html`);
    const narrativePath = path.join(os.tmpdir(), `repo-arch-render-narr-narrative-${Date.now()}.json`);
    const outPath = path.join(os.tmpdir(), `repo-arch-render-narr-out-${Date.now()}.html`);
    outputs.push(dataPath, throwawayPath, narrativePath, outPath);

    main(["--repo", FIXTURE_ROOT, "--out", throwawayPath, "--data-out", dataPath, "--no-cache"]);
    fs.writeFileSync(
      narrativePath,
      JSON.stringify({
        en: {
          summary: "A tiny fixture repo.",
          keyInsights: ["ok"],
          readingList: [{ path: "a.ts", reason: "ok" }],
          views: { repoMap: "x", depMatrix: "x", hotspots: "x" },
        },
        es: {
          summary: "Un pequeño repositorio de prueba.",
          keyInsights: ["ok"],
          readingList: [{ path: "a.ts", reason: "ok" }],
          views: { repoMap: "x", depMatrix: "x", hotspots: "x" },
        },
      })
    );

    main(["--render-only", "--data", dataPath, "--narrative", narrativePath, "--out", outPath]);

    // Narrative content renders client-side, not into the raw HTML string, so assert against
    // the embedded JSON payload instead of looking for rendered markup.
    const html = fs.readFileSync(outPath, "utf8");
    expect(html).toContain("A tiny fixture repo.");
  });

  it("throws when --data is missing", () => {
    expect(() => main(["--render-only", "--out", "/tmp/x.html"])).toThrow(/requires --data/);
  });

  it("throws when --out is missing", () => {
    expect(() => main(["--render-only", "--data", "/tmp/whatever.json"])).toThrow(/requires --out/);
  });
});
