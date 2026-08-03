# 11. 초기 세팅 TODO (직접 진행)

> 여기까지는 되어 있다: git 레포 초기화(`main`/`dev`), `.gitignore` / `.nvmrc` / `.editorconfig` / `.gitattributes`, `CONTRIBUTING.md`, `docs/`, `.github/` 템플릿 4종.
> **모노레포 뼈대(pnpm workspace · Turborepo · apps · packages)는 일부러 비워뒀다.** 아래를 직접 채운다.

---

## A. 툴체인 (10분)

- [ ] `nvm use` — `.nvmrc`는 24.18.0으로 잡혀 있음. 다른 버전 쓸 거면 `.nvmrc`부터 고칠 것 (CI가 이 파일을 읽는다)
- [ ] pnpm 설치 — `corepack enable && corepack prepare pnpm@latest --activate`
- [ ] 루트 `package.json`에 `"packageManager": "pnpm@<버전>"` 명시 (CI의 `pnpm/action-setup@v4`가 이 필드로 버전을 정한다)

## B. 모노레포 뼈대 (핵심 실습 구간)

- [ ] `pnpm-workspace.yaml` — `apps/*`, `packages/*`
- [ ] 루트 `package.json` — `"private": true` + 스크립트 `dev` / `build` / `lint` / `typecheck` / `codegen`
      → **CI(`.github/workflows/ci.yml`)가 이 5개 스크립트를 그대로 호출한다.** 이름이 다르면 CI가 깨진다
- [ ] `turbo.json` — 파이프라인 정의
      - `build`: `dependsOn: ["^build"]`, `outputs: [".next/**", "!.next/cache/**"]`
      - `typecheck` / `lint`: 캐시 O
      - `dev`: `cache: false`, `persistent: true`
- [ ] 워크스페이스 의존은 `"@ondo/ui": "workspace:*"` 형식으로 건다
- [ ] 검증: 루트에서 `pnpm build` 한 번에 두 앱이 빌드되는가 / 두 번째 실행이 캐시로 스킵되는가

## C. apps (2개)

- [ ] `apps/wholesale` — Next.js App Router + TS + Tailwind, `docs/02-folder-structure.md` 트리대로
- [ ] `apps/retail` — 동일 구조 복사
- [ ] 각 앱 `next.config.ts`에 `transpilePackages: ["@ondo/ui", "@ondo/api", "@ondo/shared"]`
- [ ] 각 앱 `tsconfig.json` path alias `"@/*": ["./src/*"]`
- [ ] `tailwind.config.ts` — `content`에 **`../../packages/ui/src/**/*.{ts,tsx}` 포함 필수** (빠뜨리면 공용 컴포넌트 스타일이 통째로 날아간다)
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

## F. GitHub

- [ ] 원격 레포 생성: **`ondo-web`** (Private) — 로컬 폴더명이 `onDo`여도 무관
      - 웹: github.com/new → Add nothing (README·.gitignore 체크 해제)
      - CLI 쓸 거면 `brew install gh && gh auth login` (현재 미설치)
- [ ] `git remote add origin git@github.com:<계정>/ondo-web.git`
- [ ] `git push -u origin main && git push -u origin dev`
- [ ] Default branch → **`dev`** 로 변경 (일상 PR 대상이 dev)
- [ ] `main` 보호 규칙: PR 필수 / status check `ci` 필수 / up-to-date 필수 / force push 차단 / **approvals는 끔** (→ `docs/03-git.md`)
- [ ] Settings → General → **Automatically delete head branches** ON
- [ ] `.github/CODEOWNERS`의 계정명이 실제 핸들과 맞는지 확인
- [ ] Labels 정리 (ISSUE_TEMPLATE이 참조하는 라벨이 없으면 이슈 생성 시 무시된다)

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

`A → B → C(wholesale 1개만) → F → G` 로 **일단 배포까지 한 번 뚫고**, 그 다음 `retail` 복사 · `packages` 분리 · `E`.
빈 껍데기라도 배포 파이프라인이 먼저 도는 편이, 나중에 "빌드가 왜 안 되는지" 원인 후보를 줄여준다.
