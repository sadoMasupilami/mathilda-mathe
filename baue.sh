#!/usr/bin/env bash
# Baut die PDFs. Nutzt Nix für Node und poppler, falls sie nicht installiert sind.
# Beispiele:  ./baue.sh          ./baue.sh --nur 03 --png
set -euo pipefail
cd "$(dirname "$0")"
if command -v node >/dev/null && command -v pdftoppm >/dev/null; then
  [ -d node_modules ] || npm install
  exec node build.mjs "$@"
fi
exec nix shell nixpkgs#nodejs_22 nixpkgs#poppler-utils -c sh -c '[ -d node_modules ] || npm install; node build.mjs "$@"' sh "$@"
