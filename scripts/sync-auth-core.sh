#!/usr/bin/env bash
# Copy the canonical auth client into the sister apps, or --check for drift.
#
# gamerplex-com OWNS lib/identity/auth-core.ts. sledgit and omega-city vendor it verbatim
# because they are separate repos that cannot share an npm package (sledgit builds under
# nix, where adding a dependency changes the lockfile hash).
#
# Each app runs `--check` in its test suite, so a divergent copy fails loudly instead of
# quietly growing a third implementation — which is how one dropped field became three
# different bugs.
set -euo pipefail
HERE="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$HERE/lib/identity/auth-core.ts"
[ -f "$SRC" ] || { echo "canonical not found: $SRC"; exit 2; }

# Every app with a login. pet-legends-global went through @gamerplex/sdk instead of a
# hand-written client, which is why it was missed the first time and shipped the same
# bug a FIFTH way. If a new site gets a login, it goes here.
DESTS="
${SLEDGIT_DIR:-$HERE/../sledgit}/app/nextjs-app/lib/auth-core.ts
${OMEGA_DIR:-$HERE/../omega-city}/src/shell/auth-core.ts
${PLG_DIR:-$HERE/../pet-legends-global}/app/_lib/identity/auth-core.ts
"

drift=0
for dest in $DESTS; do
  dir="$(dirname "$dest")"
  [ -d "$dir" ] || { echo "skip (no such app): $dir"; continue; }
  if [ "${1:-}" = "--check" ]; then
    if ! cmp -s "$SRC" "$dest"; then echo "DRIFT: $dest"; drift=1; fi
  else
    cp "$SRC" "$dest"
    echo "synced -> $dest"
  fi
done

if [ "${1:-}" = "--check" ]; then
  [ $drift = 0 ] && echo "auth-core in sync" || { echo "run: npm run sync:auth"; exit 1; }
fi
