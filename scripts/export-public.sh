#!/usr/bin/env bash
# Copy the committed tree at HEAD, minus the paths in .publicignore, into a checkout of the
# public repository. Commit and push from that checkout yourself after reviewing the diff.
#
#   scripts/export-public.sh ../eatlog-public
set -euo pipefail

target=${1:?usage: scripts/export-public.sh <public checkout>}
root=$(git rev-parse --show-toplevel)
cd "$root"

if [ -n "$(git status --porcelain)" ]; then
  echo "Commit or stash changes first; the export copies HEAD only." >&2
  exit 1
fi
if [ ! -d "$target/.git" ]; then
  echo "$target is not a git checkout of the public repository." >&2
  exit 1
fi

excludes=()
while IFS= read -r line; do
  line=${line%%#*}
  line=${line%"${line##*[![:space:]]}"}
  [ -n "$line" ] && excludes+=(":(exclude,glob)$line")
done < .publicignore

# Replace the target's tracked content so deletions carry over, then copy the export in.
git -C "$target" ls-files -z | (cd "$target" && xargs -0 -r rm -f)
git ls-files -z -- . "${excludes[@]}" | tar --null -T - -cf - | tar -xf - -C "$target"
find "$target" -mindepth 1 -type d -empty -not -path "$target/.git*" -delete

echo "Exported $(git rev-parse --short HEAD) to $target."
git -C "$target" status --short | tail -n 20
