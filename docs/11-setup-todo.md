# 11. 초기 세팅 TODO (직접 진행)

> 여기까지는 되어 있다: git 레포 초기화(`main`/`dev`), `.gitignore` / `.nvmrc` / `.editorconfig` / `.gitattributes`, `CONTRIBUTING.md`, `docs/`, `.github/` 템플릿 4종.
> **GitHub 세팅(F)도 완료** — org·레포 2개·push·브랜치 보호·라벨. 남은 항목만 아래 F에 체크박스로 남겼다.
> **모노레포 뼈대(pnpm workspace · Turborepo · apps · packages)는 일부러 비워뒀다.** 아래를 직접 채운다.

---

## A. 툴체인 (10분) — 완료 (2026-08-03)

- [x] `nvm use` — `.nvmrc` 24.18.0
- [x] pnpm 설치 — `corepack enable && corepack prepare pnpm@latest --activate` → **11.18.0**
- [x] 루트 `package.json`에 `"packageManager": "pnpm@11.18.0"` 명시

## B. 모노레포 뼈대 (핵심 실습 구간) — 뼈대 완료 (2026-08-03)

- [x] `pnpm-workspace.yaml` — `apps/*`, `packages/*`
- [x] 루트 `package.json` — `"private": true` + 스크립트 `dev` / `build` / `lint` / `typecheck` / `codegen`
      → **CI(`.github/workflows/ci.yml`)가 이 5개 스크립트를 그대로 호출한다.** 이름이 다르면 CI가 깨진다
- [x] `turbo.json` — 파이프라인 정의 (turbo 2.10.8)
      - `build`: `dependsOn: ["^build", "codegen"]`, `env`, `outputs: [".next/**", "!.next/cache/**"]`
      - `typecheck` / `lint`: 캐시 O
      - `dev`: `cache: false`, `persistent: true`
      > 함정: `tasks` 밖으로 나간 키나 `dependson` 같은 오타는 **에러 없이 무시된다.** `$schema`를 넣어 VSCode가 잡게 할 것
- [ ] 워크스페이스 의존은 `"@ondo/ui": "workspace:*"` 형식으로 건다 → C·D에서
- [ ] 검증: 루트에서 `pnpm build` 한 번에 두 앱이 빌드되는가 / 두 번째 실행이 캐시로 스킵되는가 → 앱 생성 후

## B-2. 스타일링 결정 — 완료 (2026-08-03)

- [x] [ADR-0005](adr/0005-css-strategy.md) — **Tailwind v4 + cva + shadcn 복사 방식**으로 확정
      (런타임 CSS-in-JS는 RSC 비호환으로 탈락 / Panda는 1인·6개월 제약으로 탈락)
- [x] `docs/02`·`04`·`07 A7`을 v4 문법으로 갱신 (`tailwind.config.ts` 없음, `@theme` + `@source`)
- [ ] 토큰 이름을 **shadcn 규약(`-foreground`)** 으로 정의 → **그다음에** shadcn 컴포넌트 복사 (순서 중요)

## C. apps (2개)

- [ ] `apps/wholesale` — Next.js App Router + TS + Tailwind, `docs/02-folder-structure.md` 트리대로
- [ ] `apps/retail` — 동일 구조 복사
- [ ] 각 앱 `next.config.ts`에 `transpilePackages: ["@ondo/ui", "@ondo/api", "@ondo/shared"]`
- [ ] 각 앱 `tsconfig.json` path alias `"@/*": ["./src/*"]`
- [ ] **Tailwind v4** — `src/app/globals.css`에 `@source "../../../../packages/ui/src";` **포함 필수**
      (빠뜨리면 공용 컴포넌트 스타일이 통째로 날아간다. **에러도 안 나고 빌드도 통과한다**)
      → v4엔 `tailwind.config.ts`가 없다. 설정은 전부 CSS 안 ([ADR-0005](adr/0005-css-strategy.md))
- [ ] `shared/config/env.ts` — zod로 환경변수 검증 (누락 시 빌드 실패)

## D. packages (4개 고정 — ADR-0004)

- [ ] `packages/ui` — 빌드하지 않음. `"exports": { ".": "./src/index.ts" }` 로 소스 직접 노출
- [ ] `packages/api` — `client.ts` + `endpoints/` + `mocks/handlers/`, `generated/`는 **커밋 대상**
- [ ] `packages/shared` — 포맷터·날짜·통화·범용 훅
- [ ] `packages/config` — eslint / tsconfig / prettier 공유 설정. 다른 패키지는 여기를 extends
- [ ] `packages/config`의 eslint에 `no-restricted-imports` (feature 경계 강제) 넣기 → `docs/02-folder-structure.md` 규칙 블록 그대로

## E. API 계약

- [ ] BE에 `openapi.yaml` 스켈레톤 + 스테이징 도메인 요청
- [ ] `pnpm codegen` = `openapi-typescript` → `packages/api/src/generated/schema.d.ts`
      → **CI에 codegen drift 체크가 이미 걸려 있다.** 스크립트 이름이 `codegen`이 아니면 CI 실패
- [ ] MSW 세팅 (`apps/*/src/mocks/`) — BE 오기 전까지 여기로 개발

## F. GitHub — 완료됨 (2026-08-03)

org: **`ondo-commerce`** (Free, 개인 계정 소속) · 레포 2개 모두 **Private**

- [x] `ondo-commerce/ondo-web` 생성 → `main` / `dev` push
- [x] `ondo-commerce/ondo-api` 생성 (빈 레포, BE가 초기화)
- [x] Default branch → `dev`
- [x] `main` 보호 규칙 (PR 필수 / up-to-date 필수 / force push·삭제 차단 / approvals 끔)
- [x] Automatically delete head branches ON
- [x] Discussions ON (`ISSUE_TEMPLATE/config.yml`이 링크함)
- [x] 라벨 `feat` / `fix` / `chore` 생성
- [x] `CODEOWNERS` FE 항목을 `@OhChangEun`으로 교체

### F-남은 것

- [ ] **BE 2명 org 초대** → Teams에 `be` 팀 생성 → `CODEOWNERS`의 주석 처리된 5줄 해제
      (org 멤버가 아닌 핸들을 쓰면 GitHub이 그 줄을 통째로 무시한다)
- [ ] **필수 status check `ci` 등록** — 지금은 등록 불가.
      GitHub은 최근 1주일 내 **실행된 적 있는** 체크만 목록에 띄운다.
      순서: `B` 완료 → 첫 PR에서 CI 1회 성공 → Settings → Branches → `main` Edit → 검색창에서 `ci` 선택
- [ ] **`ondo-api` 공개 범위를 BE와 합의** (레포별로 따로 설정 가능)

### F-나중에: public 전환

> private 동안 브랜치 보호 규칙은 **"Not enforced"** 상태다 (무료 플랜 제약).
> 규칙은 이미 만들어놨으므로 **public으로 바꾸는 순간 자동 발효**된다. 재설정 불필요.

**시점: 중간발표 직후.** 전환 전 체크리스트:

- [ ] 히스토리 시크릿 스캔 — `gitleaks detect` 또는 `trufflehog git file://.`
- [ ] `.env*`가 과거 커밋에 들어간 적 없는지 확인 (`.gitignore`에 있어도 히스토리는 별개)
- [ ] 하드코딩된 내부 도메인·스테이징 URL·테스트 계정 정리
- [ ] BE 2명, 소마 측 산출물 공개 규정 확인

## G. Vercel

- [ ] 프로젝트 **2개** 생성 (wholesale / retail) — 같은 레포, Root Directory만 다르게
- [ ] Ignored Build Step에 turbo 명령 넣어서 영향받은 앱만 빌드
- [ ] `dev` 브랜치를 고정 Preview 도메인에 연결
- [ ] 실습 절차: `docs/10-vercel-setup-lab.md`

## H. Week 0 마무리

- [ ] `docs/07-pre-dev-decisions.md` FE 단독 결정표 확정
- [ ] 팀 합의 필요 항목(인증·에러포맷·페이지네이션) 킥오프 안건 등록
- [ ] ADR `0001`~`0003` 초안 → 확정본으로 수정
- [ ] `features/product` 1개를 **레퍼런스 구현**으로 완성 → 이후 도메인은 이걸 복사

---

## 순서 추천

`F`가 끝났으니 **`A → B → C(wholesale 1개만) → G`** 로 일단 배포까지 한 번 뚫는다.
그 다음 `retail` 복사 · `packages` 분리 · `E`, 마지막에 `F-남은 것`의 `ci` 체크 등록.

빈 껍데기라도 배포 파이프라인이 먼저 도는 편이, 나중에 "빌드가 왜 안 되는지" 원인 후보를 줄여준다.

> ~~⚠️ 지금 상태로 PR을 올리면 CI는 반드시 실패한다. 루트 `package.json`이 없어서 `pnpm install`부터 죽는다.~~
> **해소됨 (2026-08-03).** `A`·`B` 완료로 `pnpm install`은 통과한다.
> 다만 `apps/`가 비어 있어 `turbo run build`는 "0 packages"로 끝난다 — 실패는 아니다.
