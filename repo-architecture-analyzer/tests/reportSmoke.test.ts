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

  it("produces a report with the embedded dataset, all three view containers, and no script errors on load", () => {
    const html = fs.readFileSync(outPath, "utf8");
    expect(html).toContain("window.__REPO_ARCH_DATA__");

    const errors: unknown[] = [];
    const virtualConsole = new VirtualConsole();
    virtualConsole.on("jsdomError", (err) => errors.push(err));

    const dom = new JSDOM(html, { runScripts: "dangerously", resources: "usable", virtualConsole });

    expect(dom.window.document.getElementById("rk-repo-map")?.querySelector("svg")).toBeTruthy();
    expect(dom.window.document.getElementById("rk-dep-matrix")?.querySelector("svg")).toBeTruthy();
    expect(dom.window.document.getElementById("rk-hotspots")?.querySelector("svg")).toBeTruthy();
    expect(dom.window.document.getElementById("rk-search")).toBeTruthy();
    expect(errors).toEqual([]);

    dom.window.close();
  });
});
