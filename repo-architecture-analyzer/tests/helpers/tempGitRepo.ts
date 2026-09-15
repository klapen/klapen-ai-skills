import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

export interface TempGitRepo {
  root: string;
  commit(
    files: Record<string, string>,
    opts: { message: string; date: string; author?: string }
  ): void;
  cleanup(): void;
}

export function createTempGitRepo(): TempGitRepo {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "repo-arch-git-"));
  const run = (args: string[], env?: NodeJS.ProcessEnv) =>
    execFileSync("git", args, { cwd: root, env: { ...process.env, ...env }, stdio: "pipe" });

  run(["init", "-q"]);
  run(["config", "user.email", "fixture@example.com"]);
  run(["config", "user.name", "Fixture Bot"]);

  return {
    root,
    commit(files, opts) {
      for (const [rel, content] of Object.entries(files)) {
        const abs = path.join(root, rel);
        fs.mkdirSync(path.dirname(abs), { recursive: true });
        fs.writeFileSync(abs, content);
      }
      run(["add", "-A"]);
      const author = opts.author ?? "Fixture Bot <fixture@example.com>";
      run(["commit", "-q", "-m", opts.message, "--author", author], {
        GIT_AUTHOR_DATE: opts.date,
        GIT_COMMITTER_DATE: opts.date,
      });
    },
    cleanup() {
      fs.rmSync(root, { recursive: true, force: true });
    },
  };
}
