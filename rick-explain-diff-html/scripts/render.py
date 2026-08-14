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
        Claude consumes this JSON, then writes:
            /tmp/rick-payload-<slug>.json    (payload for the report)
            /tmp/rick-sections-<slug>.html   (4 HTML section fragments,
                                              delimited by
                                              <!-- SECTION: name -->)

    render.py render --payload <json> --sections <html>
                     [--slug <name>] [--theme <name>] [--chrome <name>]
                     [--seed <int>] [--no-open]
        Assemble the final HTML from the template + assets + Claude's
        payload/sections. Writes to /tmp/YYYY-MM-DD-explanation-<slug>.html
        and (by default) opens it in the user's browser.
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
    # Best-effort merge base: origin/HEAD → main → master → develop
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
    # merge base of branch with default base
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
        # Use -R <owner/repo> so gh works from anywhere.
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

    # Fallback: public .diff fetch
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
    repo_path = m["path"]  # e.g., "galileo-ft/engineering/card-service/cal_service"
    mr_num = m["num"]
    slug = slugify(f"{repo_path.split('/')[-1]}-mr-{mr_num}")
    pr_meta = None
    if has_cmd("glab"):
        # Use -R <path> so glab works from anywhere, not just inside a checkout.
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

    # Fallback: try public .diff (works only for public projects)
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
        # Rick-flavored error but still JSON so caller can parse
        err = {"error": str(e), "hint": "L-listen, fix your target string, *urp*"}
        print(json.dumps(err))
        return 1

    print(json.dumps(payload))
    return 0


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
        <!-- SECTION: context -->
        ...html...
    """
    parts = re.split(r"<!--\s*SECTION:\s*(\w+)\s*-->", sections_html)
    # parts is [preamble, name1, body1, name2, body2, ...]
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
    if not payload_path.exists():
        eprint(f"Payload file not found: {payload_path}")
        return 1
    if not sections_path.exists():
        eprint(f"Sections file not found: {sections_path}")
        return 1

    payload_raw = read_text(payload_path)
    try:
        payload = json.loads(payload_raw)
    except json.JSONDecodeError as e:
        eprint(f"Payload JSON invalid: {e}")
        return 1
    sections = parse_sections(read_text(sections_path))

    slug = args.slug or payload.get("pr_slug") or "report"
    slug = slugify(slug)

    # Pick assets
    banner = pick_random(list_assets("banners", ".svg"))
    theme = pick_random(list_assets("themes", ".css"), args.theme)
    chrome = pick_random(list_assets("chrome", ".html"), args.chrome)
    gauge = pick_random(list_assets("gauges", ".html"))
    boot_lines = read_text(ASSETS_DIR / "flourishes" / "boot-log.txt").splitlines()
    quip_lines = read_text(ASSETS_DIR / "flourishes" / "footer-quips.txt").splitlines()

    boot_sample = "\n".join(random.sample([l for l in boot_lines if l.strip()], k=min(5, len(boot_lines))))
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
        "GAUGE": read_text(gauge),
        "FOOTER": footer_sample,
        "SECTION_SUMMARY": sections.get("summary", ERROR_FRAGMENT),
        "SECTION_CONTEXT": sections.get("context", ERROR_FRAGMENT),
        "SECTION_CORE_LOGIC": sections.get("core_logic", ERROR_FRAGMENT),
        "SECTION_WALKTHROUGH": sections.get("walkthrough", ERROR_FRAGMENT),
        "PAYLOAD_JSON": json.dumps(payload),
        "D3_JS": read_text(TEMPLATE_DIR / "d3.min.js"),
        "D3_SANKEY_JS": read_text(TEMPLATE_DIR / "d3-sankey.min.js"),
        "CHART_FORCE_JS": read_text(ASSETS_DIR / "charts" / "force-graph.js"),
        "CHART_STATE_JS": read_text(ASSETS_DIR / "charts" / "state-machine.js"),
        "CHART_SEQUENCE_JS": read_text(ASSETS_DIR / "charts" / "sequence-flow.js"),
        "CHART_SANKEY_JS": read_text(ASSETS_DIR / "charts" / "sankey.js"),
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

    pr = sub.add_parser("render", help="Assemble the final HTML from payload+sections.")
    pr.add_argument("--payload", required=True, help="Path to payload JSON.")
    pr.add_argument("--sections", required=True, help="Path to sections HTML.")
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
