# 00. 전체 체크리스트 (P0 → P3) — Frontend 범위

> 이 문서 하나만 보고 순서대로 처리하면 된다. 상세는 링크 참조.
> **담당 표기**
> - `FE` = 내가 혼자 결정하고 실행 (대부분)
> - `요청` = BE에 요청/합의해야 하는 의존성. 내 작업이 아니라 **받아내야 하는 것**

---

## P0 — Week 0. 이거 없으면 첫 커밋을 못 친다

### 레포 & 환경
- [ ] `FE` `ondo-web` 레포 생성 (모노레포 1개) → [01](01-repository.md)
- [ ] `FE` `main` 브랜치 보호 규칙 ON (PR 필수 / CI green / force push 금지)
- [ ] `FE` Node 버전 고정 (`.nvmrc` + `engines`) — **22 LTS**
- [ ] `FE` 패키지 매니저 고정 (`packageManager: "pnpm@9.x"`) — npm/yarn 혼용 시 lockfile 지옥
- [ ] `FE` Turborepo 초기화 + `apps/wholesale`, `apps/retail` 생성 → [02](02-folder-structure.md)
- [ ] `FE` Vercel 프로젝트 **2개** 연결 (Root Directory 각각 지정 + `turbo-ignore`)
- [ ] `FE` `.env.example` 커밋 + `shared/config/env.ts`에서 zod 검증 (`.env*`는 gitignore)

### 협업 규칙
- [ ] `FE` 브랜치 전략 확정 (`main`/`dev`/`feat-*`) → [03](03-git.md#브랜치-전략)
- [ ] `FE` 커밋 컨벤션 확정 (Conventional Commits) → [03](03-git.md#git-convention)
- [ ] `FE` `.github/pull_request_template.md` 커밋
- [ ] `FE` `.github/ISSUE_TEMPLATE/*.yml` 3종 커밋
- [ ] `FE` `CODEOWNERS` 커밋
- [ ] `FE` 라벨 세트 생성 (`feat` `fix` `chore` `debt` `blocked` / `P0`~`P3` / `wholesale` `retail` `ui` `api`)

### API 계약 — **이게 P0인 이유: FE가 BE를 기다리면 6개월 안에 못 끝난다**
- [ ] `요청` **OpenAPI 3.1을 단일 진실 원천으로** 쓰자고 합의 → [05](05-api-contract.md)
- [ ] `요청` `openapi.yaml` 스켈레톤(도메인 8~10개, 경로/응답형태만) 먼저 공유해달라고 요청
- [ ] `요청` 공통 응답 봉투 / **에러 응답 포맷** / 페이지네이션 규약 합의 → [05](05-api-contract.md#be에-요청할-것)
- [ ] `요청` 인증 방식 합의: 토큰 종류·전달 위치·만료·갱신 흐름 → [07](07-pre-dev-decisions.md#팀-합의가-필요한-것)
- [ ] `요청` 스테이징 API 도메인 1개 + Vercel preview 도메인 CORS 허용
- [ ] `FE` `openapi-typescript` 코드젠 파이프라인 구성 (`pnpm codegen`)
- [ ] `FE` **MSW 핸들러 스캐폴딩 → BE 없이 화면 개발 시작 가능한 상태 만들기** ★

### 되돌리기 비싼 결정 3건 ADR 기록
- [ ] `FE` ADR-0001 모노레포 구조 → [adr/0001](adr/0001-monorepo-for-web-apps.md)
- [ ] `FE` ADR-0002 API 타입 코드젠 + MSW → [adr/0002](adr/0002-openapi-codegen-and-msw.md)
- [ ] `FE` ADR-0003 상태관리 경계 → [adr/0003](adr/0003-state-management-boundary.md)

---

## P1 — Week 1. 없으면 2주 뒤에 코드가 썩는다

### 코드 품질 게이트
- [ ] `FE` ESLint + Prettier 공유 설정 패키지화 (`packages/config`)
- [ ] `FE` **`@typescript-eslint/no-explicit-any: "error"`** — warn 아님 → [08](08-tech-debt-rules.md)
- [ ] `FE` `tsconfig` strict + `noUncheckedIndexedAccess` ON (나중에 켜면 에러 300개)
- [x] `FE` feature 경계 강제 (`no-restricted-imports`) → [02](02-folder-structure.md)
- [ ] `FE` husky + lint-staged (커밋 시 변경 파일만 lint/format)
- [ ] `FE` commitlint (Conventional Commits 강제)
- [ ] `FE` CI: `codegen` → `typecheck` → `lint` → `build` → [.github/workflows/ci.yml](../.github/workflows/ci.yml)
- [ ] `FE` Turborepo Remote Cache 연결 (Vercel) — CI 시간 1/3

### 디자인 시스템 최소 세트
- [ ] `FE` Tailwind 토큰 확정: color / spacing / radius / font scale → [04](04-component-strategy.md#디자인-토큰)
- [ ] `FE` `packages/ui` 생성 + **primitive 8종만 먼저**: Button, Input, Select, Modal, Toast, Badge, Spinner, Table
- [ ] `FE` `cn()` 유틸 + `class-variance-authority` variant 패턴 고정
- [ ] `FE` 아이콘 라이브러리 1개로 고정 (lucide-react)
- [ ] `FE` 디자이너와 토큰 이름 싱크 (Figma 변수명 ↔ Tailwind 토큰명)

### 앱 골격
- [ ] `FE` 라우팅 구조 확정 (route group `(auth)` / `(main)`)
- [ ] `FE` 전역 Provider 스택 (QueryClient, Toast, ErrorBoundary)
- [ ] `FE` API 클라이언트 래퍼 1개 (토큰 주입 / 401 갱신 / 에러 정규화)
- [ ] `FE` `error.tsx` / `not-found.tsx` / `loading.tsx` 기본형
- [ ] `FE` 폼 스택 고정: react-hook-form + zod + `zodResolver`
- [ ] `FE` **레퍼런스 feature 1개 완성** (`product`) → 이후 전부 이걸 복사 ★
- [ ] `FE` 에러 코드 → 사용자 문구 매핑 테이블 1장

### 문서
- [ ] `FE` Notion 페이지 생성 → [06](06-docs-structure.md)
- [ ] `FE` 레포 `README.md`: 실행법 5줄 + 스크립트 표
- [ ] `FE` `CONTRIBUTING.md`: 브랜치·커밋·PR 규칙 요약 (= [03](03-git.md) 압축본)

---

## P2 — Week 3~6. 기능 2~3개 나온 뒤에 하는 게 맞다

- [ ] `FE` Storybook — **primitive 8개 이상 쌓인 뒤에**. 미리 깔면 유지비만 나감
- [ ] `FE` 공통 컴포넌트 승격 1차 그루밍 (Rule of Two) → [04](04-component-strategy.md#승격-규칙)
- [ ] `FE` Sentry(에러 추적) + Vercel Analytics 연결
- [ ] `FE` E2E(Playwright) **핵심 플로우 3개만**. 유닛 테스트는 유틸/포맷터 한정 → [08](08-tech-debt-rules.md#테스트-범위)
- [ ] `FE` `dev` 브랜치 → 고정 Preview 도메인 (데모/QA용)
- [ ] `FE` 이미지 전략: presigned URL 업로드 컴포넌트 + `next/image` remotePatterns
- [ ] `FE` 접근성 최소선: 포커스 링 유지, 모달 focus trap, 폼 label 연결
- [ ] `FE` 기술 부채 라벨(`debt`) 운영 시작 — 주 1회 15분 그루밍
- [ ] `FE` 번들 예산 설정 (첫 로드 JS < 200KB gzip) + CI 경고

---

## P3 — MVP 이후. 지금 하면 손해

- [ ] i18n (요구 확정 전엔 금지 — 문자열 추출 비용이 큼)
- [ ] 시각적 회귀 테스트(Chromatic)
- [ ] 마이크로 프론트엔드 / 모듈 페더레이션 — **6개월·1명 규모에서 절대 금지**
- [ ] 디자인 시스템 문서 사이트
- [ ] PWA / 오프라인
- [ ] 성능 세부 튜닝 (RSC 스트리밍 최적화, PPR)

---

## 안 하기로 한 것 (명시적 결정)

> "안 한다"를 적어두지 않으면 언젠가 반드시 하게 된다.

| 항목 | 왜 안 하나 |
|---|---|
| Redux / Recoil / Jotai | TanStack Query가 서버 상태를 다 먹음. 남는 클라 상태는 Zustand 스토어 2~3개로 충분 |
| 자체 UI 라이브러리 풀스크래치 | shadcn/ui 복사 방식으로 소유권만 확보. 밑바닥부터 만들면 MVP 못 나감 |
| 커버리지 목표치(%) | 1인 FE에서 커버리지 수치는 부채가 됨. E2E 3개 + 타입으로 방어 |
| SSR 전면 적용 | 도매 어드민은 CSR로 충분. 소매 상품/검색만 SSR |
| 앱 레포 분리(도매/소매) | 공유 코드 배포·버전관리 비용을 1인이 감당 못 함 |
| BE 관련 일체 (레포·서버·DB·인프라) | **내 담당 아님.** 필요한 건 [05](05-api-contract.md)의 "요청 목록"으로만 관리 |
