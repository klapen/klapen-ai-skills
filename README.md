# klapen-ai-skills

Personal collection of [Claude Code](https://claude.com/claude-code) skills.
Each skill is a self-contained folder with a `SKILL.md` frontmatter, any
supporting scripts/templates/assets it needs, and an `examples/` folder
where applicable.

## Skills

| Skill | Purpose |
| --- | --- |
| [`rick-explain-diff-html`](rick-explain-diff-html/) | Generates a rich, interactive, single-file HTML report explaining a code change, narrated by Rick Sanchez inside a "RickOS v137.0" alien-OS UI. Renders `git diff`, GitHub PR URLs, or GitLab MR URLs. |
| [`repo-architecture-analyzer`](repo-architecture-analyzer/) | Analyzes a repository's structure, dependencies, static metrics, and Git history, and renders a self-contained interactive D3 HTML report — repo map, dependency matrix, and hotspots. |

## Installing

Claude Code discovers skills in `~/.claude/skills/` (or whatever
`CLAUDE_SKILLS_DIR` is set to). Clone this repo and run `./install.sh`
— it scans the repo for skills, asks which ones you want, where they
should live, and whether to install by symlink or by copy.

```bash
git clone https://github.com/klapen/klapen-ai-skills.git
cd klapen-ai-skills
./install.sh
```

### Interactive flow

Running `./install.sh` with no arguments prints something like:

```
Skills available in this repo:
  1) rick-explain-diff-html
  a) all
  q) quit
Pick one or more (comma / space separated) [a]:
Install into [/Users/you/.claude/skills]:
Install method — symlink or copy [symlink]:
```

Press Enter at each prompt to accept the default, or type an answer.
For the skill picker you can enter `a` (all), a single index (`1`),
several indices (`1, 3`), or `q` to abort.

### Non-interactive flags

Skip prompts entirely by passing the answers on the command line:

```bash
./install.sh --all --symlink                        # every skill, symlinked
./install.sh rick-explain-diff-html --copy          # one skill by name, copied
./install.sh --all --target /custom/skills --copy   # custom target dir + copy
./install.sh --all --force                          # replace existing without asking
```

Full option list:

| Flag | Meaning |
| --- | --- |
| `SKILL_NAME [SKILL_NAME…]` | Positional. Install these specific skills by folder name. |
| `--all` | Install every skill found in the repo. |
| `--target DIR` | Install into `DIR` instead of `~/.claude/skills`. Env var `CLAUDE_SKILLS_DIR` is honoured as an alternative default. |
| `--symlink` | Force symlink mode (see below). |
| `--copy` | Force full-copy mode. |
| `--force` | If an entry already exists at the target, replace it without prompting. Without `--force`, the installer asks before overwriting. |
| `-h`, `--help` | Print help. |

### Symlink vs copy

- **Symlink (default).** Creates `~/.claude/skills/<skill> → /path/to/klapen-ai-skills/<skill>`. Any `git pull` on the repo checkout immediately reflects in the installed skill — no reinstall needed. Works on macOS, Linux, WSL.
- **Copy.** Copies the whole skill folder. Portable, self-contained, but frozen — you have to re-run `./install.sh` after `git pull` to pick up updates.

On **Windows / Git Bash** `ln -s` sometimes silently fails without Developer Mode. If you asked for `--symlink` and the `ln` call errors, the installer prints a notice and automatically falls back to a full copy for that skill. If you want the copy behaviour up front, pass `--copy`.

### Requirements

Requirements are per-skill and documented in each skill's `SKILL.md`.
For everything in this repo you need at minimum:

- Bash (macOS / Linux / WSL / Git Bash on Windows)
- `python3` on `PATH`
- `Node.js` (`>=18`) on PATH — only for skills that need it (currently `repo-architecture-analyzer`); see each skill's `SKILL.md` for its actual requirements
- Optional: `gh` (GitHub CLI) and/or `glab` (GitLab CLI) for the skills that resolve PR/MR URLs

### Updating

```bash
cd klapen-ai-skills
git pull
# If you installed by symlink: nothing else to do.
# If you installed by copy: re-run the installer to overwrite.
./install.sh --all --force
```

### Uninstalling

Since installed skills are either a symlink or a folder inside your
skills directory, remove them the usual way:

```bash
rm -rf ~/.claude/skills/<skill-name>          # copy or symlink; both cases
```

### Using a skill

Once installed, invoke a skill from a Claude Code session via its
slash-command trigger or a natural-language phrase. Each skill's
`SKILL.md` lists its own trigger patterns and inputs.

### Example: rick-explain-diff-html

```
/rick-explain-diff-html https://gitlab.com/some-group/some-project/-/merge_requests/42
```

or, in plain language:

> Rick, explain this branch.
> Rick, en español, explica este MR https://…
> Rick, in Portuguese, review https://…

An optional language argument (`en` / `es` / `pt`) makes Rick write the
whole report in that language — payload prose, quiz, verdict, and all.
Default is English.

Rendered example reports live in
[`rick-explain-diff-html/examples/`](rick-explain-diff-html/examples/):

- [`example.html`](rick-explain-diff-html/examples/example.html) — English
- [`example-pt.html`](rick-explain-diff-html/examples/example-pt.html) — Portuguese

Each has its payload + sections + diff alongside so you can regenerate:

```bash
# English (default lang)
python3 rick-explain-diff-html/scripts/render.py render \
    --payload  rick-explain-diff-html/examples/example-payload.json \
    --sections rick-explain-diff-html/examples/example-sections.html \
    --diff     rick-explain-diff-html/examples/example.diff \
    --theme gruvbox-dark --chrome rickos-v137 --seed 42 \
    --slug example --no-open

# Portuguese
python3 rick-explain-diff-html/scripts/render.py render \
    --payload  rick-explain-diff-html/examples/example-pt-payload.json \
    --sections rick-explain-diff-html/examples/example-pt-sections.html \
    --diff     rick-explain-diff-html/examples/example.diff \
    --theme gruvbox-dark --chrome rickos-v137 --seed 42 \
    --lang pt --slug example-pt --no-open
```

## Repository layout

```
klapen-ai-skills/
├── README.md
├── .gitignore
└── <skill-name>/
    ├── SKILL.md              # required — frontmatter + docs Claude reads
    ├── scripts/              # optional — Python/bash helpers the skill runs
    ├── template/             # optional — templates/assets the skill assembles
    ├── assets/               # optional — bundled resources (variety pools, etc.)
    └── examples/             # optional — sample inputs + rendered outputs
```

Skills follow the layout convention Anthropic uses for the built-in ones
(SKILL.md as the entry point, everything else supporting) so any skill
here should be drop-in compatible with Claude Code's discovery.

## Adding a new skill

1. Create a new folder at the repo root named after the skill.
2. Write a `SKILL.md` with YAML frontmatter (`name`, `description`, optional
   `metadata`) followed by the skill's documentation for Claude.
3. Add supporting files (scripts, templates, assets, examples) as needed.
4. Add a row to the **Skills** table in this README.
5. Symlink or copy the folder into `~/.claude/skills/` to use it locally.
