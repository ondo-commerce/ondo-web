#!/usr/bin/env bash
# PreToolUse(Edit|Write) — 연동 회차(wire-*)의 두 규칙을 쓰는 순간 막는다.
#
# 왜: ADR-0002 "wire 타입을 손으로 쓰지 않는다"와 "fetch는 packages/api 안에서만"은 문장이라
#     지켜지는지 아무도 모른다. 스펙이 바뀌어도 컴파일이 통과해 런타임에 터지는 사고가 정확히
#     이 두 구멍으로 들어온다. 경로와 내용으로 잘라 둔다.
#
# 어떻게: .active-run 이 wire-* / retail-wire-* 일 때만 본다. 회차 밖에서는 아무것도 막지 않는다.
#         (계정 연동처럼 스냅샷이 없어 임시로 손 타입을 둔 커밋은 회차 밖에서 이뤄졌다.)
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
RUN_FILE="$ROOT/.claude/harness/.active-run"
[ -f "$RUN_FILE" ] || exit 0
RUN="$(tr -d '[:space:]' < "$RUN_FILE")"
case "$RUN" in wire-*|retail-wire-*) ;; *) exit 0 ;; esac

INPUT="$(cat)"
FILE="$(jq -r '.tool_input.file_path // empty' <<<"$INPUT")"
[ -n "$FILE" ] || exit 0
REL="${FILE#"$ROOT"/}"
# 새로 들어가는 내용만 본다. Edit 은 new_string, Write 는 content
NEW="$(jq -r '.tool_input.new_string // .tool_input.content // empty' <<<"$INPUT")"
[ -n "$NEW" ] || exit 0

deny() {
  jq -cn --arg r "$1" '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"deny",permissionDecisionReason:$r}}'
  exit 0
}

case "$REL" in
  apps/*/src/*.ts|apps/*/src/*.tsx)
    # 전역 fetch( 만 잡는다. apiFetch( · api.fetch( · serverApi().fetch( 는 앞 글자가 단어/점이라 통과
    if grep -Eq '(^|[^.[:alnum:]_])fetch\(' <<<"$NEW"; then
      deny "[$RUN] apps 안에서 fetch 를 직접 부르지 않습니다. apiFetch · apiFetchPage · serverApi() 를 쓰세요 (packages/api)."
    fi
    ;;
esac

case "$REL" in
  apps/*/src/features/*/api/*|apps/*/src/features/*/types.ts|apps/*/src/shared/api/*)
    # 객체 리터럴로 선언한 Response/Request 타입 = 손으로 쓴 wire 타입. 별칭(= WholesaleSchema<…>)은 통과
    if grep -Eq '^(export )?(interface [A-Za-z]+(Response|Request)\b|type [A-Za-z]+(Response|Request) *= *\{)' <<<"$NEW"; then
      deny "[$RUN] wire 타입을 손으로 쓰지 않습니다 (ADR-0002). WholesaleSchema<\"…\"> / RetailSchema<\"…\"> 별칭을 쓰세요."
    fi
    ;;
esac
exit 0
