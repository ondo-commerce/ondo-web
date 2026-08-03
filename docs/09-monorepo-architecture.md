# 09. Monorepo 아키텍처 설계 및 검토

> 범위: **Frontend Monorepo 구조만.** 백엔드는 존재한다고 가정.
> 서비스: B2B 도매몰 `wholesale` (`b2b.example.com`) + B2C 소매몰 `retail` (`shop.example.com`)
> 스택: Next.js App Router · TypeScript · Tailwind · TanStack Query · Turborepo · pnpm

### 명명 규칙 — 코드 식별자와 도메인은 다르다

**코드에 등장하는 모든 이름은 `wholesale` / `retail`로 통일한다.** 백엔드가 이 용어를 쓰기 때문이다.
API 응답이 `wholesalePrice`, `retailPrice`로 오는데 디렉토리가 `b2b`/`shop`이면 매 파일에서 머릿속 번역이 필요하고, 그 번역은 언젠가 반드시 어긋난다.

| 대상                                   | 표기                                   |
| -------------------------------------- | -------------------------------------- |
| 디렉토리 · 패키지 · 워크스페이스 이름  | `wholesale` / `retail`                 |
| 환경변수 · Vercel 프로젝트명 · CI 필터 | `wholesale` / `retail`                 |
| 타입 · 변수 · 스토어 · 함수명          | `wholesale` / `retail`                 |
| 사용자 대면 도메인                     | `b2b.example.com` / `shop.example.com` |
| 문서에서 비즈니스 모델을 지칭할 때     | B2B / B2C                              |

도메인만 다른 것은 마케팅 판단이고 코드와 무관하다. **반대로 코드 안에서 `b2b`와 `wholesale`이 섞이는 것은 즉시 부채가 된다.**

**이 문서의 구성**

- 1~6절: 요구사항을 **그대로** 반영한 정석 구조 (패키지 8개)
- 7절: 그 구조의 **실패 지점** 검토
- 8절: 주니어 1명 · 6개월 기준 **최종 권장안** (패키지 4개) ← 실제로 적용할 것

> 8절이 [01](01-repository.md)의 패키지 목록을 갱신한다. 근거는 [ADR-0004](adr/0004-package-consolidation.md).

---

# 1. 추천 폴더 구조

```
ondo-web/
├── apps/
│   ├── wholesale/                        # 도매몰(B2B) — b2b.example.com
│   │   ├── src/
│   │   │   ├── app/
│   │   │   │   ├── (auth)/               # 로그인, 사업자 인증
│   │   │   │   ├── (protected)/          # 인증 필수 영역
│   │   │   │   │   ├── layout.tsx        # B2B 어드민 셸 (사이드바)
│   │   │   │   │   ├── products/
│   │   │   │   │   ├── orders/
│   │   │   │   │   └── settlements/
│   │   │   │   ├── layout.tsx            # Provider 스택 + B2B 메타데이터
│   │   │   │   └── globals.css
│   │   │   ├── features/                 # B2B 전용 도메인 로직
│   │   │   │   ├── product/
│   │   │   │   ├── order/
│   │   │   │   └── settlement/
│   │   │   ├── shared/
│   │   │   │   ├── components/           # AppShell, PageHeader (B2B 전용)
│   │   │   │   ├── auth/                 # ★ B2B 인증 정책 (세션·권한·미들웨어)
│   │   │   │   ├── config/               # env.ts, routes.ts
│   │   │   │   └── lib/
│   │   │   └── mocks/
│   │   ├── middleware.ts                 # B2B 인증 가드
│   │   ├── next.config.ts
│   │   ├── tailwind.config.ts            # @ondo/ui preset 상속
│   │   ├── .env.example
│   │   └── package.json
│   │
│   └── retail/                           # 소매몰(B2C) — shop.example.com
│       ├── src/
│       │   ├── app/
│       │   │   ├── (public)/             # 공개 영역 (SEO 대상)
│       │   │   │   ├── page.tsx
│       │   │   │   ├── products/[slug]/
│       │   │   │   └── search/
│       │   │   ├── (mypage)/             # 인증 필요
│       │   │   ├── sitemap.ts            # ★ B2C 전용 SEO
│       │   │   ├── robots.ts
│       │   │   ├── opengraph-image.tsx
│       │   │   └── layout.tsx
│       │   ├── features/                 # 소매 전용 (cart, checkout, review)
│       │   ├── shared/
│       │   │   └── auth/                 # ★ B2C 인증 정책 (소셜 로그인)
│       │   └── mocks/
│       ├── middleware.ts
│       └── package.json
│
├── packages/
│   ├── design-system/                    # 토큰 · Tailwind preset · 폰트 (빌드타임)
│   ├── ui/                               # 컴포넌트 (런타임)
│   ├── api-client/                       # HTTP 클라이언트 + 엔드포인트 함수
│   ├── types/                            # OpenAPI 생성 타입 + 공용 도메인 타입
│   ├── hooks/                            # 도메인 무관 범용 훅
│   ├── utils/                            # 순수 함수
│   ├── eslint-config/
│   └── typescript-config/
│
├── docs/adr/
├── .github/workflows/
├── turbo.json
├── pnpm-workspace.yaml
└── package.json
```

### 앱 내부 설계에서 중요한 두 가지

**① `auth/`는 앱 안에 있다.** B2B는 사업자번호 인증 + 승인 대기 상태 + 권한(구매담당/관리자)이 있고, B2C는 소셜 로그인 + 비회원 주문이 있다. 인증을 공유 패키지로 올리면 두 정책의 합집합을 표현하려고 플래그가 늘어난다. **공유하는 것은 "토큰을 어떻게 실어 보내는가"(api-client)까지고, "누가 무엇을 할 수 있는가"는 앱이 갖는다.**

**② SEO 파일은 `retail`에만 존재한다.** `sitemap.ts` / `robots.ts` / `opengraph-image.tsx`는 B2C 전용이다. B2B는 로그인 벽 뒤라 인덱싱 대상이 아니고, `robots.ts`에서 전면 차단한다.

---

# 2. 각 패키지 역할

| 패키지              | 책임                                                         | 절대 하지 않는 것                             | 변경 빈도 |
| ------------------- | ------------------------------------------------------------ | --------------------------------------------- | --------- |
| `design-system`     | 디자인 토큰(CSS 변수), Tailwind preset, 폰트, 글로벌 스타일  | React 컴포넌트를 갖지 않음                    | 낮음      |
| `ui`                | 표현 전용 컴포넌트 (primitives + patterns)                   | **도메인 타입 import, 데이터 페칭**           | 중간      |
| `api-client`        | `fetch` 래퍼, 인증 헤더 주입, 에러 정규화, 엔드포인트 함수   | **인증 상태를 직접 소유하지 않음** (주입받음) | 높음      |
| `types`             | OpenAPI 코드젠 산출물 + 공용 도메인 타입                     | 런타임 코드 포함 금지 (타입만)                | 높음      |
| `hooks`             | `useDebounce`, `useMediaQuery`, `useIntersection` 등 범용 훅 | **도메인 데이터 훅(`useProducts`) 금지**      | 낮음      |
| `utils`             | 포맷터, 날짜, 통화, 숫자, 검증 헬퍼                          | React 의존 금지                               | 중간      |
| `eslint-config`     | 공유 린트 규칙 (base / next / react)                         | —                                             | 낮음      |
| `typescript-config` | `base.json`, `nextjs.json`, `react-library.json`             | —                                             | 낮음      |

### `design-system`과 `ui`를 나누는 이유

Tailwind preset은 **빌드타임**에 `tailwind.config.ts`가 읽어야 하고, 컴포넌트는 **런타임**에 번들에 들어간다. 한 패키지에 섞으면 앱의 tailwind 설정이 컴포넌트 패키지 전체를 참조하게 되어 순환 참조와 캐시 무효화가 생긴다.

```ts
// apps/wholesale/tailwind.config.ts
import preset from "@ondo/design-system/tailwind-preset";

export default {
  presets: [preset],
  content: [
    "./src/**/*.{ts,tsx}",
    "../../packages/ui/src/**/*.{ts,tsx}", // ★ 이거 빠뜨리면 UI 스타일이 전부 purge됨
  ],
};
```

> **이 `content` 경로 누락은 모노레포 Tailwind에서 가장 흔한 사고다.** 로컬에선 되는데 배포하면 스타일이 깨지는 형태로 나타난다.

### `api-client`가 인증을 소유하지 않는 이유

```ts
// packages/api-client/src/client.ts
type ClientConfig = {
  baseUrl: string;
  getToken: () => string | null; // ★ 주입
  onUnauthorized: () => Promise<string>; // ★ 갱신 전략도 주입
};

export function createApiClient(config: ClientConfig) {
  /* ... */
}
```

```ts
// apps/wholesale/src/shared/lib/api.ts   — B2B: 사업자 세션 기반
export const api = createApiClient({
  baseUrl: env.NEXT_PUBLIC_API_BASE_URL,
  getToken: () => wholesaleAuthStore.getState().accessToken,
  onUnauthorized: refreshWholesaleSession,
});
```

`api-client`가 특정 스토어를 import 하는 순간, B2C가 B2B의 인증 코드를 번들에 포함하게 된다. **인증 정책은 독립화 대상이므로 주입 지점을 앱에 남긴다.**

### `hooks` 패키지의 경계 — 실무에서 가장 많이 무너지는 곳

```
✅ packages/hooks   → useDebounce, useMediaQuery, useOnClickOutside, useIntersectionObserver
❌ packages/hooks   → useProducts, useCart, useOrderList
```

`useProducts`를 공유하고 싶어지지만, **B2B와 B2C는 같은 `GET /products`를 서로 다르게 해석한다.** B2B는 최소주문수량·거래처 단가·부가세 별도, B2C는 소비자가·재고 노출 규칙이 다르다. 공유 훅으로 만들면 `if (isWholesale)` 분기가 훅 안으로 들어가고, 그 순간 두 서비스의 비즈니스 규칙이 한 파일에서 얽힌다.

**규칙: 공유하는 것은 "요청 방법"(api-client)까지, "해석 방법"(query 훅)은 앱이 갖는다.**

---

# 3. 의존성 구조

## 레이어 (역방향·수평 참조 전면 금지)

```
Layer 0  typescript-config    eslint-config    design-system
             │                     │                │
Layer 1                          types              │
             │                     │                │
Layer 2                          utils ─────────────┤
             │                     │                │
Layer 3      ├─ api-client (types, utils)           │
             │                                      │
Layer 4      ├─ hooks (utils)          ui (design-system, utils)
             │
Layer 5      └────────── apps/wholesale   apps/retail
```

```
apps/wholesale                          apps/retail
  → @ondo/ui                        → @ondo/ui
  → @ondo/api-client                → @ondo/api-client
  → @ondo/types                     → @ondo/types
  → @ondo/hooks                     → @ondo/hooks
  → @ondo/utils                     → @ondo/utils
  → @ondo/design-system             → @ondo/design-system
  → @ondo/eslint-config (dev)       → @ondo/eslint-config (dev)
  → @ondo/typescript-config (dev)   → @ondo/typescript-config (dev)

@ondo/ui          → @ondo/design-system, @ondo/utils
@ondo/api-client  → @ondo/types, @ondo/utils
@ondo/hooks       → @ondo/utils
@ondo/utils       → @ondo/types
@ondo/types       → (없음)
```

## 금지 규칙 4개

| 금지                             | 이유                                                                  |
| -------------------------------- | --------------------------------------------------------------------- |
| `ui` → `api-client` / `types`    | 컴포넌트가 도메인을 알면 재사용이 죽고, `ui` 변경이 API 변경에 묶인다 |
| `apps/wholesale` ↔ `apps/retail` | 앱 간 직접 참조. 필요하면 공유분을 packages로 내린다                  |
| `packages/*` → `apps/*`          | 역방향 참조. 빌드 순서가 깨진다                                       |
| 같은 레이어 간 참조              | `hooks` → `ui` 같은 수평 참조는 순환의 시작                           |

## 강제 방법 — 문서가 아니라 도구로

**① pnpm이 1차 방어선이다.** pnpm은 node_modules를 평탄화하지 않으므로, `package.json`에 선언하지 않은 패키지는 **import 자체가 실패**한다. npm/yarn의 hoisting에서는 이게 조용히 통과한다. **pnpm을 쓰는 가장 큰 실질적 이유가 이것이다.**

**② 앱 내부 경계는 ESLint로.**

```js
// packages/eslint-config/base.js
"no-restricted-imports": ["error", {
  patterns: [
    { group: ["@ondo/api-client", "@ondo/types"], message: "ui 패키지는 도메인에 의존할 수 없습니다" },
  ],
}]
// → packages/ui/eslint.config.js 에서만 적용
```

**③ 순환 참조는 CI에서.**

```bash
pnpm dlx madge --circular --extensions ts,tsx apps packages
```

## 패키지 소비 방식: 빌드하지 않는다

```jsonc
// packages/ui/package.json
{
  "name": "@ondo/ui",
  "exports": { ".": "./src/index.ts", "./styles.css": "./src/styles.css" },
  "peerDependencies": { "react": "^19", "react-dom": "^19" }, // ★ dependencies 아님
}
```

```ts
// apps/wholesale/next.config.ts
export default {
  transpilePackages: [
    "@ondo/ui",
    "@ondo/api-client",
    "@ondo/hooks",
    "@ondo/utils",
  ],
};
```

- **`tsup`/`rollup` 빌드 스텝을 두지 않는다.** 소스를 직접 노출하면 빌드 순서·소스맵·watch 재빌드 문제가 통째로 사라진다. 외부 배포용 패키지가 아니므로 번들링할 이유가 없다
- **React는 반드시 `peerDependencies`.** `dependencies`로 넣으면 React 인스턴스가 2개가 되어 `Invalid hook call`이 난다. 모노레포 초기 사고 1순위

---

# 4. 배포 전략 (Vercel)

## 프로젝트 구성

레포는 1개, **Vercel 프로젝트는 2개.**

|                            | wholesale                         | retail             |
| -------------------------- | --------------------------------- | ------------------ |
| Vercel Project             | `ondo-wholesale`                  | `ondo-retail`      |
| **Root Directory**         | `apps/wholesale`                  | `apps/retail`      |
| Include files outside root | **ON** (packages/ 접근에 필수)    | ON                 |
| Framework Preset           | Next.js                           | Next.js            |
| Install Command            | 기본값 (pnpm workspace 자동 감지) | 기본값             |
| Build Command              | 기본값 (`next build`)             | 기본값             |
| **Ignored Build Step**     | `npx turbo-ignore`                | `npx turbo-ignore` |
| Production Domain          | `b2b.example.com`                 | `shop.example.com` |
| Production Branch          | `main`                            | `main`             |

**`turbo-ignore`가 핵심이다.** 없으면 `retail`만 고친 커밋에서 `wholesale`까지 빌드된다. 이건 빌드 시간 낭비를 넘어 **관계없는 서비스가 재배포되는 문제**다 — B2C 캠페인 중에 B2B 커밋으로 B2C가 재배포되면 안 된다.

`turbo-ignore`는 의존성 그래프를 읽으므로 `packages/ui` 변경 시에는 **두 앱 모두** 빌드한다. 이게 올바른 동작이다.

## 환경변수 관리

**독립 환경변수 요구사항은 "Vercel 프로젝트가 2개"라는 사실로 이미 충족된다.** 각 프로젝트가 자기 환경변수를 갖는다.

| 스코프        | 관리 위치                                                                   | 예                         |
| ------------- | --------------------------------------------------------------------------- | -------------------------- |
| 앱별 · 환경별 | Vercel Project → Environment Variables (Production / Preview / Development) | `NEXT_PUBLIC_API_BASE_URL` |
| 두 앱 공통    | Vercel **Team Environment Variables** (양쪽 프로젝트에 연결)                | `SENTRY_ORG`               |
| 로컬          | `vercel env pull apps/wholesale/.env.local`                                 | —                          |

**규칙**

1. `.env*`는 커밋하지 않고, `.env.example`은 **반드시** 커밋한다
2. `process.env` 직접 참조 금지 → 앱마다 `shared/config/env.ts`에서 zod 검증 (누락 시 **빌드 실패**)
3. **`turbo.json`에 env를 선언한다** — 안 하면 캐시가 환경변수 변경을 인지하지 못해 **이전 환경의 값이 박힌 빌드가 재사용된다**

```jsonc
// turbo.json
{
  "$schema": "https://turbo.build/schema.json",
  "globalEnv": ["NODE_ENV", "VERCEL_ENV"],
  "tasks": {
    "codegen": { "cache": false },
    "build": {
      "dependsOn": ["^build", "codegen"],
      "env": ["NEXT_PUBLIC_*", "API_SECRET"],
      "outputs": [".next/**", "!.next/cache/**"],
    },
    "typecheck": { "dependsOn": ["^build", "codegen"] },
    "lint": {},
    "test": { "dependsOn": ["^build"] },
    "dev": { "cache": false, "persistent": true },
  },
}
```

> Turborepo 2.x는 Next.js를 감지해 `NEXT_PUBLIC_*`를 자동 포함하지만, **서버 전용 변수는 자동 감지되지 않는다.** 명시적으로 적는다.

## Preview 배포

| 트리거       | 결과                                                                         |
| ------------ | ---------------------------------------------------------------------------- |
| PR 생성/푸시 | 변경된 앱만 Preview 배포, URL이 PR에 자동 코멘트                             |
| `dev` 브랜치 | 고정 도메인 부여: `b2b-dev.example.com` / `shop-dev.example.com` (QA·데모용) |

- Preview 환경변수는 **스테이징 API**를 가리킨다 (`api-dev.example.com`)
- Vercel Preview는 브랜치별 환경변수 오버라이드를 지원한다 → 특정 브랜치만 다른 API를 보게 할 수 있다
- **Preview에 `noindex`를 강제한다.** `retail`은 SEO 대상이므로 Preview가 색인되면 실서비스와 중복 콘텐츠가 된다

```ts
// apps/retail/src/app/layout.tsx
export const metadata: Metadata = {
  robots:
    process.env.VERCEL_ENV === "production"
      ? { index: true }
      : { index: false, follow: false },
};
```

## Production 배포

```
main 머지 → 변경된 앱만 Production 빌드 → 도메인 자동 전환
```

- **롤백**: Vercel Deployments에서 이전 배포 → "Promote to Production" (재빌드 없이 즉시). 1인 운영에서 이게 최고의 안전장치다
- **Skew Protection ON**: 배포 중 구버전 클라이언트가 신버전 청크를 요청해 깨지는 문제를 막는다
- **배포 순서 규칙**: API breaking change는 BE 먼저 → FE 나중

---

# 5. CI/CD 전략 (GitHub Actions)

## 역할 분담 — 빌드를 두 번 하지 않는다

| 담당               | 하는 일                                                     |
| ------------------ | ----------------------------------------------------------- |
| **Vercel**         | 빌드 · 배포 · 프리뷰 URL · 롤백                             |
| **GitHub Actions** | **품질 게이트만** (typecheck / lint / test / codegen drift) |

GitHub Actions에서 `next build`를 또 돌리는 구성은 흔하지만 낭비다. Vercel이 이미 빌드하고, 빌드 실패는 Vercel 체크로 PR에 표시된다. **Actions는 Vercel이 안 하는 것만 한다.**

## 전체 흐름

```
PR 생성
  ├─ GitHub Actions: affected 패키지만 typecheck / lint / test / codegen drift
  └─ Vercel: 영향받은 앱만 Preview 배포 → PR에 URL 코멘트
        ↓ 둘 다 green이어야 머지 가능 (브랜치 보호)
dev 머지
  └─ Vercel: 고정 Preview 도메인 갱신 (QA·데모)
main 머지
  ├─ GitHub Actions: 동일 게이트 재실행
  └─ Vercel: Production 배포 → 도메인 전환
        ↓ 문제 발생 시
      Vercel Dashboard에서 이전 배포 Promote (30초)
```

## 워크플로

```yaml
# .github/workflows/ci.yml
name: ci
on:
  pull_request:
    branches: [main, dev]
  push:
    branches: [main, dev]

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

env:
  TURBO_TOKEN: ${{ secrets.TURBO_TOKEN }} # Vercel 빌드와 캐시 공유
  TURBO_TEAM: ${{ vars.TURBO_TEAM }}

jobs:
  quality:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 } # ★ affected 계산에 전체 히스토리 필요

      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version-file: .nvmrc, cache: pnpm }

      - run: pnpm install --frozen-lockfile

      # 생성 타입이 커밋본과 다르면 실패 (API 스펙 반영 누락 방지)
      - name: codegen drift
        run: |
          pnpm codegen
          git diff --exit-code -- packages/types/src/generated \
            || (echo "::error::pnpm codegen 후 커밋하세요" && exit 1)

      # 변경 영향 범위만 검사 — 앱이 늘어나도 CI 시간이 늘지 않는다
      - run: pnpm turbo typecheck lint test --filter="...[origin/${{ github.base_ref || 'main' }}]"

      - name: 순환 참조 검사
        run: pnpm dlx madge --circular --extensions ts,tsx apps packages
```

**포인트**

- `--filter="...[origin/main]"` — 변경된 패키지와 **그것에 의존하는 것들만** 검사. 앱이 5개가 되어도 CI 시간이 선형으로 늘지 않는 유일한 방법
- `fetch-depth: 0` 없으면 diff 기준을 못 잡아 필터가 전체를 돌린다
- `TURBO_TOKEN` 공유로 **Vercel 빌드가 채운 캐시를 CI가 재사용**한다

## 브랜치 보호 (main)

- [x] Require PR before merging
- [x] Required checks: `quality` + `Vercel – ondo-wholesale` + `Vercel – ondo-retail`
- [x] Require branches up to date
- [x] Block force pushes

## 하지 않을 것

| ❌                                    | 이유                                          |
| ------------------------------------- | --------------------------------------------- |
| Actions에서 `next build`              | Vercel이 이미 함. 시간·비용 2배               |
| Actions에서 `vercel deploy` 직접 호출 | Git 연동이 이미 처리. 토큰 관리 부담만 늘어남 |
| `changesets` 도입                     | 외부 배포 패키지가 없다. `workspace:*`면 충분 |
| E2E를 PR마다 전체 실행                | 초기엔 nightly + main 머지 시에만             |

---

# 6. 규모 확장 시 대응 (Admin / Seller / Mobile)

## 결론 요약

| 추가 서비스    | 판단              | 방식                                                                                    |
| -------------- | ----------------- | --------------------------------------------------------------------------------------- |
| **Admin**      | ✅ 새 앱          | `apps/admin` 추가. 구조 변경 없음                                                       |
| **Seller**     | ⚠️ 조건부         | 대상이 B2B 사용자와 겹치면 **`wholesale` 안의 라우트 그룹**, 완전히 다른 사용자면 새 앱 |
| **Mobile Web** | ❌ **새 앱 금지** | 반응형으로 대응. 별도 앱은 유지비 2배·SEO 분산                                          |

## Admin 추가 — 비용이 거의 없다

```
apps/admin/                    # admin.example.com
├── src/
│   ├── app/(protected)/       # 전 페이지 인증 + 역할 검사
│   ├── features/
│   └── shared/auth/           # 관리자 인증 정책 (IP 제한, 2FA, 감사로그)
└── package.json
```

Vercel 프로젝트 1개 추가 + Root Directory 지정이 전부다. **CI는 수정할 필요조차 없다** — `--filter` 방식이므로 자동으로 포함된다. **이게 이 구조를 택한 실질적 이유다.**

다만 세 번째 앱부터는 **레이아웃 셸 중복**이 드러난다. `wholesale`와 `admin` 모두 "사이드바 + 헤더 + 권한 가드" 구조를 갖는다. 그때 도입한다:

```
packages/ui/patterns/
└── AdminShell/     # 사이드바+헤더 "껍데기"만. 메뉴 정의·권한 판단은 각 앱이 주입
```

**여기서 실수하면 안 되는 것: 메뉴 목록과 권한 로직을 셸 안에 넣지 않는다.** 넣는 순간 `AdminShell`이 세 앱의 권한 체계를 전부 알아야 한다.

## Seller 추가 — 먼저 물어야 할 질문

> **"Seller와 B2B 도매 구매자가 같은 사람인가?"**

- **다른 사람 (판매자 ≠ 구매자)** → `apps/seller` 새 앱. 인증 주체가 다르면 앱을 나누는 게 맞다
- **같은 사람 (도매업자가 판매도 함)** → `apps/wholesale/src/app/(seller)/` 라우트 그룹. 앱을 나누면 사용자가 두 도메인을 오가며 로그인을 두 번 하게 된다

**앱 분리 판단 기준 3가지 — 하나라도 YES면 분리**

1. 인증 주체가 다른가?
2. 독립적으로 배포·롤백해야 하는가?
3. 도메인이 달라야 하는가? (SEO·브랜딩·보안)

셋 다 NO면 라우트 그룹이 정답이다. **"기능이 많아서"는 앱을 나눌 이유가 아니다.**

## Mobile Web — 별도 앱을 만들지 말 것

이건 명확히 반대한다.

| 별도 `apps/mobile`의 비용 |                                                                                |
| ------------------------- | ------------------------------------------------------------------------------ |
| 코드                      | 페이지·라우팅·상태·폼이 전부 이중화. 기능 1개 = 구현 2번                       |
| SEO                       | `m.example.com`은 **중복 콘텐츠 문제**를 만든다. canonical·alternate 관리 부담 |
| 운영                      | Vercel 프로젝트·환경변수·모니터링 2배                                          |
| 역사                      | 이 패턴(m.도메인)은 반응형 이전 시대의 유산이고, 업계는 이미 이탈했다          |

**대안**

1. **반응형 우선.** `retail`은 처음부터 모바일 퍼스트로 설계 (실제 트래픽 대부분이 모바일)
2. 레이아웃이 근본적으로 달라야 하면 → **같은 앱 안에서 컴포넌트 분기**
   ```tsx
   // 서버에서 UA 판별 → 레이아웃만 분기, 데이터·로직은 공유
   const isMobile = /* userAgent 판별 */;
   return isMobile ? <MobileProductList {...props} /> : <DesktopProductList {...props} />;
   ```
3. 네이티브 앱 요구가 오면 → **웹뷰 또는 별도 RN 레포**. 이 모노레포에 넣지 않는다

## 5개 앱 시점의 구조 (예상)

```
apps/       wholesale/  retail/  admin/  seller/
packages/
├── design-system/
├── ui/                    # AdminShell 등 패턴 추가
├── api-client/
├── types/
├── hooks/
├── utils/
├── feature-auth/          # ★ 3개 이상 앱이 같은 인증 흐름을 쓸 때만 등장
└── config/
```

**`packages/feature-*`는 앱 3개 이상에서 같은 기능이 반복될 때만 만든다.** 미리 만들면 사용처 1곳짜리 패키지가 된다.

## 확장 시 실제로 아픈 곳 (앱 개수가 아니다)

앱 추가 자체는 싸다. 비싸지는 건 **공유 패키지 변경의 폭발 반경**이다.

- 앱 2개: `packages/ui` 버튼 수정 → 2곳 확인
- 앱 5개: 같은 수정 → **5곳 확인, 5개 서비스 재배포**

대응책 (앱 3개 넘어갈 때 도입):

1. `packages/ui` 변경 PR에 **모든 앱 Preview URL을 자동 코멘트**
2. `ui`에 시각적 회귀 테스트(Chromatic) — 이 시점에서야 비용 대비 이득이 생긴다
3. `CODEOWNERS`로 `packages/*` 변경 시 전원 리뷰
4. **파괴적 변경은 deprecate 후 2주 뒤 제거** (즉시 제거 금지)

---

# 7. 설계 검토

## 장점

|                      |                                                                                           |
| -------------------- | ----------------------------------------------------------------------------------------- |
| **독립성 요구 충족** | 배포·도메인·환경변수·CI가 앱 단위로 완전히 분리됨. Vercel 프로젝트 분리로 자연스럽게 달성 |
| **원자적 변경**      | 공유 컴포넌트 수정이 한 PR에서 두 앱에 반영. 폴리레포였다면 PR 3개 + 버전 발행            |
| **일관성**           | 린트·TS·토큰이 하나 → 두 서비스의 UI/코드 스타일이 강제로 수렴                            |
| **확장 비용 낮음**   | 앱 추가 = 디렉토리 + Vercel 프로젝트. CI는 `--filter` 덕에 무수정                         |
| **캐시 이득**        | Turborepo 원격 캐시를 CI와 Vercel이 공유 → 빌드 시간 실질 단축                            |
| **pnpm 경계 강제**   | 선언하지 않은 의존성은 import 자체가 실패 → 레이어 규칙이 도구로 강제됨                   |

## 단점

|                          |                                                                                       |
| ------------------------ | ------------------------------------------------------------------------------------- |
| **초기 설정 비용**       | workspace·turbo·Vercel Root Directory·Tailwind content·transpilePackages. 반나절~하루 |
| **디버깅 난이도**        | "로컬은 되는데 Vercel에서 스타일이 없다" 류 문제가 모노레포 특유의 형태로 나온다      |
| **패키지 8개 관리 부담** | 각각 `package.json`·`tsconfig`·`exports`. 주니어 1명에게는 실질적 부담                |
| **커플링 위험**          | 공유 패키지 하나가 모든 앱을 동시에 깨뜨릴 수 있다                                    |
| **레포 비대화**          | 클론·설치 시간 증가, IDE 인덱싱 부담                                                  |

## 예상 문제점 — 실제로 터질 순서대로

**① Tailwind content 경로 누락 (Week 1, 발생 확률 높음)**
`packages/ui`가 content에 없으면 UI 스타일이 통째로 purge된다. 로컬 dev는 JIT라 우연히 동작하다가 배포에서 깨진다.
→ 앱 생성 시 tailwind.config 템플릿을 고정하고, `design-system`이 content 경로를 export 하게 한다.

**② React 인스턴스 중복 → `Invalid hook call` (Week 1~2)**
`packages/ui`가 React를 `dependencies`에 넣으면 발생.
→ 공유 패키지의 React·React-DOM은 **반드시 `peerDependencies`**. `pnpm dedupe` 정기 실행.

**③ `packages/ui`가 도메인에 오염됨 (Week 4~8, 가장 확실히 발생)**
`<Button isWholesale>`, `<ProductCard product={...}>` 형태로 도메인이 새어 들어온다.
→ **판별식: `packages/ui`가 `@ondo/types`를 import 하면 오염이다.** ESLint로 차단하고, 오염된 컴포넌트는 즉시 앱으로 강등.

**④ `packages/hooks`가 데이터 훅 저장소가 됨 (Week 6~)**
`useProducts`를 공유하려는 압력 → 훅 안에 `if (isWholesale)` 분기 → 두 서비스 비즈니스 규칙이 한 파일에 얽힘.
→ **query 훅은 앱에만.** 공유는 `api-client`(요청)까지.

**⑤ Turborepo 캐시 오염 (환경변수 미선언) (배포 후 조용히 발생)**
`turbo.json`에 env를 안 적으면 다른 환경변수로 만든 빌드가 캐시 히트된다. **잘못된 API URL이 박힌 빌드가 배포되는데 로그에는 "cache hit"만 찍힌다.** 가장 발견이 늦는 문제.
→ `build.env`에 사용하는 변수를 전부 선언. `turbo build --dry=json`으로 확인.

**⑥ `turbo-ignore` 누락으로 전체 재배포 (상시)**
관계없는 커밋에 두 서비스가 모두 재배포된다.
→ Ignored Build Step 설정 확인. 배포 로그에서 skip 여부를 눈으로 검증.

**⑦ `types` 패키지의 god-package화 (Week 8~)**
"공용 타입"이라는 이름 아래 모든 타입이 모이고, 결국 `utils`·`api-client`가 서로를 원하게 되어 순환 압력이 생긴다.
→ **API 생성 타입만 `types`에 두고**, 앱 전용 타입은 앱에 남긴다.

**⑧ 두 앱의 UI가 서서히 갈라짐 (Week 12~)**
급할 때 `packages/ui` 수정 대신 앱에 복사 → 6개월 뒤 Button이 3종류.
→ 주 1회 그루밍에서 "앱 안에 있는 primitive성 컴포넌트" 탐지.

## 기술 부채 가능성 (복리로 붙는 순서)

| 부채                               | 이자                                           | 임계점                   |
| ---------------------------------- | ---------------------------------------------- | ------------------------ |
| `ui`의 도메인 오염                 | **매우 높음** — 재사용 불가 → 복붙 → 분기 폭발 | prop에 앱 이름 등장      |
| 공유 query 훅의 `if (isWholesale)` | **매우 높음** — 서비스 격리 붕괴               | 분기 2개 이상            |
| 미선언 env로 인한 캐시 오염        | 높음 — 원인 파악이 극도로 어려움               | 첫 배포                  |
| 사용처 1곳짜리 패키지              | 중간 — 관리 표면적만 증가                      | 패키지 생성 시점         |
| 앱 간 코드 복붙                    | 중간 — 수정 누락                               | 3번째 복사               |
| 패키지 8개의 설정 드리프트         | 낮지만 상시                                    | 의존성 업그레이드 때마다 |

## 개선안

| #   | 개선                                                                  | 효과                       |
| --- | --------------------------------------------------------------------- | -------------------------- |
| 1   | **패키지 8 → 4로 통합**                                               | 관리 표면적 절반. 8절 참조 |
| 2   | `ui` → 도메인 패키지 import 금지를 ESLint로 강제                      | ③ 원천 차단                |
| 3   | query 훅은 앱에만 — `hooks` 패키지에 `use*Query` 네이밍 금지 규칙     | ④ 차단                     |
| 4   | `turbo.json`에 env 명시 + `--dry=json` 검증을 CI에 추가               | ⑤ 차단                     |
| 5   | 공유 패키지 React를 `peerDependencies`로 고정                         | ② 차단                     |
| 6   | `design-system`이 tailwind content 경로를 export                      | ① 차단                     |
| 7   | 패키지 빌드 스텝 없이 `transpilePackages`                             | 빌드 순서·소스맵 문제 제거 |
| 8   | **승격 규칙(Rule of Two)**: 앱에서 시작 → 2번째 사용처에서 packages로 | 조기 추상화 방지           |
| 9   | `madge --circular`를 CI에                                             | 순환 참조 조기 발견        |

---

# 8. 최종 권장안 — 주니어 1명 · 6개월

## 무엇을 바꾸는가

**패키지 8개 → 4개.**

패키지 경계는 **비용이 있고**(package.json, tsconfig, exports, 의존성 그래프 유지), **이득은 조건부**다 — 독립 버저닝·독립 배포·다른 팀 소유. **우리는 셋 다 해당되지 않는다.** 소비자가 앱 2개뿐이고, 개발자가 1명이며, 외부 배포가 없다.

`eslint-config`와 `typescript-config`를 나눈 것은 Turborepo 공식 예제의 관행일 뿐, **둘을 나눠서 얻는 이득이 실제로 없다.** 같은 사람이 같은 날 함께 고친다.

## 최종 구조

```
ondo-web/
├── apps/
│   ├── wholesale/            # b2b.example.com
│   └── retail/               # shop.example.com
│
├── packages/
│   ├── ui/                   # 토큰 + Tailwind preset + 컴포넌트
│   │   ├── src/
│   │   │   ├── primitives/           # Button, Input, Modal, Table ...
│   │   │   ├── patterns/             # FormField, Pagination, DataTable
│   │   │   ├── styles/globals.css    # CSS 변수(토큰)
│   │   │   └── index.ts
│   │   ├── tailwind-preset.ts        # ★ design-system을 여기 흡수
│   │   └── package.json
│   │
│   ├── api/                  # 타입 + HTTP 클라이언트 + 목
│   │   ├── src/
│   │   │   ├── generated/            # openapi-typescript 산출물 (커밋함)
│   │   │   ├── client.ts             # createApiClient (인증 주입식)
│   │   │   ├── endpoints/
│   │   │   ├── mocks/                # MSW 핸들러
│   │   │   └── types.ts              # ★ types 패키지를 여기 흡수
│   │   └── package.json
│   │
│   ├── shared/               # utils + 범용 hooks
│   │   ├── src/
│   │   │   ├── utils/                # formatPrice, date, validators
│   │   │   └── hooks/                # useDebounce, useMediaQuery
│   │   └── package.json
│   │
│   └── config/               # ★ eslint + tsconfig + prettier 통합
│       ├── eslint/{base,next,react-library}.js
│       ├── typescript/{base,nextjs,react-library}.json
│       └── package.json
│
├── docs/adr/
├── .github/workflows/ci.yml
├── turbo.json
├── pnpm-workspace.yaml
└── package.json
```

## 통합 근거

| 통합                                             | 근거                                                                                                               | 되돌리는 비용    |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ | ---------------- |
| `design-system` → `ui`                           | 토큰과 컴포넌트를 같은 사람이 같은 PR에서 고친다. preset은 별도 export 경로로 분리하면 빌드타임/런타임 문제도 없다 | 낮음 (파일 이동) |
| `types` → `api`                                  | 타입의 95%가 OpenAPI 산출물이다. 코드젠 대상과 타입이 같은 패키지에 있는 게 자연스럽다                             | 낮음             |
| `hooks` + `utils` → `shared`                     | 범용 훅은 6개월간 10개를 넘지 않는다. 패키지 1개를 유지할 양이 아니다                                              | 낮음             |
| `eslint-config` + `typescript-config` → `config` | 항상 함께 수정된다. 소비자도 같다                                                                                  | 낮음             |

**모두 되돌리는 비용이 낮다.** 나중에 나눠야 할 이유가 생기면 그때 나눈다 — 파일 이동 + import 경로 수정이 전부다. **반대로, 미리 나눠두면 6개월 내내 8개를 관리한다.** 비대칭적으로 통합이 유리하다.

## 의존성 구조 (최종)

```
apps/wholesale, apps/retail
  → @ondo/ui       → @ondo/shared
  → @ondo/api      → @ondo/shared
  → @ondo/shared
  → @ondo/config (dev)

@ondo/ui     → @ondo/shared          (도메인 지식 없음)
@ondo/api    → @ondo/shared
@ondo/shared → (없음)
```

**규칙 2개만 지키면 이 구조는 안 무너진다.**

1. **`@ondo/ui`는 `@ondo/api`를 import 하지 않는다** (컴포넌트에 도메인 금지)
2. **query 훅은 앱 안에만 존재한다** (`@ondo/api`는 요청 함수까지, 해석은 앱이)

## 앱 내부 (동일 구조를 두 앱이 복제)

```
apps/wholesale/src/
├── app/            # 라우팅 · 레이아웃 · SEO 파일
├── features/       # 도메인 수직 슬라이스 (여기에 코드 대부분)
│   └── product/{api,components,hooks,model}/
├── shared/
│   ├── components/ # 앱 전용 셸
│   ├── auth/       # ★ 앱별 인증 정책
│   ├── config/     # env.ts (zod 검증)
│   └── lib/        # api 인스턴스 (인증 주입)
└── mocks/
```

## 6개월 도입 일정

| 시점        | 작업                                                                                          |
| ----------- | --------------------------------------------------------------------------------------------- |
| **Week 0**  | 레포 + `apps/wholesale`, `apps/retail` + `packages/config` + Vercel 2개 연결 + `turbo-ignore` |
| **Week 0**  | `packages/api` (코드젠 + MSW) — **BE 대기 없이 개발하기 위해 최우선**                         |
| **Week 1**  | `packages/ui` primitive 8개 + tailwind preset + `packages/shared`                             |
| **Week 1**  | CI 품질 게이트 + 브랜치 보호                                                                  |
| **Week 2~** | 기능 개발. **새 컴포넌트는 앱에서 시작**, 2번째 사용처에서 `ui`로 승격                        |
| **Week 6**  | 승격 그루밍 1회 + Storybook 도입 판단                                                         |
| **Week 12** | 패키지 분할 필요성 재평가 (필요 없으면 그대로)                                                |

## 지금 하지 않는 것 (명시)

| 항목                       | 재검토 시점                              |
| -------------------------- | ---------------------------------------- |
| `packages/feature-*`       | 앱 3개 이상                              |
| 패키지 빌드 스텝 (tsup 등) | 외부 배포가 필요할 때 (아마 영원히 없음) |
| Changesets / 버전 관리     | 외부 배포 시                             |
| 시각적 회귀 테스트         | 앱 3개 이상                              |
| `apps/mobile`              | **없음 — 반응형으로 대응**               |
| 별도 Seller 앱             | 인증 주체가 다르다고 확정될 때           |
| Actions에서 빌드           | 필요 없음 (Vercel이 담당)                |

## 이 권장안이 틀렸다는 신호

- 앱이 4개를 넘고 `packages/ui` 수정 때마다 4곳을 수동 확인하고 있다 → 시각적 회귀 테스트 + 패키지 세분화
- `packages/shared`가 50개 파일을 넘었다 → `utils` / `hooks` 분리
- FE 인원이 3명 이상이 되어 패키지별 오너십이 필요하다 → 세분화 + CODEOWNERS 강화
- `packages/api`의 코드젠 산출물 diff가 매 PR을 오염시킨다 → `types` 분리 재검토

---

## 체크리스트

**Week 0**

- [ ] `apps/wholesale`, `apps/retail`, `packages/{ui,api,shared,config}` 스캐폴딩
- [ ] `pnpm-workspace.yaml` + `turbo.json` (**`build.env` 선언 포함**)
- [ ] Vercel 프로젝트 2개: Root Directory + Include files outside root + `turbo-ignore`
- [ ] 커스텀 도메인 2개 연결
- [ ] 앱별 `.env.example` + `shared/config/env.ts` zod 검증
- [ ] Turborepo Remote Cache (Vercel ↔ CI 공유)
- [ ] `packages/api` 코드젠 + MSW → **BE 없이 개발 가능 상태**

**Week 1**

- [ ] 공유 패키지 React를 `peerDependencies`로 (검증: 앱 2개 동시 실행 후 hook 에러 없음)
- [ ] `transpilePackages` 설정
- [ ] Tailwind `content`에 `packages/ui` 포함 — **프로덕션 빌드로 검증**
- [ ] `ui` → `api` import 금지 ESLint 규칙
- [ ] CI: codegen drift + affected typecheck/lint + madge
- [ ] 브랜치 보호 (quality + Vercel 체크 2개)
- [ ] `turbo build --dry=json`으로 env 선언 누락 확인

**상시**

- [ ] 새 컴포넌트는 앱에서 시작 → 2번째 사용처에서 승격
- [ ] `packages/ui`에 도메인 타입이 들어오지 않았는지 주 1회 확인
- [ ] Preview 배포에 `noindex` 적용 확인 (retail)
