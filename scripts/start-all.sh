#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
if ! command -v node >/dev/null || ! command -v npm >/dev/null; then
  echo "Установите Node.js из .nvmrc (npm входит в комплект)." >&2
  exit 1
fi
case "${1:-}" in
  --check) exec npm run verify ;;
  --setup) npm run setup ;;
  "") ;;
  *) echo "Использование: bash scripts/start-all.sh [--setup|--check]" >&2; exit 2 ;;
esac
if [[ ! -d apps/frontend/node_modules || ! -d apps/landing/node_modules ]]; then
  npm run setup
fi
exec npm run dev
