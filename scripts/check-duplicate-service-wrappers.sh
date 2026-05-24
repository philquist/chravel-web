#!/usr/bin/env bash
set -euo pipefail

DUPES=$(rg -n "functions\.invoke\('artifact-search'|functions\.invoke\('enhanced-ai-parser'" src/hooks src/services | rg -v "src/services/dal/" || true)
if [[ -n "$DUPES" ]]; then
  echo "Duplicate endpoint wrapper usage detected. Use canonical DAL services instead:"
  echo "$DUPES"
  exit 1
fi

echo "No duplicate endpoint wrappers detected."
