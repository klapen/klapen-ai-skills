#!/usr/bin/env python3
"""RickOS renderer for the rick-explain-diff-html skill.

Two subcommands:

    render.py collect --target <ref-or-url>
        Resolve a diff target (branch, range, PR/MR URL) and print a
        JSON blob to stdout with:
            {
                "slug": "<derived filename slug>",
                "diff": "<git diff text>",
                "pr": {"title", "body", "comments"} | null,
                "provider": "github" | "gitlab" | "local"
            }
        Also persists the raw diff to /tmp/rick-diff-<slug>.diff for the
        render step to parse mechanically.

        Claude consumes the JSON (and/or the .diff file), then writes:
            /tmp/rick-payload-<slug>.json    (payload for the report)
            /tmp/rick-sections-<slug>.html   (2 HTML section fragments,
                                              delimited by
                                              <!-- SECTION: name -->)

    render.py render --payload <json> --sections <html> --diff <path>
                     [--slug <name>] [--theme <name>] [--chrome <name>]
                     [--seed <int>] [--no-open]
        Assemble the final HTML from the template + assets + Claude's
        payload/sections, merged with a mechanical parse of the raw
        diff (per-file line-by-line content, stats, shape data — none
        of which cost Claude any tokens). Writes to
        /tmp/YYYY-MM-DD-explanation-<slug>.html and (by default) opens
        it in the user's browser.
"""

import argparse
import datetime
import json
import os
import random
import re
import subprocess
import sys
import urllib.parse
import urllib.request
from pathlib import Path


HERE = Path(__file__).resolve().parent
SKILL_DIR = HERE.parent
TEMPLATE_DIR = SKILL_DIR / "template"
ASSETS_DIR = SKILL_DIR / "assets"

MAX_LINES_PER_FILE = 300


# ---------------------------------------------------------------------
# Utilities
# ---------------------------------------------------------------------

def eprint(*args, **kwargs):
    print(*args, file=sys.stderr, **kwargs)


def run(cmd, check=True, capture=True):
    result = subprocess.run(
        cmd,
        check=False,
        stdout=subprocess.PIPE if capture else None,
        stderr=subprocess.PIPE if capture else None,
        text=True,
    )
    if check and result.returncode != 0:
        raise RuntimeError(
            f"Command failed ({result.returncode}): {' '.join(cmd)}\n"
            f"stderr: {(result.stderr or '').strip()}"
        )
    return result


def has_cmd(name):
    from shutil import which
    return which(name) is not None


def slugify(s, fallback="report"):
    s = re.sub(r"[^a-zA-Z0-9]+", "-", (s or "").strip()).strip("-").lower()
    return s or fallback


def file_dom_id(path):
    """Must match core.js's fileDomId() exactly."""
    s = re.sub(r"[^a-z0-9]+", "-", (path or "").lower()).strip("-")
    return "f-" + s


# ---------------------------------------------------------------------
# `collect` subcommand
# ---------------------------------------------------------------------

GITHUB_URL_RE = re.compile(
    r"https?://github\.com/(?P<owner>[^/]+)/(?P<repo>[^/]+)/pull/(?P<num>\d+)"
)
GITLAB_URL_RE = re.compile(
    r"https?://(?P<host>[^/]+)/(?P<path>.+)/-/merge_requests/(?P<num>\d+)"
)


def resolve_current_branch_diff():
    branch = run(["git", "rev-parse", "--abbrev-ref", "HEAD"]).stdout.strip()
    base = None
    for candidate in ("origin/HEAD", "origin/main", "origin/master", "main", "master", "develop"):
        r = run(["git", "rev-parse", "--verify", "-q", candidate], check=False)
        if r.returncode == 0:
            base = r.stdout.strip()
            break
    if not base:
        raise RuntimeError("Could not find a base branch. Portal Rick disapproves. *urp*")
    merge_base = run(["git", "merge-base", base, "HEAD"]).stdout.strip()
    diff = run(["git", "diff", merge_base + "..HEAD"]).stdout
    return branch, diff


def resolve_range_diff(range_spec):
    diff = run(["git", "diff", range_spec]).stdout
    slug = slugify(range_spec.replace("..", "-to-"), fallback="range")
    return slug, diff


def resolve_branch_diff(branch_name):
    base = None
    for candidate in ("origin/HEAD", "origin/main", "origin/master", "main", "master"):
        r = run(["git", "rev-parse", "--verify", "-q", candidate], check=False)
        if r.returncode == 0:
            base = r.stdout.strip()
            break
    if not base:
        raise RuntimeError("Could not find a base branch to compare against.")
    merge_base = run(["git", "merge-base", base, branch_name]).stdout.strip()
    diff = run(["git", "diff", merge_base + ".." + branch_name]).stdout
    return branch_name, diff


def resolve_github_pr(url):
    m = GITHUB_URL_RE.match(url)
    if not m:
        raise RuntimeError("Not a valid GitHub PR URL.")
    repo = f"{m['owner']}/{m['repo']}"
    pr_num = m["num"]
    slug = slugify(f"{m['repo']}-pr-{pr_num}")
    pr_meta = None
    if has_cmd("gh"):
        base = ["gh", "-R", repo, "pr"]
        try:
            meta = run(base + ["view", pr_num, "--json", "title,body,comments"]).stdout
            pr_meta = json.loads(meta)
        except Exception as e:
            eprint(f"gh pr view failed: {e}")
        try:
            diff = run(base + ["diff", pr_num]).stdout
            return slug, diff, pr_meta, "github"
        except Exception as e:
            eprint(f"gh pr diff failed: {e}")

    diff_url = url.rstrip("/") + ".diff"
    try:
        with urllib.request.urlopen(diff_url, timeout=15) as resp:
            diff = resp.read().decode("utf-8", errors="replace")
    except Exception as e:
        raise RuntimeError(
            "Could not fetch the PR diff. Install `gh` for authenticated access. "
            f"({e})"
        )
    return slug, diff, pr_meta, "github"


def resolve_gitlab_mr(url):
    m = GITLAB_URL_RE.match(url)
    if not m:
        raise RuntimeError("Not a valid GitLab MR URL.")
    repo_path = m["path"]
    mr_num = m["num"]
    slug = slugify(f"{repo_path.split('/')[-1]}-mr-{mr_num}")
    pr_meta = None
    if has_cmd("glab"):
        base = ["glab", "-R", repo_path, "mr"]
        try:
            meta = run(base + ["view", mr_num, "--output", "json"]).stdout
            data = json.loads(meta)
            pr_meta = {
                "title": data.get("title"),
                "body": data.get("description"),
                "comments": data.get("notes", []),
            }
        except Exception as e:
            eprint(f"glab mr view failed: {e}")
        try:
            diff = run(base + ["diff", mr_num]).stdout
            return slug, diff, pr_meta, "gitlab"
        except Exception as e:
            eprint(f"glab mr diff failed: {e}")

    diff_url = url.rstrip("/") + ".diff"
    try:
        with urllib.request.urlopen(diff_url, timeout=15) as resp:
            diff = resp.read().decode("utf-8", errors="replace")
    except Exception as e:
        raise RuntimeError(
            "Could not fetch the MR diff. Install `glab` for authenticated access. "
            f"({e})"
        )
    return slug, diff, pr_meta, "gitlab"


def cmd_collect(args):
    target = args.target
    try:
        if target is None or target == "":
            slug, diff = resolve_current_branch_diff()
            payload = {"slug": slugify(slug), "diff": diff, "pr": None, "provider": "local"}
        elif GITHUB_URL_RE.match(target or ""):
            slug, diff, meta, provider = resolve_github_pr(target)
            payload = {"slug": slug, "diff": diff, "pr": meta, "provider": provider}
        elif GITLAB_URL_RE.match(target or ""):
            slug, diff, meta, provider = resolve_gitlab_mr(target)
            payload = {"slug": slug, "diff": diff, "pr": meta, "provider": provider}
        elif ".." in target:
            slug, diff = resolve_range_diff(target)
            payload = {"slug": slug, "diff": diff, "pr": None, "provider": "local"}
        else:
            slug, diff = resolve_branch_diff(target)
            payload = {"slug": slugify(slug), "diff": diff, "pr": None, "provider": "local"}
    except Exception as e:
        err = {"error": str(e), "hint": "L-listen, fix your target string, *urp*"}
        print(json.dumps(err))
        return 1

    diff_path = Path(f"/tmp/rick-diff-{payload['slug']}.diff")
    diff_path.write_text(payload["diff"], encoding="utf-8")
    payload["diff_path"] = str(diff_path)

    print(json.dumps(payload))
    return 0


# ---------------------------------------------------------------------
# Unified-diff parser (mechanical — costs Claude zero tokens)
# ---------------------------------------------------------------------

DIFF_GIT_RE = re.compile(r"^diff --git a/(.*) b/(.*)$")
HUNK_RE = re.compile(r"^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@")


def normalize_diff(diff_text):
    """Ensure each file section starts with a `diff --git a/<p> b/<p>` header.

    `git diff` and `gh pr diff` always emit that header. `glab mr diff`
    (and some raw-URL `.diff` sources) don't — they jump straight from
    one file's `+++` to the next file's `---`. Synthesize the missing
    headers so `parse_unified_diff` can see file boundaries either way.
    """
    if "\ndiff --git " in ("\n" + diff_text):
        return diff_text  # already git-format; leave alone
    lines = diff_text.split("\n")
    out = []
    i = 0
    n = len(lines)
    while i < n:
        line = lines[i]
        if (
            line.startswith("--- ")
            and i + 1 < n
            and lines[i + 1].startswith("+++ ")
        ):
            a = line[4:].strip()
            b = lines[i + 1][4:].strip()
            path_a = a[2:] if a.startswith("a/") else a
            path_b = b[2:] if b.startswith("b/") else b
            # Prefer the non-/dev/null side for the synthetic path.
            path = path_b if path_b != "/dev/null" else path_a
            out.append("diff --git a/{p} b/{p}".format(p=path))
        out.append(line)
        i += 1
    return "\n".join(out)


def parse_unified_diff(diff_text, max_lines=MAX_LINES_PER_FILE):
    """Parse a unified git diff into a list of per-file dicts:
        {path, status, adds, dels, lines: [{num, sign, text}], truncated}
    Line numbering is single-gutter: '-' lines show the old line number,
    '+'/context lines show the new line number.
    """
    diff_text = normalize_diff(diff_text)
    lines = diff_text.split("\n")
    files = []
    i = 0
    n = len(lines)

    while i < n:
        m = DIFF_GIT_RE.match(lines[i])
        if not m:
            i += 1
            continue
        a_path, b_path = m.group(1), m.group(2)
        i += 1

        status = "EDIT"
        binary = False
        path = b_path

        # Header lines between "diff --git" and the first hunk (or next file).
        while i < n and not lines[i].startswith("@@") and not DIFF_GIT_RE.match(lines[i]):
            line = lines[i]
            if line.startswith("new file mode"):
                status = "NEW"
            elif line.startswith("deleted file mode"):
                status = "DELETED"
                path = a_path
            elif line.startswith("rename from"):
                status = "RENAMED"
            elif line.startswith("rename to "):
                path = line[len("rename to "):].strip()
            elif line.startswith("Binary files") or line.startswith("GIT binary patch"):
                binary = True
            elif line.startswith("+++ "):
                p = line[4:].strip()
                if p not in ("/dev/null",):
                    path = p[2:] if p.startswith("b/") else p
            elif line.startswith("--- "):
                p = line[4:].strip()
                if status == "DELETED" and p not in ("/dev/null",):
                    path = p[2:] if p.startswith("a/") else p
            i += 1

        file_lines = []
        adds = 0
        dels = 0

        while i < n and lines[i].startswith("@@"):
            hm = HUNK_RE.match(lines[i])
            if not hm:
                i += 1
                continue
            old_ln = int(hm.group(1))
            new_ln = int(hm.group(3))
            i += 1
            while i < n and not lines[i].startswith("@@") and not DIFF_GIT_RE.match(lines[i]):
                line = lines[i]
                if line.startswith("\\"):
                    i += 1
                    continue
                if line == "" :
                    i += 1
                    continue
                tag = line[0]
                text = line[1:]
                if tag == "+":
                    file_lines.append({"num": new_ln, "sign": "+", "text": text})
                    new_ln += 1
                    adds += 1
                elif tag == "-":
                    file_lines.append({"num": old_ln, "sign": "-", "text": text})
                    old_ln += 1
                    dels += 1
                else:
                    file_lines.append({"num": new_ln, "sign": " ", "text": text})
                    old_ln += 1
                    new_ln += 1
                i += 1

        truncated = 0
        if len(file_lines) > max_lines:
            truncated = len(file_lines) - max_lines
            file_lines = file_lines[:max_lines]

        files.append({
            "path": path,
            "status": status,
            "adds": adds,
            "dels": dels,
            "lines": [] if binary else file_lines,
            "truncated": truncated,
            "binary": binary,
        })

    return files


def merge_files(claude_files, parsed_files):
    by_path = {}
    for cf in claude_files or []:
        p = cf.get("path")
        if p:
            by_path[p] = cf

    merged = []
    for pf in parsed_files:
        cf = by_path.get(pf["path"], {})
        merged.append({
            "path": pf["path"],
            "status": pf["status"],
            "adds": pf["adds"],
            "dels": pf["dels"],
            "lines": pf["lines"],
            "truncated": pf["truncated"],
            "id": file_dom_id(pf["path"]),
            "note": cf.get("note", ""),
            "callout": cf.get("callout", ""),
            "open": bool(cf.get("open", False)),
        })
    return merged


# ---------------------------------------------------------------------
# `render` subcommand
# ---------------------------------------------------------------------

def read_text(path):
    return Path(path).read_text(encoding="utf-8")


def list_assets(subdir, ext):
    d = ASSETS_DIR / subdir
    return sorted(p for p in d.iterdir() if p.suffix == ext and p.is_file())


def pick_random(choices, override_name=None):
    if override_name:
        for c in choices:
            if c.stem == override_name:
                return c
        raise RuntimeError(f"No asset named {override_name!r} in {choices[0].parent.name}/")
    return random.choice(choices)


def parse_sections(sections_html):
    """Split a sections.html file into a dict keyed by section name.

    Format:
        <!-- SECTION: summary -->
        ...html...
        <!-- SECTION: core_logic -->
        ...html...
    """
    parts = re.split(r"<!--\s*SECTION:\s*(\w+)\s*-->", sections_html)
    result = {}
    for i in range(1, len(parts), 2):
        name = parts[i].strip().lower()
        body = parts[i + 1] if i + 1 < len(parts) else ""
        result[name] = body.strip()
    return result


ERROR_FRAGMENT = (
    '<p style="color:#ff5577">'
    "L-listen, this section wasn't provided. Your fault, not mine."
    "</p>"
)


def cmd_render(args):
    if args.seed is not None:
        random.seed(args.seed)

    payload_path = Path(args.payload)
    sections_path = Path(args.sections)
    diff_path = Path(args.diff)
    if not payload_path.exists():
        eprint(f"Payload file not found: {payload_path}")
        return 1
    if not sections_path.exists():
        eprint(f"Sections file not found: {sections_path}")
        return 1
    if not diff_path.exists():
        eprint(f"Diff file not found: {diff_path}")
        return 1

    payload_raw = read_text(payload_path)
    try:
        claude_payload = json.loads(payload_raw)
    except json.JSONDecodeError as e:
        eprint(f"Payload JSON invalid: {e}")
        return 1
    sections = parse_sections(read_text(sections_path))
    diff_text = read_text(diff_path)

    slug = args.slug or claude_payload.get("pr_slug") or "report"
    slug = slugify(slug)

    # Mechanical diff parse — no Claude tokens involved.
    parsed_files = parse_unified_diff(diff_text)
    merged_files = merge_files(claude_payload.get("files"), parsed_files)
    stats = {
        "files": len(parsed_files),
        "added": sum(f["adds"] for f in parsed_files),
        "removed": sum(f["dels"] for f in parsed_files),
    }

    final_payload = dict(claude_payload)
    final_payload["files"] = merged_files
    final_payload["stats"] = stats

    if "shape" in claude_payload and isinstance(claude_payload["shape"], dict):
        final_payload["shape"] = {
            "note": claude_payload["shape"].get("note", ""),
            "files": [
                {"path": f["path"], "adds": f["adds"], "dels": f["dels"]}
                for f in parsed_files if not f.get("binary")
            ],
        }
    else:
        final_payload.pop("shape", None)

    # Pick assets
    banner = pick_random(list_assets("banners", ".svg"))
    theme = pick_random(list_assets("themes", ".css"), args.theme)
    chrome = pick_random(list_assets("chrome", ".html"), args.chrome)
    boot_lines = read_text(ASSETS_DIR / "flourishes" / "boot-log.txt").splitlines()
    quip_lines = read_text(ASSETS_DIR / "flourishes" / "footer-quips.txt").splitlines()

    boot_sample = "\n".join(random.sample([l for l in boot_lines if l.strip()], k=min(3, len(boot_lines))))
    footer_sample = "  //  ".join(random.sample([l for l in quip_lines if l.strip()], k=min(2, len(quip_lines))))

    # Assemble template
    tpl = read_text(TEMPLATE_DIR / "base.html")
    subs = {
        "PR_SLUG": slug,
        "THEME_CSS": read_text(theme),
        "CORE_CSS": read_text(TEMPLATE_DIR / "core.css"),
        "CHROME_TOP": read_text(chrome),
        "BANNER": read_text(banner),
        "BOOT_LOG": boot_sample,
        "FOOTER": footer_sample,
        "SECTION_SUMMARY": sections.get("summary", ERROR_FRAGMENT),
        "SECTION_CORE_LOGIC": sections.get("core_logic", ERROR_FRAGMENT),
        "PAYLOAD_JSON": json.dumps(final_payload),
        "D3_JS": read_text(TEMPLATE_DIR / "d3.min.js"),
        "D3_SANKEY_JS": read_text(TEMPLATE_DIR / "d3-sankey.min.js"),
        "CHART_FORCE_JS": read_text(ASSETS_DIR / "charts" / "force-graph.js"),
        "CHART_STATE_JS": read_text(ASSETS_DIR / "charts" / "state-machine.js"),
        "CHART_SEQUENCE_JS": read_text(ASSETS_DIR / "charts" / "sequence-flow.js"),
        "CHART_SANKEY_JS": read_text(ASSETS_DIR / "charts" / "sankey.js"),
        "CHART_TREEMAP_JS": read_text(ASSETS_DIR / "charts" / "treemap.js"),
        "CORE_JS": read_text(TEMPLATE_DIR / "core.js"),
        "HIGHLIGHT_JS": read_text(TEMPLATE_DIR / "highlight.min.js"),
    }

    out = tpl
    for k, v in subs.items():
        out = out.replace("{{" + k + "}}", v)

    date_str = datetime.date.today().isoformat()
    out_path = Path(f"/tmp/{date_str}-explanation-{slug}.html")
    out_path.write_text(out, encoding="utf-8")

    print(str(out_path))

    if not args.no_open:
        try:
            if sys.platform == "darwin":
                subprocess.run(["open", str(out_path)], check=False)
            elif sys.platform.startswith("linux"):
                subprocess.run(["xdg-open", str(out_path)], check=False)
            elif sys.platform.startswith("win"):
                os.startfile(str(out_path))  # noqa
        except Exception as e:
            eprint(f"Auto-open failed: {e}")

    return 0


# ---------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------

def build_parser():
    p = argparse.ArgumentParser(prog="render.py", description="RickOS diff-explainer renderer.")
    sub = p.add_subparsers(dest="cmd", required=True)

    pc = sub.add_parser("collect", help="Resolve a diff target and emit JSON context.")
    pc.add_argument("--target", default=None,
                    help="Branch, range (A..B), PR URL, or MR URL. Omit for current branch.")
    pc.set_defaults(func=cmd_collect)

    pr = sub.add_parser("render", help="Assemble the final HTML from payload+sections+diff.")
    pr.add_argument("--payload", required=True, help="Path to payload JSON.")
    pr.add_argument("--sections", required=True, help="Path to sections HTML.")
    pr.add_argument("--diff", required=True, help="Path to the raw diff (from `collect`'s diff_path).")
    pr.add_argument("--slug", default=None, help="Override the output filename slug.")
    pr.add_argument("--theme", default=None, help="Force a specific theme (stem name).")
    pr.add_argument("--chrome", default=None, help="Force a specific OS chrome (stem name).")
    pr.add_argument("--seed", type=int, default=None, help="Reproducible RNG seed.")
    pr.add_argument("--no-open", action="store_true", help="Skip auto-opening the browser.")
    pr.set_defaults(func=cmd_render)

    return p


def main():
    parser = build_parser()
    args = parser.parse_args()
    try:
        return args.func(args)
    except RuntimeError as e:
        eprint(f"RickOS: {e}")
        return 1


if __name__ == "__main__":
    sys.exit(main())
