# onDo — 온도 웹 모노레포

동대문 도소매 직거래. **도매 = 온도 ERP(`apps/wholesale`) · 소매 = 온도 마켓(`apps/retail`)**.

이 파일은 **색인이지 사본이 아니다.** 자세한 건 `docs/`에 있고 여기엔 매번 필요한 것만 둔다.

## 구조

```
apps/wholesale/   도매 ERP (포트 3000)   apps/retail/   소매 마켓 (포트 3001)
  src/app/<route>/page.tsx    라우트. 얇게 — 뷰 컴포넌트 한 줄 호출
  src/features/<name>/        도메인 있는 것 전부
      components/ types.ts constants.ts fixtures.ts derive.ts index.ts
  src/shared/                 그 앱 안에서 2곳 이상 쓰는 것
packages/ui/      도메인 없는 것만 (primitives / patterns)
packages/config/  eslint · typescript 공유 설정 (prettier는 루트 .prettierrc.json)
```

**선례로 삼을 것: `apps/wholesale/src/features/product/`.** 폴더 구성·주석 밀도·네이밍의 기준이다.

## 검증 — 이 네 개가 전부다

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm build
```

- `pnpm typecheck`와 `pnpm lint`는 `e2e/`도 본다(`typecheck:e2e`, `lint:e2e`. 실행은 안 한다)
- `pnpm test` = vitest. **순수 함수만**(`features/*/derive.ts` 옆 `*.test.ts`). 컴포넌트 렌더 테스트는 안 한다(`docs/08` 규칙 7)
- `pnpm e2e` = Playwright, mock 모드(`NEXT_PUBLIC_API_MOCK=1`). `e2e/<회차>/`에 쌓인다. CI는 아직 안 돈다(dev 서버 필요)
- CI(`.github/workflows/ci.yml`)는 위 4개를 돈다. 없는 테스트를 있다고 말하지 않는다
앱 하나만: `pnpm --filter retail dev`

## 커밋

```
<type>(<scope>): <한국어 개조식 50자 이내, 마침표 없음> #<이슈번호>
```

- **이슈번호는 맨 끝.** 앞에 두면 commitlint가 type을 못 읽는다
- type 9종: `feat fix refactor style design docs test chore perf` (`design` = UI/CSS 변경)
- scope 7종: `wholesale retail ui api shared config deps` — **생략 불가**
- **제목 첫 글자를 대문자로 시작하지 않는다** (`subject-case`). 파일명이 앞이면 `루트 CLAUDE.md 추가`처럼 앞에 말을 붙인다
- 1커밋 = 1논리 변경. `--no-verify` 금지 (husky가 commitlint·lint-staged를 돌린다)
- 브랜치 `<type>-<이슈번호>-<요약>` (예: `feat-23-inventory-list`). **슬래시 금지** — Vercel preview 도메인이 잘린다
- `feat`→`dev` squash · `dev`→`main` merge commit · `dev`→`feat` 동기화는 rebase
- PR 400줄 넘으면 사유 한 줄, 800줄 넘으면 분할. **이슈·PR은 화면 1장 단위** — 한 화면이 800줄을 넘으면 사유와 파일 구성을 PR 본문에 (`docs/03-git.md`)

## import 방향 — 한 방향뿐이다

`app → features → shared → packages`. 역방향·수평 참조 금지. **ESLint가 막는다.**

- feature 밖에서는 `features/<name>/index.ts`에 export된 것만 가져온다
- feature끼리 직접 import하지 않는다 — 필요하면 `app/`에서 조립하거나 `shared/`로 내린다.
  **상수는 feature마다 중복 정의하는 게 정답이다** (`FILTER_ALL`이 탭마다 따로 있는 이유)
- `apps/wholesale` ↔ `apps/retail` 직접 참조 금지. 같은 게 필요하면 복제하거나 `packages/`로
- 2단계 이상 상대경로(`../../`) 금지. `@/` 별칭을 쓴다

## 코드 규칙

- **색·간격에 원시값을 쓰지 않는다.** `bg-[#3182f6]`도 `bg-blue-500`도 금지 — 의미 토큰만
  (`bg-primary`, `text-muted-foreground`). 필요한 의미가 없으면 `packages/ui/src/styles/theme.css`에
  슬롯을 먼저 판다. 여백은 Tailwind 기본 스케일 그대로
- `any` · `@ts-ignore` · `console.log` 금지. `@ts-expect-error`는 설명 필수
- **파생값은 `derive.ts`의 순수 함수로.** JSX 안에서 계산하지 않는다
- **더미는 `fixtures.ts`에.** 컴포넌트 안에 데이터를 적지 않는다. API가 붙으면 이 파일만 지운다
- 주석은 **왜**를 적는다. 무엇은 코드에 있다. 한국어
- `TODO`는 `TODO(#57)` 형식 — 이슈 없는 TODO를 남기지 않는다
- tsconfig가 `strict` + `noUncheckedIndexedAccess` + `verbatimModuleSyntax`다.
  `arr[0]`은 `T | undefined`이고 타입은 `import type`으로 가져와야 한다

## 우선순위 — 둘 다 못 지키면 위의 것을 지킨다

코드를 짜거나 리뷰할 때 충돌하면 이 순서다. 2026-11-08 멘토링의 "정합성 > 성능 > 유지보수성"을 FE 말로 옮겼다. 바꾸려면 `docs/adr/`에 기록한다. 이 절이 원본이고 README와 `docs/13`은 여기를 가리킨다.

| 순위 | 지키는 것 | 이 레포에서 실제로 보는 곳 |
|---|---|---|
| 1 | 화면이 서버와 어긋나지 않는다 | 변이 뒤 무효화 범위, 낙관적 업데이트 롤백, 중복 제출 방지, 늦게 도착한 응답 버리기, 409 처리 |
| 2 | 사용자가 한 일을 잃지 않고 실패를 숨기지 않는다 | 저장 실패 시 입력 보존과 폼 잠금, 에러 문구, 재시도와 재로그인 경로 |
| 3 | 빠르게 느껴진다 | 로딩 표시, 불필요한 리렌더, 목록 재조회 조건, 소매 첫 화면(Server Component fetch) |
| 4 | 다음 사람이 고칠 수 있다 | `features/product` 선례, derive 순수 함수, import 방향 |

- 도매는 재고, 주문, 정산 화면이라 1과 2가 항상 먼저다. 빠른데 틀린 화면보다 느린데 맞는 화면.
- 소매의 탐색 화면(첫 화면, 검색, 상품 상세)은 3을 2보다 앞에 둔다. 장바구니, 주문, 품절처럼 재고가 걸리는 화면은 도매와 같다. 이 소매 구분은 멘토 말이 아니라 2026-11-09에 내가 정한 것이다.
- 가용성(장애, 배포)은 인프라 몫이라 여기서 따지지 않는다.
- AI가 우선순위 항목 중 하나를 포기해야 하면 사람에게 묻는다. 혼자 고르지 않는다. 답은 회차 `decisions.md`에 남긴다(`docs/13-ai-harness.md` 4절).

## 두 앱의 결정적 차이

| | 도매 `wholesale` | 소매 `retail` |
|---|---|---|
| 스크롤 | **화면 전체 스크롤 없음.** `h-dvh` 고정, 넘치면 `Panel.Body`가 받는다 | **문서형 세로 스크롤.** 위 규칙 미적용 |
| 셸 | 상단 헤더 + 주 메뉴 7탭 | 상단 헤더 + 통합 검색 · 찜 · 장바구니 · 계정 드롭다운 |
| 렌더 | Client 기본 | **Server Component fetch 기본** (SEO) |

**도매 `AppShell`·`Topbar`를 소매로 복사하지 않는다** — `h-dvh` 전제가 안 맞는다.

## packages/ui 는 읽기 전용이다

앱 작업 중에 고치지 않는다. 고쳐야 하면 `design(ui)` 이슈를 먼저 연다.
승격은 **Rule of Two** — 한 화면만 쓰면 feature 안에, 2번째 사용처가 생긴 그 PR에서 `shared/`로,
다른 앱도 쓰고 도메인 지식이 없을 때만 `packages/ui`로 (`docs/04-component-strategy.md`).

## 더 볼 것

`docs/03-git.md` 브랜치·커밋·PR · `docs/04-component-strategy.md` 승격 규칙 ·
`docs/02-folder-structure.md` 폴더·네이밍 · `docs/08-tech-debt-rules.md` 부채 규칙 · `docs/adr/` 결정 기록 ·
`docs/13-ai-harness.md` AI 개발 하네스(에이전트 역할, findings, decisions)

⚠️ **`docs/`는 계획이고 코드는 그보다 얇다.** `packages/api`·MSW·TanStack Query·Zustand는
ADR엔 있으나 **아직 없다.** 데이터는 전부 `fixtures.ts` 정적 더미다. 문서를 근거로 없는 걸 있다고 쓰지 않는다.
