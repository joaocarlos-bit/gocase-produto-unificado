#!/usr/bin/env bash
# Monta a pasta de upload do GoDeploy a partir do build (dist/) + worker.
# Rode DEPOIS de: npm run refresh (dados) e npm run build (bundle).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DIST="$ROOT/dist"
OUT="$ROOT/godeploy/upload"

if [ ! -f "$DIST/index.html" ]; then
  echo "ERRO: $DIST/index.html não existe. Rode 'npm run build' primeiro." >&2
  exit 1
fi
if [ -z "$(ls -A "$DIST"/data/*.json 2>/dev/null || true)" ]; then
  echo "AVISO: nenhum JSON em dist/data/. Rode 'npm run refresh' antes do build," >&2
  echo "       senão o dashboard sobe sem dados." >&2
fi

rm -rf "$OUT"
mkdir -p "$OUT/assets" "$OUT/data" "$OUT/src"

cp "$DIST/index.html"        "$OUT/index.html"
cp "$DIST"/assets/*          "$OUT/assets/"
cp "$DIST"/data/*.json       "$OUT/data/" 2>/dev/null || true
cp "$ROOT/godeploy/server.ts" "$OUT/src/server.ts"

echo "Pasta de upload pronta: $OUT"
echo ""
echo "Arquivos (relativos à pasta de upload):"
( cd "$OUT" && find . -type f | sed 's#^\./##' | sort )
echo ""
echo "assets[] para o createApp/updateApp (tudo menos src/):"
( cd "$OUT" && find . -type f ! -path './src/*' | sed 's#^\./##' | sort | sed 's/^/  - /' )
