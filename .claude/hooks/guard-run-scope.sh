#!/usr/bin/env bash
# PreToolUse(Edit|Write) — 회차 범위 밖 쓰기를 막는다.
#
# 왜: "packages/ui 는 읽기 전용", "기획 단계는 코드를 쓰지 않는다"는 문장일 뿐이라 지켜지는지
#     아무도 모른다. 경로로 잘라 둔다.
#
# 어떻게: .claude/harness/.active-run 을 읽는다. 두 형식을 받는다.
#   (구) 한 줄 슬러그            → 앱만 가른다 (retail- 접두사면 소매)
#   (신) key=value 여러 줄        → slug= app= stage= 로 stage 별 허용 경로를 정한다
#         stage: plan|design|review|qa  → runs/, e2e/ 만. 앱·패키지 코드 금지
#                contract              → packages/api/{openapi,src/mocks,src/generated} + runs/
#                dev                   → 그 앱 코드. packages/ui 와 openapi 스냅샷 금지
#                guard                 → dev 범위 + packages/ui + packages/config
# 파일이 없으면 회차가 아니므로 아무것도 막지 않는다. 레포 밖 경로(~/feature-spec 등)는 막지 않는다.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
RUN_FILE="$ROOT/.claude/harness/.active-run"

FILE="$(jq -r '.tool_input.file_path // empty')"
[ -n "$FILE" ] || exit 0
case "$FILE" in "$ROOT"/*) ;; *) exit 0 ;; esac   # 레포 밖은 관여하지 않는다
REL="${FILE#"$ROOT"/}"

# 파이프라인(D35): 다음 회차 개발은 .claude/worktrees/<이름>/ 에서 돈다. 본 트리 센티널(앞 회차 QA 등)이
# 그 쓰기를 막지 않게, worktree 안 파일은 그 worktree 뿌리의 .active-run 으로 판정하고 경로도 그 안 기준으로 본다.
case "$REL" in
  .claude/worktrees/*/*)
    WT="${REL#.claude/worktrees/}"; WT="${WT%%/*}"
    RUN_FILE="$ROOT/.claude/worktrees/$WT/.active-run"
    REL="${REL#.claude/worktrees/"$WT"/}" ;;
esac
[ -f "$RUN_FILE" ] || exit 0

SLUG=""; APP=""; STAGE=""
if grep -q '=' "$RUN_FILE"; then
  SLUG="$(sed -n 's/^slug=//p' "$RUN_FILE" | tr -d '[:space:]')"
  APP="$(sed -n 's/^app=//p' "$RUN_FILE" | tr -d '[:space:]')"
  STAGE="$(sed -n 's/^stage=//p' "$RUN_FILE" | tr -d '[:space:]')"
else
  SLUG="$(tr -d '[:space:]' < "$RUN_FILE")"
  case "$SLUG" in retail-*) APP=retail ;; *) APP=wholesale ;; esac
  STAGE=dev
fi
[ -n "$SLUG" ] || exit 0
TAG="[$SLUG · $STAGE]"

deny() {
  jq -cn --arg r "$1" '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"deny",permissionDecisionReason:$r}}'
  exit 0
}

# 회차 산출물은 어느 stage 든 쓸 수 있다
case "$REL" in .claude/harness/*) exit 0 ;; esac

case "$STAGE" in
  plan|design|review)
    deny "$TAG 이 stage 는 코드를 쓰지 않습니다. 산출물은 runs/ 와 ~/feature-spec 뿐입니다." ;;
  qa)
    case "$REL" in e2e/*) exit 0 ;; esac
    deny "$TAG QA 는 코드를 고치지 않습니다. e2e/ 와 runs/ 만 씁니다." ;;
  contract)
    case "$REL" in
      packages/api/openapi/*|packages/api/src/mocks/*|packages/api/src/generated/*|packages/api/scripts/*|packages/api/README.md|packages/api/package.json|packages/api/vitest.config.ts|pnpm-lock.yaml|apps/*/src/shared/api/*) exit 0 ;;
      # 08e에서 목 손잡이 e2e(S1-4)가 막혀 dev stage로 넘어갔다. 계약 이슈의 e2e와 그 경로 등록은 여기서 쓴다.
      e2e/*|playwright.config.ts|playwright.stub.config.ts) exit 0 ;;
    esac
    deny "$TAG 계약 stage 는 packages/api 의 openapi, mocks, generated, scripts, README 와 apps/*/src/shared/api, e2e/, playwright 설정만 씁니다." ;;
  dev|guard)
    case "$REL" in
      packages/api/openapi/*)
        deny "$TAG 스냅샷은 계약 stage 에서만 바뀝니다. 계약을 다시 열려면 오케스트레이터에게 알리세요." ;;
      packages/ui/*|packages/config/*)
        [ "$STAGE" = guard ] && exit 0
        deny "$TAG packages/ui, packages/config 는 읽기 전용입니다. 재발 방지는 guard stage 에서만 (CLAUDE.md)." ;;
    esac
    if [ "$APP" = retail ]; then
      case "$REL" in apps/wholesale/*) deny "$TAG 소매 회차에서 apps/wholesale 을 수정할 수 없습니다." ;; esac
    else
      case "$REL" in apps/retail/*) deny "$TAG 도매 회차에서 apps/retail 을 수정할 수 없습니다." ;; esac
    fi
    ;;
esac
exit 0
