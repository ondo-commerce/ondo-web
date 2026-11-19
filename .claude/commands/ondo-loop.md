---
description: 온도 기능 하나를 기획 → 디자인 → (Codex 비판) → G1 → 계약 → G2 → 구현+테스트 → Codex 리뷰 → QA → G3 → 보고 로 돌린다. 게이트 3곳에서 사람에게 묻는다. FE-only 모드가 기본이다.
argument-hint: <기능 한 줄> --app wholesale|retail [--slug loop-NN-name] [--from plan|design|contract|dev|review|qa]
---

# 온도 loop 오케스트레이터

요청: **$ARGUMENTS**

너는 오케스트레이터다. 산출물을 대신 쓰지 않는다. 에이전트를 부르고, 게이트에서 멈추고, 숫자를 센다.
설계 원문: `~/feature-spec/plan-2026-11/loop-design-2026-10-27.md`. 거기와 어긋나면 그 문서가 이긴다.

## 준비

1. 앱과 슬러그를 정한다. 슬러그는 `loop-NN-<name>` (NN은 `runs/`의 다음 번호).
2. `~/onDo/.claude/harness/runs/<slug>/` 를 만든다. 하위 `design/`, `qa/`, `issues/`.
3. 센티널을 **key=value 형식**으로 쓴다. stage가 바뀔 때마다 다시 쓴다.
   ```
   printf 'slug=%s\napp=%s\nstage=%s\n' <slug> <app> plan > ~/onDo/.claude/harness/.active-run
   ```
   `guard-run-scope.sh`가 stage별로 쓰기 경로를 자른다. 회차가 끝나면 지운다.
4. 작업 트리가 더러우면 멈추고 알린다. 분기 기준은 `origin/dev`.
5. `00-loop-report.md`를 만들고 각 stage의 시작 시각을 적어 둔다. 끝날 때 채운다.

## stage 1 — 기획 (`ondo-plan`) + 디자인 (`ondo-design`) + Codex 비판

1. `ondo-plan`에게: 요청 한 줄, 앱, 슬러그, 실행 디렉터리, 읽을 브리핑. 결과 `01-plan.md`.
2. `ondo-design`에게: 슬러그, `01-plan.md` 경로. **방향안 단계에서 멈춘다.** 스크린샷 경로를 받아 사용자에게 고르게 한다(질문 하나, 게이트 아님). 선택을 넘겨 와이어프레임을 완성시킨다.
3. **Codex 비판**: `mcp__codex__codex_ask`에 `01-plan.md` 전문, 와이어프레임 경로, `glossary.md` 요약을 주고 묻는다. "각 AC로 테스트를 쓸 수 있는가, 사장 하루 일과에서 빠진 경우는, 현재 코드와 부딪히는 곳은, 와이어프레임과 AC가 어긋난 곳은." 결과를 `runs/<slug>/codex-plan-r1.md`에 저장한다.
4. `ondo-plan`을 다시 불러 비판 목록을 넘긴다. §9 반박 기록을 채운다. 상한 2라운드.
5. **★ G1.** 사용자에게 올린다: §9 반박 기록 먼저, 그다음 §7 열린 질문(추천 포함), Story 수, 디자인 결정. **승인을 기다린다.** 답이 결정 로그 줄이 된다(`~/feature-spec/plan-2026-11/decisions-*.md`에 추가).
6. 승인되면 `create-issues.sh`를 **실제로 실행**하고 번호를 `01-plan.md` §8에 적는다.

## stage 2 — 계약 (`ondo-dev`, 이슈 1번)

센티널 `stage=contract`. `ondo-dev`에게 이슈 번호, 브랜치 이름, `01-plan.md` §5. 스냅샷에 op 추가(`x-ondo-draft`), codegen, 목 핸들러, 커밋.
**★ G2.** 사용자에게 `git diff origin/dev...HEAD -- packages/api/openapi` 전문과 목 핸들러 요약을 올린다. 승인을 기다린다. 기존 op가 바뀌었으면 승인 전에 되돌린다.

## stage 3 — 구현 + 테스트 (`ondo-dev`)

센티널 `stage=dev`. 시작할 때 `runs/<slug>/decisions.md`가 없으면 헤더만 만든다(아래 "결정 기록" 절). 나머지 이슈를 순서대로. 이슈마다 4종 검증 통과 커밋. 결과 `02-dev.md`. dev 브리프에 우선순위 네 줄을 넣는다(아래 "우선순위" 절).

## stage 4 — 코드 리뷰 (Codex)

센티널 `stage=review`. `mcp__codex__codex_review`를 `cwd=~/onDo`, `extra_args=["--base","origin/dev"]`로 돌린다. 리뷰 지시에 우선순위 네 줄을 함께 주고 "이 순서로 보고 지적마다 P0~P3을 붙여라, 스타일은 P3"라고 한다. 결과를 `03-review.md`에 저장하고 **재현 가능한 지적만** `findings.jsonl`에 `type:"review"`로 옮긴다. sev는 우선순위로 정한다: 1순위(서버와 어긋남) 위반은 P0 또는 P1, 2순위(입력 소실, 실패 은폐) 위반은 P1, 3순위(속도)는 P2, 4순위(구조)는 P3. Codex가 붙인 레벨과 다르면 근거를 적는다.
P0, P1이 있으면 `ondo-dev --from review-fix`로 고치고 Codex를 한 번 더 돌린다. 상한 2라운드. 넘으면 사용자에게 올린다.

## stage 5 — QA (`ondo-qa`)

센티널 `stage=qa`. `ondo-qa`에게 슬러그, 앱, `--mode mock`, 리뷰 범위 `git diff origin/dev...HEAD`. 결과 `04-qa.md`, `findings.jsonl`, `e2e/<slug>/`.
판정이 `되돌려야 함`이면 멈추고 보고한다.

## stage 6 — ★ G3 결함 처리

`exit=null`인 줄을 모은다.
- P0, P1: 건별로 사용자에게. 선택지 fixed / issue / guard / accept(이유).
- P2, P3 중 `contrast`, `layout`, `a11y`, `design`: **이슈 1개로 묶은 초안**을 만들어 "묶음 승인"만 받는다.
- 결정대로 실행한다: fixed → `ondo-dev --from review-fix`, issue → `gh issue create` 실제 실행, guard → `ondo-dev --guard`(센티널 `stage=guard`), accept → `exit:"accept:<이유>"`.
`exit=null`이 남으면 닫지 않는다. G3에서 사용자가 답한 것(특히 accept 이유와 P2, P3 묶음 결정)은 `runs/<slug>/decisions.md`에 한 줄씩 복사한다.

## stage 7 — 메타 리뷰와 보고

1. `mcp__codex__codex_ask`에 `01-plan.md`, `git diff`, `04-qa.md`를 주고 "기획과 구현이 어긋난 곳"을 묻는다. `codex-meta.md`에 저장. 새 결함이면 findings에 추가하고 G3로 돌아간다.
2. `00-loop-report.md`를 채운다:
   ```
   stage별 소요 시간 · 게이트 대기 시간 · dev↔리뷰 라운드 · AC 수 / 테스트 수 · 자기보고 불일치 · findings(유형·심각도·exit) · 산출물 줄 수 · 커밋 수 · 4종 검증 통과율 · 문제(프로세스가 막힌 곳)와 다음 회차에 바꿀 것
   **소마 보고서용 3줄(10-28 R26)**: ① 이 기능이 평가위원 질문 6개 중 어디에 답하는지 한 줄 ② "문제점 및 해결" 표 소재(개발 중 막힌 것과 푼 방법) 한 줄 ③ 중간점검 의견과 연결되면 그 의견 번호 한 줄
   ```
3. **푸시와 PR (2026-10-28 D29부터 하네스가 한다).** 회차 브랜치를 순서대로 `git push -u origin <branch>` 하고 `gh pr create`로 **스택 PR**을 연다: 첫 브랜치는 base `dev`, 다음은 base가 앞 브랜치. 제목은 커밋 제목(이슈 번호 끝). 본문 템플릿:
   ```
   closes #<이슈>  (한 이슈에 PR이 2개면 "part of #<이슈>")
   ## 무엇을  (기획안 §6 AC ID로 3~6줄)
   ## AI 리뷰  (03-review.md 요약: P0/P1/P2 수와 fixed 해시. Codex 로컬 리뷰, PR 코멘트 없음)
   ## QA  (04-qa.md 머리: 판정, AC M/N, 변이 검사, 자기보고 불일치)
   ## 400줄 초과 사유  (해당 시 한 줄)
   ## 머지 순서  (앞 PR 번호. squash 뒤 base 자동 전환)
   <세션 링크 줄>
   ```
   `--no-verify` 금지, force-push 금지. 리뷰 코멘트는 PR에 따로 달지 않는다(로컬 리뷰 결과가 본문에 들어간다).
4. **코드래빗 처리 (D30).** PR을 연 뒤 base가 dev가 아니면 본문 끝에 `@coderabbitai review`를 넣어 수동 호출한다. 5분 뒤 `gh api repos/<r>/pulls/<n>/comments`로 inline 지적을 모아 findings에 `type:"review", src:"coderabbit"`으로 넣는다. 재현되면 `ondo-dev --from review-fix`로 고치고 커밋·push, 아니면 `accept:<이유>`와 그 스레드에 한 줄 답글(`gh api … /comments/<id>/replies`). 읽지 않고 머지하지 않는다. 지적 0건은 '안 봄'일 수 있으므로 Codex 로컬 리뷰를 대체하지 않는다.
5. 사용자에게 한 화면 요약: PR 번호, 머지 순서, 코드래빗 지적 수와 처리.
4. 센티널을 지운다.

## 모델 배치 (결정 D25, 2026-10-27)

정확도가 걸린 역할은 **Opus**, 노가다 성격은 **Haiku**. Sonnet은 쓰지 않는다. Fable은 설계와 회고 세션에만.

| 역할 | 모델 | 호출 방법 |
|---|---|---|
| ondo-plan, ondo-design(방향안·와이어프레임), ondo-dev, ondo-qa, ondo-verify, ondo-wire, ondo-fe, ondo-pm | Opus | 에이전트 파일 `model: opus` 고정(2026-11-10 #437 — 고정 없던 넷이 세션 모델을 상속해 회차 보고와 실제가 달랐다) |
| 디자인 2단계 레퍼런스 수집(크롬 열고 캡처, 표 작성) | Haiku | ondo-design을 `model: haiku`로 따로 한 번 호출해 `design/references.md`와 캡처만 만들게 하고, 그 결과를 Opus 호출에 넘긴다 |
| 회차 보고 문장, Confluence 올리기, HTML 문서 갱신 | Haiku | general-purpose를 `model: haiku`로. **숫자(PR 수, 테스트 수, findings 개수)는 Haiku가 세지 않는다** — 오케스트레이터가 명령으로 실측해 브리프에 적고 Haiku는 옮기기만(11-09~10 숫자 오기 세 번) |
| 그 밖의 general-purpose(서버 응답 대조 등 판단이 걸린 일) | Opus | **`model` 인자를 반드시 준다.** 안 주면 세션 모델을 상속한다 |
| 기획·디자인 비판, 메타 리뷰 | Codex | `codex_ask`. 매 회차 |
| 코드 리뷰 | Codex | `codex_ask`. **앱 코드가 바뀐 회차만.** 시험이나 문서만 바뀐 회차는 생략 |
| 오케스트레이터 | Opus | 프로젝트 `.claude/settings.json` `"model": "opus"`가 기본. 하네스 설계와 회고 세션만 `/model`로 Fable |

**회차 보고의 모델 칸**은 짐작으로 쓰지 않는다. 에이전트 완료 알림과 에이전트 파일의 `model:`을 보고 실제 값을 적는다.

**Codex 호출 머리말**(모든 `codex_ask` 프롬프트 첫 줄들에 그대로 넣는다, 11-09~10 중국어 답 1회, "실행 금지"를 읽기 금지로 알아들은 헛돌기 1회):
```
한국어로 답하라.
읽기 명령(git diff, git show, cat, grep, sed)은 써도 된다. 테스트, 서버, 빌드 실행과 파일 수정만 하지 마라.
문서는 git 밖 경로일 수 있다. 파일 시스템에서 직접 읽어라.
우선순위(지적마다 P0~P3): 1 화면이 서버와 어긋나지 않는다(무효화, 롤백, 중복 제출, 늦은 응답, 409) → 2 사용자가 한 일을 잃지 않고 실패를 숨기지 않는다 → 3 빠르게 느껴진다 → 4 다음 사람이 고칠 수 있다. 1순위 위반 P0 또는 P1, 2순위 P1, 속도 P2, 구조·스타일 P3.
```

(삭제, 2026-11-10 #437) 승급 규칙(Opus가 두 번 막히면 같은 이슈를 Fable로 재호출)은 loop-01 이후 한 번도 쓰이지 않았다. 막히면 오케스트레이터가 사람에게 묻는 지금 규칙으로 충분하다.

**토큰 다이어트(모델과 무관)**: stage마다 오케스트레이터가 `runs/<slug>/brief-<stage>.md`(그 stage의 AC와 건드릴 파일만)를 만들어 넘긴다. 에이전트는 findings 전체 대신 `findings-summary`(유형별 개수 + 최근 3회차)만 읽는다. 개발은 관련 spec만 돌리고 전체 e2e는 마지막 한 번. `02-dev.md` 150줄 상한.

**측정**: 회차 보고에 역할별 모델과 토큰을 적고 loop-01(기획 49만, 디자인 63만, 개발 97만, QA 33만, 전부 Fable)과 비교한다. AC당 결함 수와 자기보고 불일치가 오르는 역할만 한 단계 올린다.

## 회차 운영 규칙 추가 (loop-04·05a에서 겪음, 10-28)

1. **디자인은 기획 2라운드(Codex 비판 반영) 뒤에 시작한다.** 병렬로 돌리면 r2에서 늘어난 AC를 디자인이 못 보고 재작업이 생긴다(05a: AC 23→29).
2. **QA spec은 그 기능이 들어간 이슈 커밋에 넣는다.** 뒤 이슈 기능을 보는 QA 테스트를 앞 커밋에 넣으면 커밋 단독 e2e가 깨진다(05a: 8개 이동에 53만 토큰).
3. 수정 지시에는 "각 커밋 단독으로 4종 + 관련 e2e 초록" 조건을 명시한다.
4. Codex 리뷰와 QA는 병렬, 수정은 1회로 묶는다(loop-03·04에서 효과 확인).
5. Confluence는 요약 30줄 + 원문 경로(loop-04 전문 변환 35만 토큰 → side-02 요약 13만).
6. 긴 기획안 줄 수 추정은 버린다. PR 분할 기준(화면 1장, 800줄 사유)만 적는다.

## 게이트 질문은 "결정 패킷"으로 (loop-01 G2에서 겪음)

사용자는 코드를 읽는 사람이 아니라 결정하는 사람이다. G2에서 diff 명령과 스키마 용어로 올렸다가 두 턴을 더 썼다.
게이트마다 **먼저 말로, 사장 입장에서 3줄 이내**로 요약하고, 결정마다 아래 다섯 칸을 채운다. 코드, diff, 명령은 사용자가 원할 때만 따로.

```
질문 한 줄 → 선택지 2~3개 → 추천과 이유 한 줄 → 다르게 고르면 바뀌는 것 한 줄 → 기본값과 기한(되돌릴 수 있는 결정만)
```

"OK" 한 마디로 닫힐 수 있게 쓴다. 산문으로 7개를 설명하지 않는다.

## 에이전트가 목록에 없을 때 (loop-01에서 겪음)

새로 만든 에이전트 파일은 **세션을 시작할 때** 읽힌다. `Agent type 'ondo-plan' not found`가 나오면
`general-purpose`로 부르되 프롬프트 첫 줄에 "먼저 `~/.claude/agents/<역할>.md`를 읽고 그 규칙을 전부 따른다"를 넣는다.
`00-loop-report.md` 문제 절에 적는다. 다음 세션에서는 이름으로 부른다.

## 문제가 생기면

에이전트가 도구가 없어 막히거나, 규칙끼리 충돌하거나, 같은 실패가 두 번 나면 **그 자리에서 멈추고 사용자에게 알린다.** 우회해서 넘어가지 않는다. 그리고 `00-loop-report.md` "문제" 절에 적는다. 이게 다음 회차 프롬프트를 고치는 재료다.

## 어길 수 없는 것

- 산출물 대필 금지. exit 임의 기입 금지. 게이트 자동 통과 금지. 커밋은 dev 에이전트만. 푸시·PR은 stage 7에서 오케스트레이터만(D29). force-push, 브랜치 삭제, PR 머지는 사용자만.
- `gh issue create`는 실제로 실행하고 번호를 결과에서 읽는다.
- Codex 호출은 네가 한다(서브에이전트엔 그 도구가 없다).

## 우선순위 (2026-11-09, 멘토링 반영)

우선순위(`~/onDo/CLAUDE.md` "우선순위" 절, 아직 dev에 없으면 이 네 줄이 원본): 1 화면이 서버와 어긋나지 않는다(무효화 범위, 롤백, 중복 제출, 늦은 응답 버리기, 409) → 2 사용자가 한 일을 잃지 않고 실패를 숨기지 않는다(입력 보존, 폼 잠금, 에러 문구, 재시도 경로) → 3 빠르게 느껴진다 → 4 다음 사람이 고칠 수 있다. 도매는 1, 2가 항상 먼저. 소매 탐색 화면만 3이 2보다 앞.
에이전트 브리프(dev, qa)와 Codex 리뷰 지시에 이 네 줄을 그대로 넣는다. 에이전트가 두 항목 중 하나를 포기해야 한다고 올리면 게이트가 아니어도 사용자에게 묻고 답을 `decisions.md`에 적는다.

## 결정 기록 decisions.md (2026-11-08 멘토링 반영)

회차 시작 때 `runs/<slug>/decisions.md`를 만든다(헤더만). 그 뒤 세 경우에 한 줄씩 **오케스트레이터가** 쓴다:
1. 게이트(G1, G2, G3)에서 사용자가 답한 것 — `decisions-*.md`에도 쓰지만 회차 파일에도 복사한다.
2. 에이전트가 "정해 달라"고 올린 것과 사용자 답(정렬 동률, 빈 상태, 권한 없는 사용자, 우선순위 충돌).
3. Codex 리뷰 P2, P3를 반영하지 않기로 한 것과 이유.
형식: `| 날짜 | 출처 | 질문 | 결정 | 이유 |`. 비어 있으면 회차 보고에 "결정 0건"이라고 적고 넘어간다. 없는 결정을 지어내지 않는다.

