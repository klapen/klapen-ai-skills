# klapen-ai-skills

Personal collection of [Claude Code](https://claude.com/claude-code) skills.
Each skill is a self-contained folder with a `SKILL.md` frontmatter, any
supporting scripts/templates/assets it needs, and an `examples/` folder
where applicable.

## Skills

| Skill | Purpose |
| --- | --- |
| [`rick-explain-diff-html`](rick-explain-diff-html/) | Generates a rich, interactive, single-file HTML report explaining a code change, narrated by Rick Sanchez inside a "RickOS v137.0" alien-OS UI. Renders `git diff`, GitHub PR URLs, or GitLab MR URLs. |

## Using a skill

Claude Code discovers skills in `~/.claude/skills/`. To make a skill from
this repo available:

```bash
# Option A — symlink (recommended; updates as you pull the repo)
ln -s ~/work/personal/klapen-ai-skills/<skill-name> ~/.claude/skills/<skill-name>

# Option B — copy
cp -r <skill-name> ~/.claude/skills/<skill-name>
```

Then in a Claude Code session, invoke the skill via its slash command or a
natural-language trigger phrase. Each skill's `SKILL.md` documents its own
trigger patterns and inputs.

### Example: rick-explain-diff-html

```
/rick-explain-diff-html https://gitlab.com/some-group/some-project/-/merge_requests/42
```

or, in plain language:

> Rick, explain this branch.

The rendered example report lives at
[`rick-explain-diff-html/examples/example.html`](rick-explain-diff-html/examples/example.html)
— open it in a browser to see what a report looks like. The payload and
section fragments that generated it are alongside
(`example-payload.json`, `example-sections.html`) so you can regenerate it:

```bash
python3 rick-explain-diff-html/scripts/render.py render \
    --payload  rick-explain-diff-html/examples/example-payload.json \
    --sections rick-explain-diff-html/examples/example-sections.html \
    --theme gruvbox-dark --chrome rickos-v137 --seed 42 \
    --slug example --no-open
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
