# 05. API 명세 관리 전략 · P0

> **이 문서의 목적은 하나다: BE 진행 속도가 FE 일정을 막지 못하게 하는 것.**
> FE 1명 · 6개월에서 "API 나오면 붙일게요"로 2주만 대기해도 일정이 무너진다.

BE 서버 구현은 내 담당이 아니다. 여기서 정하는 건 **내가 무엇을 요청하고, 못 받았을 때 어떻게 계속 개발하느냐**다.

---

## 전략: OpenAPI 3.1 단일 원본 → 타입 코드젠 → MSW 목킹

```
 [BE 레포] openapi.yaml          ← 단일 진실 원본 (BE가 관리)
        │
        │  pnpm codegen  (openapi-typescript)
        ▼
 packages/api/src/generated/schema.d.ts    ← 손으로 안 고침, 커밋함
        │
        ├──▶ endpoints/*.ts     타입 안전한 호출 함수
        ├──▶ mocks/handlers/*   MSW 목 (스키마와 같은 타입 사용 → 목이 거짓말 못 함)
        └──▶ features/*/api/*   TanStack Query 훅
```

핵심은 **목 데이터가 생성된 타입을 쓴다는 것**이다. 스펙이 바뀌면 목이 타입 에러를 낸다. 손으로 만든 mock JSON은 이걸 못 잡아서 "목에선 됐는데 실서버에서 깨지는" 사고가 난다.

---

## BE에 요청할 것

킥오프에서 이 4가지만 합의하면 된다. **길게 논의하지 말고 아래를 그대로 제안한다.**

### 1) `openapi.yaml`을 레포에 두고 상시 접근 가능하게

- 위치: BE 레포 루트 `openapi.yaml`
- 접근: main 머지 시 raw URL로 접근 가능 (private면 토큰 붙인 URL 또는 Release asset)
- **구현보다 스펙이 먼저 머지된다** — 경로·필드명·타입만 있으면 됨. 응답 예시는 나중에

### 2) 에러 응답 포맷 고정

```jsonc
// HTTP 4xx / 5xx 공통
{
  "code": "PRODUCT_NOT_FOUND",   // SCREAMING_SNAKE, 화면 분기용 (문구 아님)
  "message": "상품을 찾을 수 없습니다", // 폴백 표시용
  "details": [                    // 폼 필드 에러일 때만
    { "field": "price", "message": "0보다 커야 합니다" }
  ]
}
```
- **`code`가 없으면 FE가 에러를 구분할 수 없다.** message 문자열로 분기하는 코드는 반드시 깨진다
- `details[].field`는 폼 필드명과 동일하게 → RHF `setError`에 바로 매핑

### 3) 페이지네이션 규약 (하나로 통일)

```jsonc
// 요청: ?page=1&size=20&sort=createdAt,desc
// 응답
{
  "content": [ ... ],
  "page": 1, "size": 20, "totalElements": 137, "totalPages": 7,
  "hasNext": true
}
```
- 무한스크롤 쓰는 화면(소매 상품 목록)이 있으면 **커서 방식**을 별도 합의. 목록마다 규약이 다르면 훅을 목록 수만큼 만들어야 함

### 4) 스테이징 환경 + CORS

- `https://api-dev.ondo.xxx` 상시 가동
- CORS 허용: `http://localhost:3000`, `http://localhost:3001`, `https://*.vercel.app`

### 요청 항목 상태 추적표 (킥오프 후 여기 갱신)

| 요청 | 상태 | 없을 때 내 대응 |
|---|---|---|
| openapi.yaml 스켈레톤 | ⬜ | 내가 초안 작성해서 리뷰 요청 |
| 에러 포맷 | ⬜ | 위 포맷 가정하고 진행, 클라이언트에서 정규화 |
| 페이지네이션 규약 | ⬜ | 위 포맷 가정 |
| 스테이징 도메인 | ⬜ | MSW 모드로 계속 개발 |
| CORS | ⬜ | Next Route Handler로 프록시 |

> **팁: `openapi.yaml` 초안을 내가 먼저 써서 던지는 게 가장 빠르다.** BE는 "이 필드는 이래야 한다"고 고치기만 하면 되므로 백지에서 시작할 때보다 합의가 며칠 빨라진다.

---

## FE 쪽 구현

### 코드젠

```json
// packages/api/package.json
{
  "scripts": {
    "codegen": "openapi-typescript $OPENAPI_URL -o ./src/generated/schema.d.ts"
  }
}
```
- `OPENAPI_URL`은 `.env`로 관리 (기본값: 로컬에 받아둔 `./openapi.yaml`)
- **생성물은 커밋한다.** BE 서버 없이도 `pnpm build`가 되어야 하고, PR diff에서 API 변경이 보여야 한다
- CI에서 **drift 체크**: `pnpm codegen` 후 diff 있으면 실패 → [ci.yml](../.github/workflows/ci.yml)

### 타입 사용

```ts
// packages/api/src/types.ts
import type { paths, components } from "./generated/schema";

export type Product = components["schemas"]["ProductResponse"];
export type ProductListParams = paths["/products"]["get"]["parameters"]["query"];
```
> 도메인 타입을 **직접 손으로 선언하지 않는다.** 손으로 쓴 타입은 스펙이 바뀌어도 컴파일이 통과해서 런타임에 터진다.

### 클라이언트 래퍼 (1개만)

```ts
// packages/api/src/client.ts
export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...getAuthHeader(), ...init?.headers },
  });

  if (!res.ok) throw await toApiError(res);   // 위 에러 포맷 → ApiError 인스턴스로 정규화
  return res.status === 204 ? (undefined as T) : res.json();
}
```
책임은 4개만: **baseURL / 토큰 주입 / 401 갱신 / 에러 정규화.** 그 외 로직을 넣지 않는다.

### 쿼리 훅 규칙

```ts
// features/product/api/queryKeys.ts
export const productKeys = {
  all: ["product"] as const,
  list: (params: ProductListParams) => [...productKeys.all, "list", params] as const,
  detail: (id: string) => [...productKeys.all, "detail", id] as const,
};
```
- queryKey는 **반드시 팩토리로.** 인라인 배열을 쓰면 무효화(invalidate) 대상을 놓친다
- 훅 1개 = 엔드포인트 1개. 훅 안에서 2개 이상 호출하지 않는다
- `staleTime` 기본값을 QueryClient에 설정(예: 30초)하고, 개별 훅에서 예외만 지정

---

## MSW — BE 없이 개발하는 장치 (P0에서 가장 중요)

```
packages/api/src/mocks/
├── handlers/
│   ├── product.ts
│   └── order.ts
├── fixtures/          # 생성 타입을 만족하는 샘플 데이터
├── browser.ts         # 개발 서버용
└── server.ts          # 테스트용
```

```ts
// handlers/product.ts — 목이 생성 타입을 사용한다는 게 핵심
import { http, HttpResponse } from "msw";
import type { Product } from "../../types";

const products: Product[] = [ /* 타입이 안 맞으면 여기서 컴파일 에러 */ ];

export const productHandlers = [
  http.get("*/products", ({ request }) => {
    const page = Number(new URL(request.url).searchParams.get("page") ?? 1);
    return HttpResponse.json({ content: products, page, size: 20, totalElements: products.length, hasNext: false });
  }),
  http.get("*/products/:id", ({ params }) => {
    const found = products.find((p) => p.id === params.id);
    return found
      ? HttpResponse.json(found)
      : HttpResponse.json({ code: "PRODUCT_NOT_FOUND", message: "상품을 찾을 수 없습니다" }, { status: 404 });
  }),
];
```

**운영 규칙**
- 환경변수 `NEXT_PUBLIC_API_MOCK=true`로 켜고 끈다. 실서버 붙은 뒤에도 **끄지 말고 남긴다** (BE 장애 시에도 화면 작업 가능)
- 에러 케이스 핸들러도 만든다. 성공 케이스만 목킹하면 에러 UI를 개발 막판에 처음 보게 된다
- **실서버 연동 PR에서 목 핸들러를 함께 갱신**한다 → PR 템플릿에 체크 항목 있음

---

## API 스펙 변경이 왔을 때 흐름

```
1. BE가 openapi.yaml 변경 머지 → 슬랙 공유 (변경 요약 1줄)
2. FE: pnpm codegen
3. tsc가 깨지는 지점 = 영향 범위. 손으로 찾지 않는다  ★
4. 수정 + MSW 핸들러 갱신
5. 커밋: chore(api): openapi 동기화 (상품 상세 응답 필드 추가)
```

**Breaking change 규칙 (합의 필요)**
- 필드 삭제·타입 변경은 **최소 1일 전 예고**
- 추가는 자유 (FE가 무시하면 됨)
- 배포 순서: BE 먼저 → FE. 반대로 하면 실서버가 깨짐

---

## 체크리스트

- [ ] `요청` 킥오프에서 위 4가지 합의 (openapi / 에러포맷 / 페이지네이션 / 스테이징)
- [ ] `FE` `openapi.yaml` 초안 작성해서 BE에 리뷰 요청 (가장 빠른 길)
- [ ] `FE` `packages/api` 생성 + `openapi-typescript` 코드젠 스크립트
- [ ] `FE` `generated/` 커밋 + CI drift 체크 추가
- [ ] `FE` `apiFetch` 래퍼 + `ApiError` 정규화 + 401 갱신
- [ ] `FE` MSW browser/server 설정 + 도메인 2개 핸들러 (성공·에러 케이스 모두)
- [ ] `FE` `NEXT_PUBLIC_API_MOCK` 환경변수 스위치
- [ ] `FE` queryKey 팩토리 패턴 + QueryClient 기본 옵션 확정
- [ ] `FE` 에러 코드 → 사용자 문구 매핑 테이블 (Notion, BE와 공유)
- [ ] `ADR` ADR-0002 기록 → [adr/0002](adr/0002-openapi-codegen-and-msw.md)
