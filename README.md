# klapen-ai-skills

Personal collection of [Claude Code](https://claude.com/claude-code) skills.
Each skill is a self-contained folder with a `SKILL.md` frontmatter, any
supporting scripts/templates/assets it needs, and an `examples/` folder
where applicable.

## Skills

| Skill | Purpose |
| --- | --- |
| [`rick-explain-diff-html`](rick-explain-diff-html/) | Generates a rich, interactive, single-file HTML report explaining a code change, narrated by Rick Sanchez inside a "RickOS v137.0" alien-OS UI. Renders `git diff`, GitHub PR URLs, or GitLab MR URLs. |

## Installing

Claude Code discovers skills in `~/.claude/skills/`. Clone this repo
anywhere on your machine, then symlink (or copy) the skill folders you
want to enable:

```bash
# 1. Clone somewhere on your machine
git clone https://github.com/klapen/klapen-ai-skills.git
cd klapen-ai-skills

# 2a. Symlink (recommended — picks up changes when you `git pull`)
ln -s "$PWD/<skill-name>" ~/.claude/skills/<skill-name>

# 2b. Or copy (freezes the version you have at that point)
cp -r <skill-name> ~/.claude/skills/<skill-name>
```

Repeat step 2 for each skill you want. Requirements are per-skill and
documented in each skill's `SKILL.md` (this repo's skills need `python3`
and, where relevant, `gh` / `glab` for GitHub / GitLab MR access).

Then in a Claude Code session, invoke the skill via its slash command or a
natural-language trigger phrase. Each skill's `SKILL.md` documents its own
trigger patterns and inputs.

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
