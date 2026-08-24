import { describe, it, expect, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM, VirtualConsole } from "jsdom";

const PACKAGE_ROOT = fileURLToPath(new URL("..", import.meta.url));
const FIXTURE_ROOT = path.join(PACKAGE_ROOT, "examples", "fixture-repo");
const CLI_PATH = path.join(PACKAGE_ROOT, "bin", "analyze.js");

describe("bin/analyze.js — standalone bundle", () => {
  const outPath = path.join(os.tmpdir(), `repo-arch-smoke-${Date.now()}.html`);

  afterAll(() => {
    fs.rmSync(outPath, { force: true });
  });

  it("runs as a plain node script against the fixture repo and writes a report", () => {
    const stdout = execFileSync("node", [CLI_PATH, "--repo", FIXTURE_ROOT, "--out", outPath, "--no-cache"], {
      encoding: "utf8",
    });
    const summary = JSON.parse(stdout);
    expect(summary.outputPath).toBe(outPath);
    expect(fs.existsSync(outPath)).toBe(true);
  });

  it("produces a report with the embedded dataset, all four chart containers, and no script errors on load", () => {
    const html = fs.readFileSync(outPath, "utf8");
    expect(html).toContain("window.__REPO_ARCH_DATA__");

    const errors: unknown[] = [];
    const virtualConsole = new VirtualConsole();
    virtualConsole.on("jsdomError", (err) => errors.push(err));

    const dom = new JSDOM(html, { runScripts: "dangerously", resources: "usable", virtualConsole });

    expect(dom.window.document.getElementById("c-map")?.querySelector("svg")).toBeTruthy();
    expect(dom.window.document.getElementById("c-graph")?.querySelector("svg")).toBeTruthy();
    expect(dom.window.document.getElementById("c-matrix")?.querySelector("svg")).toBeTruthy();
    expect(dom.window.document.getElementById("c-hot")?.querySelector("svg")).toBeTruthy();
    expect(dom.window.document.getElementById("toc")?.querySelector("a")).toBeTruthy();
    expect(errors).toEqual([]);

    dom.window.close();
  });
});

describe("bin/analyze.js — render-only with narrative", () => {
  const dataPath = path.join(os.tmpdir(), `repo-arch-smoke-data-${Date.now()}.json`);
  const narrativePath = path.join(os.tmpdir(), `repo-arch-smoke-narrative-${Date.now()}.json`);
  const narratedOutPath = path.join(os.tmpdir(), `repo-arch-smoke-narrated-${Date.now()}.html`);
  const plainOutPath = path.join(os.tmpdir(), `repo-arch-smoke-plain-${Date.now()}.html`);

  afterAll(() => {
    for (const f of [dataPath, narrativePath, narratedOutPath, plainOutPath]) fs.rmSync(f, { force: true });
  });

  it("writes a data.json file via --data-out alongside a graphs-only report", () => {
    execFileSync(
      "node",
      [CLI_PATH, "--repo", FIXTURE_ROOT, "--out", plainOutPath, "--data-out", dataPath, "--no-cache"],
      { encoding: "utf8" }
    );
    expect(fs.existsSync(dataPath)).toBe(true);
    const data = JSON.parse(fs.readFileSync(dataPath, "utf8"));
    expect(data.metadata.repositoryName).toBe("fixture-repo");
    const plainHtml = fs.readFileSync(plainOutPath, "utf8");
    expect(plainHtml).not.toContain('"narrative":');
  });

  it("renders a narrated report from saved data.json without re-running analysis", () => {
    fs.writeFileSync(
      narrativePath,
      JSON.stringify({
        summary: "A tiny fixture repo used for testing.",
        keyInsights: ["a.ts and b.ts import each other, forming a cycle."],
        readingList: [{ path: "a.ts", reason: "Part of the only cycle in this fixture." }],
        views: {
          repoMap: "The map shows a handful of top-level files.",
          depMatrix: "One cycle is visible between a.ts and b.ts.",
          hotspots: "No file crosses the default risk threshold in this tiny fixture.",
        },
      })
    );

    const stdout = execFileSync(
      "node",
      [CLI_PATH, "--render-only", "--data", dataPath, "--narrative", narrativePath, "--out", narratedOutPath],
      { encoding: "utf8" }
    );
    expect(JSON.parse(stdout).outputPath).toBe(narratedOutPath);

    const html = fs.readFileSync(narratedOutPath, "utf8");
    expect(html).toContain("A tiny fixture repo used for testing.");
    expect(html).toContain("a.ts and b.ts import each other, forming a cycle.");

    const errors: unknown[] = [];
    const virtualConsole = new VirtualConsole();
    virtualConsole.on("jsdomError", (err) => errors.push(err));
    const dom = new JSDOM(html, { runScripts: "dangerously", resources: "usable", virtualConsole });
    // "summary" is the Executive Summary section's id — it only renders (client-side) when a
    // narrative is attached, so its presence is the meaningful post-render check here.
    expect(dom.window.document.getElementById("summary")).toBeTruthy();
    expect(dom.window.document.getElementById("reading")).toBeTruthy();
    expect(errors).toEqual([]);
    dom.window.close();
  });

  it("never renders narrative text as executable markup, even when it looks like a script tag", () => {
    fs.writeFileSync(
      narrativePath,
      JSON.stringify({
        summary: "</script><script>window.__rkPwned = true;</script>",
        keyInsights: ["ok"],
        readingList: [{ path: "a.ts", reason: "ok" }],
        views: { repoMap: "ok", depMatrix: "ok", hotspots: "ok" },
      })
    );

    execFileSync(
      "node",
      [CLI_PATH, "--render-only", "--data", dataPath, "--narrative", narrativePath, "--out", narratedOutPath],
      { encoding: "utf8" }
    );

    const html = fs.readFileSync(narratedOutPath, "utf8");
    expect(html).not.toContain("</script><script>window.__rkPwned = true;</script>");

    const dom = new JSDOM(html, { runScripts: "dangerously", resources: "usable" });
    expect((dom.window as unknown as { __rkPwned?: boolean }).__rkPwned).toBeUndefined();
    dom.window.close();
  });
});
