#!/usr/bin/env bash
# PostToolUse(Edit|Write) — 저장한 그 파일만 lint-staged 와 같은 방식으로 정리한다.
# 커밋 때 husky 가 하던 일을 쓰는 순간으로 당겨서, 포맷 차이가 diff 에 섞이지 않게 한다.
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
FILE="$(jq -r '.tool_response.filePath // .tool_input.file_path // empty')"
[ -n "$FILE" ] && [ -f "$FILE" ] || exit 0
REL="${FILE#"$ROOT"/}"
cd "$ROOT" || exit 0

case "$REL" in
  apps/retail/*.ts|apps/retail/*.tsx)       pnpm --filter retail exec eslint --fix "$FILE" ;;
  apps/wholesale/*.ts|apps/wholesale/*.tsx) pnpm --filter wholesale exec eslint --fix "$FILE" ;;
  packages/ui/*.ts|packages/ui/*.tsx)       pnpm --filter @ondo/ui exec eslint --fix "$FILE" ;;
esac >/dev/null 2>&1

case "$REL" in
  *.ts|*.tsx|*.js|*.mjs|*.cjs|*.json|*.css|*.md) pnpm exec prettier --write "$FILE" >/dev/null 2>&1 ;;
esac
exit 0
