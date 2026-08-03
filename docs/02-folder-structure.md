# 02. 폴더 구조 · P0

## 원칙 3줄

1. **도메인 우선(feature-first)**, 기술 종류별(components/hooks/utils) 분류는 2순위.
   → `components/` 하나에 80개 파일이 쌓이는 걸 막는다.
2. **한 기능을 지우면 폴더 하나가 통째로 지워져야 한다.** 안 되면 경계가 잘못된 것.
3. **import 방향은 한 방향.** `app → features → shared/ui → packages`. 역방향과 feature 간 직접 import 금지 (ESLint로 강제).

---

## apps/wholesale (retail도 동일 구조)

```
apps/wholesale/
├── src/
│   ├── app/                          # 라우팅 전용. 로직 두지 말 것
│   │   ├── (auth)/
│   │   │   ├── login/page.tsx
│   │   │   └── layout.tsx
│   │   ├── (main)/
│   │   │   ├── layout.tsx            # GNB/사이드바
│   │   │   ├── page.tsx              # 대시보드
│   │   │   ├── products/
│   │   │   │   ├── page.tsx
│   │   │   │   ├── loading.tsx
│   │   │   │   ├── error.tsx
│   │   │   │   ├── new/page.tsx
│   │   │   │   └── [productId]/page.tsx
│   │   │   └── orders/...
│   │   ├── api/                      # Route Handler (BFF·웹훅·프록시 한정)
│   │   ├── layout.tsx                # Provider 스택
│   │   ├── not-found.tsx
│   │   ├── global-error.tsx
│   │   └── globals.css
│   │
│   ├── features/                     # ★ 실제 코드 대부분이 여기
│   │   ├── product/
│   │   │   ├── api/                  # queryKeys, useProducts, useCreateProduct
│   │   │   ├── components/           # ProductTable, ProductForm, ProductCard
│   │   │   ├── hooks/                # useProductFilter
│   │   │   ├── model/                # zod 스키마, 도메인 타입, 상수
│   │   │   ├── lib/                  # 이 기능 전용 순수 함수
│   │   │   └── index.ts              # ★ public API. 외부는 여기로만 import
│   │   ├── order/
│   │   ├── auth/
│   │   └── settings/
│   │
│   ├── shared/                       # 앱 내부 공용 (아직 packages로 올릴 만큼은 아닌 것)
│   │   ├── components/               # AppShell, PageHeader, EmptyState, DataTable
│   │   ├── hooks/                    # useDebounce, useMediaQuery
│   │   ├── lib/                      # apiClient, queryClient, auth-storage
│   │   ├── config/                   # env.ts(zod 검증), routes.ts, constants.ts
│   │   └── types/
│   │
│   └── mocks/                        # MSW (browser.ts / server.ts / handlers)
│
├── public/
├── next.config.ts
├── tailwind.config.ts                # @ondo/ui preset 상속 (content에 packages/ui 포함 필수)
├── tsconfig.json                     # paths: "@/*": ["./src/*"]
└── package.json
```

### 각 레이어 규칙표

| 레이어 | 담는 것 | 담지 말 것 | import 가능 대상 |
|---|---|---|---|
| `app/` | 라우팅, 메타데이터, 레이아웃, 페이지 조립 | 비즈니스 로직, fetch 호출, 폼 상태 | features, shared, packages |
| `features/*/` | 그 도메인의 모든 것 | **다른 feature 내부 파일** | 같은 feature 내부, shared, packages |
| `shared/` | 2개 이상 feature가 쓰는 것 | 특정 도메인 지식 | shared 내부, packages |
| `packages/` | 2개 앱이 쓰는 것 | 앱 전용 로직 | packages 내부만 |

> **feature 간 의존이 필요하면** → 부모 `app/` 페이지에서 조립하거나, 공유분을 `shared/`로 내린다. 절대 `features/order/components/...`를 `features/product`에서 직접 import 하지 않는다.

### ESLint로 강제 (`eslint.config.mjs`)

```js
{
  rules: {
    "no-restricted-imports": ["error", {
      patterns: [
        { group: ["@/features/*/*"], message: "feature는 index.ts(public API)로만 import" },
        { group: ["../../*"],        message: "2단계 이상 상대경로 금지. @/ alias 사용" },
      ],
    }],
  },
}
```

---

## packages/ui

```
packages/ui/src/
├── primitives/        # 원자. 도메인 지식 0. Button, Input, Select, Modal, Toast, Badge, Spinner, Table
├── patterns/          # 2개 이상 primitive 조합. FormField, ConfirmDialog, Pagination, SearchInput
├── styles/            # globals.css, tailwind preset 재수출
├── lib/cn.ts
└── index.ts
```

- 빌드하지 않는다. **`"exports": { ".": "./src/index.ts" }` 로 소스 직접 노출** (transpilePackages) → 빌드 스텝·소스맵 문제 제거
- `apps/*/next.config.ts` 에 `transpilePackages: ["@ondo/ui", "@ondo/api", "@ondo/shared"]`

## packages/api

```
packages/api/src/
├── generated/         # ★ openapi-typescript 산출물. 손으로 고치지 말 것 (.gitignore 대상 아님 — 커밋함)
│   └── schema.d.ts
├── client.ts          # fetch 래퍼 (baseURL, 토큰, 에러 정규화)
├── endpoints/         # product.ts, order.ts — 얇은 함수만
├── mocks/handlers/    # MSW 핸들러 (도메인별)
└── index.ts
```

> `generated/`를 **커밋한다.** 이유: BE 서버 없이 `pnpm install && pnpm build`가 되어야 하고, PR diff에서 API 변경이 눈에 보여야 한다.

---

## 네이밍 규칙 (고정)

| 대상 | 규칙 | 예 |
|---|---|---|
| 폴더 | kebab-case | `product-detail/` |
| 컴포넌트 파일 | PascalCase | `ProductTable.tsx` |
| 훅/유틸 파일 | camelCase | `useProductFilter.ts`, `formatPrice.ts` |
| 라우트 폴더 | Next.js 규칙 | `[productId]`, `(main)` |
| 타입 | PascalCase, `I`/`T` 접두사 금지 | `Product`, `ProductListResponse` |
| zod 스키마 | `xxxSchema` | `productFormSchema` |
| queryKey | `xxxKeys` 팩토리 | `productKeys.list(filter)` |
| 상수 | SCREAMING_SNAKE | `MAX_UPLOAD_SIZE` |
| 불린 | `is/has/should` 접두사 | `isLoading`, `hasNextPage` |
| 이벤트 핸들러 | `handleXxx`(정의) / `onXxx`(prop) | `handleSubmit` / `onSubmit` |

**파일당 컴포넌트 1개.** 100줄 넘는 컴포넌트는 하위로 분리하되, 그 하위가 재사용되지 않으면 **같은 폴더 안에** 둔다 (`ProductTable/` + `ProductTableRow.tsx`).

---

## Server / Client Component 경계 규칙 (App Router 필수 합의)

- `"use client"`는 **가능한 한 잎(leaf)에** 붙인다. 페이지 최상단에 붙이면 App Router 이점이 전부 사라짐
- 데이터 페칭 기본값:
  - **소매(retail)**: 상품 목록/상세/검색 = **Server Component에서 fetch** (SEO·초기 로딩)
  - **도매(wholesale)**: 어드민성 화면 = **Client + TanStack Query** (인터랙션 위주, SEO 불필요)
- Server Component에서 받은 데이터를 Client에 넘길 땐 **직렬화 가능한 형태만** (Date → ISO string)
- `features/*/api/`의 훅은 전부 client. Server용 fetch는 `features/*/api/server.ts`로 분리

---

## 체크리스트

- [ ] 위 트리대로 `apps/wholesale` 스캐폴딩, `retail`은 복사
- [ ] `tsconfig.json` path alias `@/*` 설정
- [ ] `no-restricted-imports` 규칙 적용 (feature 경계 강제)
- [ ] `features/` 첫 도메인 1개를 **레퍼런스 구현**으로 완성 → 이후 전부 복사 (예: `product`)
- [ ] `shared/config/env.ts`에 zod로 환경변수 검증 (누락 시 빌드 실패)
- [ ] Server/Client 경계 규칙을 `CONTRIBUTING.md`에 3줄로 명시
