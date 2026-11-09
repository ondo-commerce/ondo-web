---
description: 온도(도매 ERP / 소매 마켓) feature 하나를 fixtures에서 실제 API로 갈아 끼운다. Wire → Verify 2단계. 화면은 이미 있고 스펙 스냅샷을 원본으로 삼는다.
argument-hint: <feature 이름> [--app wholesale|retail] [--mode mock|dev] [--from wire|verify]
---

# 온도 API 연동 하네스

대상 feature: **$ARGUMENTS**

너는 오케스트레이터다. **직접 분석하거나 구현하지 마라.** 연동은 `ondo-wire`, 검증은 `ondo-verify`가 한다.
네가 하는 일은 이슈·실행 디렉터리 준비, 에이전트 호출, 결함의 나가는 길 처리, 푸시·PR, 결과 요약이다.

`/ondo-tab`과 다른 점: **PM 단계가 없다.** 화면은 이미 fixtures로 완성돼 있고, 무엇을 붙일지는
스펙 스냅샷(`packages/api/openapi/<app>.json`)이 정한다. 새 스펙을 정하는 회차가 아니다.

## 준비

1. **앱을 정한다.** `--app`이 없으면 `wholesale`. feature 이름에 `소매`가 붙거나 소매 feature 이름
   (catalog·cart·search 등 `apps/retail/src/features/`에만 있는 것)이면 `retail`.

   | 앱 | 브리핑 | 스냅샷 | 데이터 경로 | 커밋 스코프 |
   |---|---|---|---|---|
   | `wholesale` | `harness/CONTEXT.md` | `packages/api/openapi/wholesale.json` | client Query + `QueryBoundary` | `feat(wholesale)` |
   | `retail` | `harness/CONTEXT-retail.md` | `packages/api/openapi/retail.json` | Server Component `serverApi()` + 상호작용만 Query | `feat(retail)` |

   **스냅샷이 없으면 여기서 멈춘다.** 손으로 타입을 쓰는 회차는 없다(ADR-0002).
2. feature 슬러그는 폴더 이름 그대로다 (`apps/<app>/src/features/<slug>/`). 없으면 멈추고 묻는다.
3. `--mode`: `mock`(기본)은 `NEXT_PUBLIC_API_MOCK=1`로 MSW가 답한다. `dev`는 dev 서버(`API_ORIGIN`)로 —
   인증 필요한 경로는 그 앱에 로그인할 계정이 있어야 한다. 도매 dev 계정이 없으면 `mock`으로만 돈다.
4. **이슈를 먼저 만든다.** 제목 `feat(<app>): <feature 한글> 실서버 연동 — <경로 요약>`.
   본문에 스냅샷에서 이 feature가 쓸 path 목록, 지우게 될 `fixtures.ts`, 완료 조건(아래 §Verify 기준)을 적는다.
   번호를 받아야 브랜치를 판다: `feat-<번호>-wire-<slug>`.
5. `~/onDo/.claude/harness/runs/wire-<slug>/` (소매는 `retail-wire-<slug>/`)를 만든다.
6. 회차 센티널: `echo "wire-<slug>" > ~/onDo/.claude/harness/.active-run` (소매는 `retail-wire-<slug>`).
   `guard-run-scope.sh`가 앱 밖 쓰기를 막고, **`guard-wire-rules.sh`가 `fetch` 직접 호출과 손으로 쓴 wire 타입을 막는다.**
   회차가 끝나면 지운다.
7. 작업 트리가 더러우면 에이전트를 띄우기 전에 사용자에게 알린다. 남의 미커밋 변경 위에 쌓지 않는다.
   분기 기준은 `origin/dev`. 연동 기반 PR(#148 계열)이 아직 dev에 없으면 그 브랜치 위에 쌓고 PR base도 그걸로.

## 파이프라인

### 1단계 — Wire  (`ondo-wire`)

프롬프트에 반드시 넣을 것:
- 앱 · 브리핑 파일명 · feature 슬러그 · 실행 디렉터리 절대경로
- 이슈 번호와 브랜치 이름 · 분기 기준
- 스냅샷 경로와 **이 feature가 쓸 path 목록**(네가 스냅샷에서 뽑아 넘긴다 — `jq '.paths | keys'`)
- `--mode`
- 선례: 계정 feature의 `api/session.ts`, `shared/api/{QueryBoundary,describeError,fieldErrors}.ts`(도매) /
  `shared/api/server.ts`(소매), `packages/api/src/mocks/wholesale/product.ts`(목 덮어쓰기)

산출물은 `04-wire.md` 하나와 코드다. Wire가 **`pnpm typecheck && pnpm lint && pnpm build`를 통과시키고 커밋**까지 한다.
Wire가 "스펙에 없다"고 적은 필드가 있으면 그 목록을 그대로 다음 단계와 마무리 보고에 넘긴다 — 그게 BE에 보낼 요청이 된다.

### 2단계 — Verify  (`ondo-verify`)

Wire 직후 자동 진행. 프롬프트에 **실행 디렉터리 + 앱 + `--mode` + 리뷰 범위(`git diff <분기기준>...HEAD`)**를 준다.
Verify에게 이 회차가 **wire 회차**임을 말한다 — `01-pm.md`·`02-fe.md` 대신 `04-wire.md`를 읽고, 브라우저는
`NEXT_PUBLIC_API_MOCK=1`(mock) 또는 `API_ORIGIN`(dev)으로 띄우며, **네트워크 탭에서 요청이 실제로 `/api/…`로 나가는지**와
**`fixtures` import가 남아 있지 않은지**를 본다.

결과는 `03-verify.md` + `findings.jsonl`. 판정이 `되돌려야 함`이면 멈추고 보고한다.

### 3단계 — 결함의 나가는 길

`findings.jsonl`의 모든 줄에 `exit`이 찰 때까지 닫지 않는다. **2026-09-01 이후 게이트는 자동으로 통과한다**
(사람 관여 최소화 지시). 규칙:

| 조건 | 할 일 | `exit` |
|---|---|---|
| `P0`·`P1` | `ondo-wire`를 `--from wire`로 다시 불러 같은 브랜치에 고친다 | `fixed:<해시>` |
| `P2` 이하 | **`gh issue create`를 실제로 실행한다** | `issue:#<번호>` |
| 재발 방지 장치가 더 싼 것 | 린트 규칙·훅·순수함수 테스트 | `guard:<무엇>` |

**"나중에"는 없다.** 사용자에게 물을 것은 "고칠지 말지"가 아니라 **스펙에 없는 필드처럼 코드로 못 닫는 것**뿐이다.

### 4단계 — 푸시·PR

`git push -u origin <브랜치>` 후 `gh pr create`. base는 §준비 7에서 정한 것. PR 본문에는
`04-wire.md`의 매핑 표 요약, 확인 표(mock/dev 어느 쪽으로 봤는지 **명시**), 스펙에 없는 필드 목록, 남긴 것.
**mock으로만 확인했으면 "dev 미확인"이라고 쓴다.** 목으로 본 것을 실서버 검증이라 쓰지 않는다.

## 마무리 보고

```
<feature> 연동 완료 — runs/wire-<slug>/  · PR #N (base <브랜치>)

Wire    path N개 연결 · fixtures.ts 삭제 ✅/잔존(이유) · 손 wire 타입 0 · typecheck/lint/build ✅
Verify  <판정> · 결함 N건(P0 N) · mock/dev · 네트워크 /api 요청 N건 확인
결함    fixed N · issue N (#…) · guard N   ← 합이 결함 수와 같아야 한다
BE 요청 스펙에 없는 필드 N개: …            ← 없으면 "없음"
```

## 어길 수 없는 것

- 에이전트 산출물을 네가 대신 쓰지 않는다. 실패하면 실패했다고 보고한다.
- **네가 커밋하지 않는다.** 커밋은 Wire만. 푸시·PR은 네가 한다.
- 스냅샷 없이 시작하지 않는다. 스냅샷을 손으로 고치지 않는다.
- `findings.jsonl`의 `exit`은 3단계 규칙대로 채우되 **실행 없이 채우지 않는다**(`gh issue create`를 실제로).
- mock으로 본 것을 dev로 봤다고 쓰지 않는다.
- 회차가 끝나면 `.active-run`을 지운다.
