#!/usr/bin/env bash
# Stop — 연동 회차(wire-*)가 끝나는 시점에 그 feature 에 fixtures 흔적이 남았는지 본다.
#
# 왜: fixtures.ts 를 지우는 게 연동의 완료 조건인데, 파일은 지우고 import 만 남기거나
#     파일 이름만 바꿔 두는 식으로 빠져나가면 "연동됐다"가 거짓이 된다. 막지는 않고(Stop 은
#     못 막는다) systemMessage 로 크게 알린다. Verify 도 같은 것을 본다.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
RUN_FILE="$ROOT/.claude/harness/.active-run"
[ -f "$RUN_FILE" ] || exit 0
RUN="$(tr -d '[:space:]' < "$RUN_FILE")"
case "$RUN" in
  retail-wire-*) APP=retail; SLUG="${RUN#retail-wire-}" ;;
  wire-*) APP=wholesale; SLUG="${RUN#wire-}" ;;
  *) exit 0 ;;
esac
DIR="$ROOT/apps/$APP/src/features/$SLUG"
[ -d "$DIR" ] || exit 0

MSG=""
if [ -f "$DIR/fixtures.ts" ]; then
  MSG="$DIR/fixtures.ts 가 아직 있습니다."
fi
HITS="$(grep -rlE 'from "\./fixtures"|from "\.\./fixtures"|/fixtures"' "$DIR" 2>/dev/null || true)"
if [ -n "$HITS" ]; then
  MSG="$MSG fixtures import 잔존: $(tr '\n' ' ' <<<"$HITS")"
fi
[ -n "$MSG" ] || exit 0
jq -cn --arg m "⚠ [$RUN] $MSG 04-wire.md §4 에 이유가 없으면 회차를 닫지 마세요." '{systemMessage:$m}'
