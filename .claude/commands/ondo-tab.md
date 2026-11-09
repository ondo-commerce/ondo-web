---
description: 온도(도매 ERP / 소매 마켓) 화면 묶음 하나를 PM → FE → Verify 3단계로 개발한다. PM 산출물과 결함 처리에서 멈춘다.
argument-hint: <탭 이름> [--app wholesale|retail] [--from pm|fe|review|qa]
---

# 온도 탭 개발 하네스

대상 탭: **$ARGUMENTS**

너는 오케스트레이터다. **직접 분석하거나 구현하지 마라.** 각 단계는 전용 에이전트가 한다.
네가 하는 일은 실행 디렉터리 준비, 에이전트 호출, 게이트에서 멈추기, 결과 요약뿐이다.

## 준비

1. **앱을 먼저 정한다.** `--app`이 없으면 기본은 `wholesale`이다.
   탭 이름에 `소매`가 붙거나 소매 화면 이름(마켓·장바구니·주문서·거래처·계정 등)이면 `retail`로 본다.
   애매하면 사용자에게 묻는다 — 앱을 잘못 잡으면 네 단계가 전부 틀린 사양을 읽는다.

   | 앱 | 브리핑 | 사양 | 커밋 스코프 | dev 명령 |
   |---|---|---|---|---|
   | `wholesale` | `harness/CONTEXT.md` | `~/feature-spec/wholesale_screen_spec.md` | `feat(wholesale)` | `pnpm --filter wholesale dev` |
   | `retail` | `harness/CONTEXT-retail.md` | `~/feature-spec/retail_screen_spec.md` | `feat(retail)` | `pnpm --filter retail dev` |

2. 탭 이름을 슬러그로 바꾼다.
   - 도매: 재고→`inventory`, 주문→`orders`, 미송→`backorders`, 출고→`shipments`,
     정산→`settlements`, 상품→`products`, 대시보드→`dashboard`.
     `apps/wholesale/src/shared/config/nav.ts`의 `href`가 슬러그의 원본이다.
   - 소매: **`retail-` 접두사를 붙인다.** 셸→`retail-shell`, 계정→`retail-account`,
     마켓 탐색→`retail-market`, 장바구니→`retail-cart`, 주문→`retail-order`,
     미송→`retail-backorder`, 정산·거래처→`retail-settlement`, 설정→`retail-settings`.
3. `~/onDo/.claude/harness/runs/<slug>/` 를 만든다.
4. **회차 센티널을 쓴다.**

   ```bash
   echo "<slug>" > ~/onDo/.claude/harness/.active-run
   ```

   훅(`.claude/hooks/guard-run-scope.sh`)이 이 파일을 읽어 **범위 밖 쓰기를 실제로 막는다** —
   소매 회차면 `packages/ui` · `apps/wholesale` 쓰기가 차단된다. 프롬프트로 부탁하지 않는다.
   **회차가 끝나면 지운다**(`rm -f`). 안 지우면 다음 작업이 막힌다.
5. `--from`이 주어지면 그 단계부터 시작한다. 없으면 PM부터.

## 파이프라인

### 1단계 — PM  (`ondo-pm`)

프롬프트에 반드시 넣을 것: **앱(`wholesale`/`retail`)과 읽을 브리핑 파일명**, 탭 이름, 슬러그,
실행 디렉터리 절대경로, 해당 앱 사양 파일에서 그 탭의 절 번호와 Figma node-id.

**끝나면 여기서 멈춘다.** 사용자에게:
- `01-pm.md` 요약 (Epic 한 줄, Story 목록 + 크기, 총 예상 일수)
- **열린 질문**을 전부 그대로 옮긴다. 이게 게이트의 핵심이다
- 이슈 초안 파일 경로와 `create-issues.sh` 경로

그리고 **사용자 응답을 기다린다.** 임의로 다음 단계로 넘어가지 않는다.
사용자가 이슈 생성을 승인하면 `create-issues.sh`를 실행하고, 생성된 이슈 번호를 `01-pm.md`에 적어 넣는다.

### 2단계 — FE  (`ondo-fe`)

사용자 승인 후 진행. **브랜치는 네가 만들지 마라 — FE가 이슈마다 직접 판다.**
FE는 `이슈 1개 = 브랜치 1개 = 커밋 1개`로 진행하고, 앞 이슈 브랜치 위에 다음 브랜치를 쌓는다.

프롬프트에 넣을 것:
- 실행 디렉터리 · **앱(`wholesale`/`retail`)과 읽을 브리핑 파일명**
- **이슈 번호와 브랜치 이름을 순서대로 짝지어 준 표** (`#23 → feat-23-inventory-list` …).
  이름을 FE가 짓게 두면 회차마다 규칙이 흔들린다. `01-pm.md` §6의 표를 그대로 넘긴다
- 분기 기준 (`origin/dev`가 기본. 이어 붙이는 작업이면 그 브랜치)
- 게이트에서 사용자가 준 답변

작업 트리가 더러우면 FE를 띄우기 전에 사용자에게 알린다. 커밋되지 않은 남의 변경 위에 브랜치를 쌓지 않는다.

### 3단계 — Verify  (`ondo-verify`)

FE 완료 직후 자동 진행. 프롬프트에 **실행 디렉터리 + 앱 + 리뷰 범위**를 준다.
범위는 `git diff origin/dev...HEAD`(= 마지막 브랜치까지 누적)이다.
FE가 두 이슈를 한 커밋으로 합쳤다면 그 사실도 넘긴다.

Verify는 **브라우저를 반드시 띄운다.** 결과는 두 파일이다 —
`03-verify.md`(판단, 200줄 이하)와 **`findings.jsonl`**(결함 1건 = 한 줄).

판정이 **`되돌려야 함`**이면 거기서 멈추고 사용자에게 보고한다.

### 4단계 — 결함 처리 게이트 (사람이 판단한다)

**이 게이트가 이번 하네스의 핵심이다.** 도매 5회차에서 QA가 찾은 결함 53건이 전부
문서에만 남고 이슈가 0건이었다(후속 이슈 `#27~#33`은 결번). 그 경로를 없앤다.

`findings.jsonl`의 **모든 줄에 `exit`이 채워질 때까지 회차를 닫지 않는다.**

```bash
# 남은 것 확인
jq -r 'select(.exit == null) | "\(.id) [\(.sev)] \(.what)"' runs/<slug>/findings.jsonl
```

사용자에게 P0부터 순서대로 올리고, 각 건마다 셋 중 하나를 받는다:

| 선택 | 네가 할 일 |
|---|---|
| **고친다** | `ondo-fe`를 `--from fe`로 다시 불러 같은 브랜치에 커밋. `exit` = `fixed:<해시>` |
| **이슈로 남긴다** | **`gh issue create`를 실제로 실행한다.** `exit` = `issue:#<번호>` |
| **장치로 막는다** | 린트 규칙·컴포넌트 API·순수함수 테스트. `exit` = `guard:<무엇>` |

**"나중에" 는 선택지가 아니다.** 미루려면 이슈로 남긴다 — 그게 이슈의 용도다.
`exit`을 채우는 것은 **네가 아니라 사용자 답변 뒤에** 한다. 임의로 채우지 마라.

## 마무리 보고

사용자에게 한 화면 안에 들어오는 요약:

```
<탭> 하네스 완료 — runs/<slug>/

PM      Story N개 · 예상 N일 · 이슈 #N,#N
FE      파일 N개 · AC N중 M 충족 · typecheck/lint/build ✅
Verify  <판정> · 결함 N건(P0 N) · 반복 4패턴 중 N건 걸림 · 브라우저 N라우트

결함 처리
  fixed N · issue N (#N,#N) · guard N   ← 합이 결함 N건과 같아야 한다
  남은 exit=null: 0건

브랜치 스택
  feat-N-... <해시>
  ...
```

**`exit=null`이 하나라도 남으면 "완료"라고 쓰지 마라.** 몇 건이 왜 안 닫혔는지 적는다.

**푸시·PR 생성은 하지 않는다.** 커밋까지가 하네스의 범위이고, 올리는 것은 사용자가 결정한다.
마무리 보고에 **브랜치 스택과 커밋 해시를 순서대로** 적어 사용자가 그대로 push·PR 할 수 있게 한다.

## 어길 수 없는 것

- 에이전트가 낼 산출물을 네가 대신 쓰지 않는다. 에이전트가 실패하면 실패했다고 보고한다.
- **네가 커밋하지 않는다.** 커밋은 FE만 한다. FE가 빠뜨린 것을 네가 주워 담으면 커밋 경계가 무너진다.
- 단계를 건너뛰지 않는다. `--from`으로 사용자가 지시한 경우만 예외다.
- PM 게이트를 자동 통과하지 않는다.
- **`findings.jsonl`의 `exit`을 네 판단으로 채우지 않는다.** 사용자 답변이 근거다.
- **`gh issue create`는 "실행했다"고만 쓰지 말고 실제로 실행한다.** 도매에서 스크립트를 안 돌려
  이슈 7건이 통째로 사라졌다(`#27~#33` 결번).
- 회차가 끝나면 `.active-run` 을 지운다.
