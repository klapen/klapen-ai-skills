#!/usr/bin/env bash
#
# klapen-ai-skills installer.
#
#   ./install.sh                                  interactive
#   ./install.sh --all                            install every skill
#   ./install.sh <name>...                        install specific skills
#   ./install.sh --target DIR                     override the skills dir
#   ./install.sh --copy | --symlink               override install method
#   ./install.sh --force                          replace without asking
#
# Discovers skills by scanning for `<dir>/SKILL.md` under the repo root.
# Default target directory is $CLAUDE_SKILLS_DIR or ~/.claude/skills.
# Default method is symlink; on Windows / Git Bash the script falls
# back to a full copy if `ln -s` fails.

set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEFAULT_TARGET="${CLAUDE_SKILLS_DIR:-$HOME/.claude/skills}"

# -------- flag parsing --------
TARGET=""
METHOD=""
INSTALL_ALL=0
FORCE=0
declare -a REQUESTED

usage() {
  cat <<EOF
Install klapen-ai-skills entries into Claude Code's skills directory.

Usage:
  $(basename "$0") [options] [SKILL_NAME...]

Options:
  --target DIR      Install into DIR (default: \$CLAUDE_SKILLS_DIR or ~/.claude/skills)
  --symlink         Symbolic link (recommended; auto-updates on \`git pull\`)
  --copy            Full copy (portable; won't reflect future \`git pull\`s)
  --all             Install every skill found in this repo
  --force           Replace existing entries without prompting
  -h, --help        Show this help
EOF
}

while [[ "${1:-}" != "" ]]; do
  case "$1" in
    --target)  TARGET="${2:?missing DIR}"; shift 2 ;;
    --symlink) METHOD="symlink"; shift ;;
    --copy)    METHOD="copy"; shift ;;
    --all)     INSTALL_ALL=1; shift ;;
    --force)   FORCE=1; shift ;;
    -h|--help) usage; exit 0 ;;
    --*)       echo "Unknown option: $1" >&2; usage >&2; exit 2 ;;
    *)         REQUESTED+=("$1"); shift ;;
  esac
done

# -------- discover skills --------
declare -a SKILLS
for d in "$REPO_DIR"/*/; do
  name="$(basename "$d")"
  [[ "$name" == "." || "$name" == ".." ]] && continue
  [[ -f "$d/SKILL.md" ]] && SKILLS+=("$name")
done

if [[ ${#SKILLS[@]} -eq 0 ]]; then
  echo "No skills found under $REPO_DIR (looked for */SKILL.md)." >&2
  exit 1
fi

# -------- decide which skills --------
declare -a TO_INSTALL

if (( INSTALL_ALL )); then
  TO_INSTALL=("${SKILLS[@]}")
elif (( ${#REQUESTED[@]} > 0 )); then
  for want in "${REQUESTED[@]}"; do
    found=0
    for s in "${SKILLS[@]}"; do
      [[ "$s" == "$want" ]] && { TO_INSTALL+=("$s"); found=1; break; }
    done
    (( found )) || { echo "Unknown skill: $want" >&2; exit 2; }
  done
else
  # interactive select
  echo "Skills available in this repo:"
  for i in "${!SKILLS[@]}"; do
    printf "  %d) %s\n" "$((i+1))" "${SKILLS[$i]}"
  done
  echo "  a) all"
  echo "  q) quit"
  read -rp "Pick one or more (comma / space separated) [a]: " pick
  pick="${pick:-a}"
  case "$pick" in
    q|Q) echo "aborted."; exit 0 ;;
    a|A) TO_INSTALL=("${SKILLS[@]}") ;;
    *)
      # split by comma or space
      IFS=', ' read -ra picked <<< "$pick"
      for p in "${picked[@]}"; do
        if [[ "$p" =~ ^[0-9]+$ ]] && (( p >= 1 && p <= ${#SKILLS[@]} )); then
          TO_INSTALL+=("${SKILLS[$((p-1))]}")
        else
          echo "  skipping invalid choice: $p" >&2
        fi
      done
      ;;
  esac
fi

if [[ ${#TO_INSTALL[@]} -eq 0 ]]; then
  echo "Nothing to install."; exit 0
fi

# -------- decide target dir --------
if [[ -z "$TARGET" ]]; then
  read -rp "Install into [$DEFAULT_TARGET]: " TARGET
  TARGET="${TARGET:-$DEFAULT_TARGET}"
fi
# expand ~ manually (read -p won't)
TARGET="${TARGET/#\~/$HOME}"
mkdir -p "$TARGET"

# -------- decide method --------
if [[ -z "$METHOD" ]]; then
  read -rp "Install method — symlink or copy [symlink]: " METHOD
  METHOD="${METHOD:-symlink}"
fi
case "$METHOD" in
  s|sym|symlink) METHOD="symlink" ;;
  c|cp|copy)     METHOD="copy" ;;
  *) echo "Unknown method: $METHOD (want 'symlink' or 'copy')." >&2; exit 2 ;;
esac

# -------- install --------
echo
echo "Installing into: $TARGET"
echo "Method:          $METHOD"
echo

for skill in "${TO_INSTALL[@]}"; do
  src="$REPO_DIR/$skill"
  dst="$TARGET/$skill"

  if [[ -e "$dst" || -L "$dst" ]]; then
    if (( FORCE )); then
      rm -rf "$dst"
    else
      read -rp "  $dst exists. Replace? [y/N] " ans
      case "$ans" in
        y|Y|yes|YES) rm -rf "$dst" ;;
        *) echo "  skipped $skill"; continue ;;
      esac
    fi
  fi

  installed_via="$METHOD"
  if [[ "$METHOD" == "symlink" ]]; then
    if ln -s "$src" "$dst" 2>/dev/null; then
      :
    else
      echo "  symlink failed (Windows / permissions?), falling back to copy..."
      cp -R "$src" "$dst"
      installed_via="copy (fallback)"
    fi
  else
    cp -R "$src" "$dst"
  fi

  echo "  ✓ $skill  →  $dst  ($installed_via)"
done

echo
echo "Done. In Claude Code, invoke the installed skill(s) by their slash-command"
echo "trigger or by referencing them in natural language (see each skill's SKILL.md)."
