# 온도 개발 하네스

화면 묶음 하나를 **PM → FE → Verify** 3단계로 개발한다.

```
/ondo-tab 재고                          # 도매(apps/wholesale)가 기본
/ondo-tab 마켓 탐색 --app retail        # 소매(apps/retail)
/ondo-tab 주문 --from fe                # 중간 단계부터
```

## 구성

| 위치 | 무엇 |
|---|---|
| `~/.claude/commands/ondo-tab.md` | 오케스트레이터. 단계·게이트 |
| `~/.claude/agents/ondo-pm.md` | 사양 → Epic·Story·AC → 이슈 초안 |
| `~/.claude/agents/ondo-fe.md` | 구현. 스펙을 새로 정하지 않는다 |
| `~/.claude/agents/ondo-verify.md` | 브라우저로 검증. 고치지 않는다 |
| `./CONTEXT.md` | **도매** 회차 브리핑 |
| `./CONTEXT-retail.md` | **소매** 회차 브리핑 |
| `./runs/<slug>/` | 회차 산출물 |
| `../hooks/*.sh` + `../settings.json` | 규칙을 쓰는 순간 강제하는 훅 |

**레포 전체에 걸리는 규칙은 여기 없다.** `~/onDo/CLAUDE.md` 에 있고 세션마다 자동으로 읽힌다.
여기 브리핑은 **회차에만 필요한 것**(사양 SSOT 우선순위, 그 앱의 도메인 요약)만 담는다.

## 왜 3단계인가 — 4단계를 줄인 이유

도매 5회차를 이 하네스로 돌리고 실측한 결과다.

| | 값 |
|---|---|
| 만든 문서 | **9,846줄** (실제 코드 13,161줄의 75%) |
| QA가 찾은 결함 | **53건** |
| 그중 이슈가 된 것 | **0건** — 후속 이슈 `#27~#33`은 **결번** |
| 같은 결함을 다시 발견 | 입력 방어 5/5 · 색 대비 4/5 · 가려진 대상 4/5 · 입력 소실 4/5 |

Reviewer와 QA를 나눈 건 좋았지만 **산출물만 두 배가 되고 결함은 문서에서 죽었다.**
그래서 둘을 `Verify` 하나로 합치고, 대신 **나가는 길을 강제**한다.

## decisions.md — AI가 못 정하는 것은 사람이 정한다

회차마다 `runs/<slug>/decisions.md` 하나. 기획 단계 결정 파일(`~/feature-spec/plan-2026-11/decisions-*.md`)과 별도로, 회차 파일에는 구현 중에 나온 질문과 답, 각 게이트에서 사람이 내린 결정을 적는다.

| 기록 항목 | 예시 |
|---|---|
| 에이전트가 "정해 달라"고 올린 것과 답 | 정렬 동률 규칙, 빈 목록 표시, 권한 없는 사용자 처리 |
| 우선순위 충돌과 선택 | 입력 보존과 체감 속도가 부딪힐 때 어느 쪽을 택했나 |
| 리뷰 P2와 P3를 반영하지 않은 이유 | 예: 10-N2 변이 생존은 다음 회차 e2e로 넘김, 이번 PR 범위 밖 |

형식은 표 한 줄 = 결정 하나. `| 날짜 | 출처(plan/dev/qa/review/gate) | 질문 | 결정 | 이유 |`.
**대화에만 남기지 않는다.** 게이트에서 한 답도 그 회차 파일에 한 줄 복사한다. 오케스트레이터가 쓴다.
이 구조의 공개본은 `~/onDo/docs/13-ai-harness.md`다. 여기 구조가 바뀌면 그 문서도 같이 고친다.

## findings.jsonl — 이 하네스의 중심

결함 1건 = JSON 한 줄. 회차 디렉터리에 하나씩 쌓인다.

```json
{"id":"F1","run":"retail-market","sev":"P0","type":"input-guard","screen":"02_product_detail",
 "what":"수량칸에 45.5 입력 → 455","repro":"...","expect":"...","evidence":"브라우저 1470px","exit":null}
```

**모든 줄의 `exit`이 채워져야 회차가 닫힌다.** 값은 셋뿐이다:

| `exit` | 뜻 |
|---|---|
| `fixed:<커밋해시>` | 같은 PR에서 고쳤다 |
| `issue:#<번호>` | `gh issue create`를 **실제로 실행했다** |
| `guard:<무엇>` | 재발을 막는 장치를 넣었다 (린트 규칙 / 컴포넌트 API / 순수함수 테스트) |

**"문서에만"은 없다.** 그게 53건을 죽인 경로다.

```bash
# 안 닫힌 것
jq -r 'select(.exit==null) | "\(.id) [\(.sev)] \(.what)"' runs/*/findings.jsonl
# 유형별 빈도 — 다음 회차 AC에 미리 박을 것을 고른다
jq -r .type runs/*/findings.jsonl | sort | uniq -c | sort -rn
```

**다음 회차 PM과 Verify는 `runs/*/findings.jsonl` 을 먼저 읽는다.** 이게 재발을 끊는 유일한 고리다.

## 반복 결함 4패턴 — 회차마다 확인한다

도매 5회차가 각자 따로 다시 찾은 것들. PM이 AC에 미리 박고, Verify가 매번 확인한다.

1. **숫자 입력 방어** — `45.5` → `455` (`replace(/[^0-9]/g,"")`)
2. **가려진 대상에 실행이 걸림** — 필터로 안 보이는 줄이 일괄 실행에 포함
3. **왕복하면 입력 소실** — 접었다 펴면 사라짐
4. **실행 신호 없음** — 표시가 없어 중복 실행

## 게이트는 두 곳

1. **PM 다음** — 스펙 오독은 구현까지 번진다. 열린 질문을 전부 사용자에게 올린다.
2. **Verify 다음** — 결함마다 `exit`을 사용자에게 받는다. 여기서 안 닫으면 문서에서 죽는다.

FE → Verify 는 자동으로 이어진다.

## 회차 센티널

```bash
echo "retail-shell" > .claude/harness/.active-run   # 시작할 때
rm -f .claude/harness/.active-run                   # 끝나면
```

훅이 이 파일을 읽어 **범위 밖 쓰기를 막는다** — 소매 회차면 `packages/ui`·`apps/wholesale`가 잠긴다.
프롬프트에 "읽기 전용입니다"라고 적는 대신 실제로 막는다.

## 브랜치·커밋

FE가 **이슈 1개 = 브랜치 1개 = 커밋 1개**로 진행한다. 앞 이슈 위에 쌓는다.

```
origin/dev
  └ feat-23-inventory-list        #23  커밋 1개
      └ feat-24-inventory-table   #24  커밋 1개
```

**각 커밋은 그 자리에서 빌드돼야 한다.** 전부 만들어 놓고 나중에 쪼개는 것은 불가능하다 —
재고 회차에서 1,288줄이 한 파일에 물려 실제로 실패했다.
**feature를 여는 첫 커밋은 5/5 회차 전부 400줄을 넘었다**(최대 1,260줄, 절반이 `fixtures.ts`).
`docs/03-git.md` 사유 기재를 미리 예정에 넣는다.

## 하네스가 하지 않는 것

- `git push` · PR 생성 · 이력 재작성
- 테스트 러너 도입 — `exit: guard`가 실제로 테스트를 요구할 때 `docs/08`의 범위(순수 함수만)로 넣는다
- GitHub 이슈 자동 생성 — 초안과 `create-issues.sh`까지. 실행은 사용자 승인 뒤

## /ondo-wire — 연동 회차 (2026-09-04 추가)

화면이 fixtures로 완성된 뒤, **feature 하나를 실제 API로 갈아 끼운다.** PM 단계가 없다 —
무엇을 붙일지는 스펙 스냅샷(`packages/api/openapi/<app>.json`)이 정한다.

```
/ondo-wire product                    # 도매 상품. mock(MSW)으로 확인
/ondo-wire cart --app retail          # 소매 장바구니
/ondo-wire product --mode dev         # dev 서버로 확인 (계정 필요)
```

| 위치 | 무엇 |
|---|---|
| `~/.claude/commands/ondo-wire.md` | 오케스트레이터. Wire → Verify → 결함 나가는 길 → 푸시·PR |
| `~/.claude/agents/ondo-wire.md` | 연동. 매핑 표 먼저, wire 타입은 생성 별칭만, fixtures 삭제 |
| `~/.claude/agents/ondo-verify.md` §연동 회차 | 네트워크 요청 수 · fixtures 잔존 · 손 wire 타입 |
| `../hooks/guard-wire-rules.sh` | PreToolUse — `fetch(` 직접 호출 · 손으로 쓴 `XxxResponse {` 차단 |
| `../hooks/check-wire-fixtures.sh` | Stop — fixtures 흔적이 남으면 크게 알림 |
| `./runs/wire-<slug>/04-wire.md` | 산출물. 매핑 표 · 스펙에 없는 것(= BE 요청) · 확인(mock/dev) |

센티널은 `wire-<slug>`(소매 `retail-wire-<slug>`). `guard-run-scope.sh`가 앱 범위를, `guard-wire-rules.sh`가 연동 규칙을 막는다.
