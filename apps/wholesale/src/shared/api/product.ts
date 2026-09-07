import { queryOptions } from "@tanstack/react-query";
import { apiFetch, apiFetchPage, type WholesaleSchema } from "@ondo/api";

/**
 * 상품 **읽기** 쿼리의 공용 부분 — 경로·queryKey·fetch·요청 파라미터.
 *
 * 상품 탭(`features/product`)과 재고 탭(`features/inventory`)이 같은 두 응답을 본다
 * (스펙: "상품탭·재고탭 공용", "아코디언 펼침 / 상세 패널 / 재고탭 SKU 표가 모두 이 응답을 쓴다").
 * feature끼리는 import 하지 않으므로(ESLint) 두 번째 사용처가 생긴 이 PR에서 `shared/`로
 * 내렸다(Rule of Two). **queryKey를 같이 쓰는 것이 핵심이다** — 재고 탭에서 입고하면
 * `productKeys.detail(id)`를 비우고, 상품 탭의 SKU 표도 같은 캐시라 같이 새로워진다.
 *
 * 뷰로 바꾸는 `select`는 여기 없다 — 화면이 받는 모양은 feature마다 다르고, 그 변환은
 * 각 feature의 `derive.ts`에 있다. 여기 있는 건 wire까지다.
 */

export type ProductSummary = WholesaleSchema<"ProductSummaryResponse">;
export type ProductDetail = WholesaleSchema<"ProductDetailResponse">;

/** 두 feature가 부르는 상품 경로. 게시·마스터 경로는 상품 탭 안에 있다 */
export const PRODUCT_PATH = {
  products: "/api/wholesale/products",
  product: (productId: number) => `/api/wholesale/products/${productId}`,
} as const;

/** 서버에 보낼 목록 쿼리. 게시 상태는 서버 파라미터가 없어 여기 없다 */
export interface ProductListQuery {
  q: string | undefined;
  /** 0-base */
  page: number;
  size: number;
}

/**
 * 상품 queryKey 팩토리. 문자열 키를 흩뿌리지 않는다 — 뮤테이션이 무효화할 대상을 여기서 가리킨다.
 *
 * 계층: `all` ⊃ `lists()` ⊃ `list(query)` / `detail(id)` / `categories()` / `colors()`.
 * 등록·삭제는 `lists()`를 통째로 비운다(어느 페이지·검색어에 새 상품이 걸릴지 모른다).
 * 수정·입고는 `detail(id)`도 같이 비운다.
 */
export const productKeys = {
  all: ["product"] as const,
  lists: () => [...productKeys.all, "list"] as const,
  list: (query: ProductListQuery) => [...productKeys.lists(), query] as const,
  detail: (productId: number) =>
    [...productKeys.all, "detail", productId] as const,
  categories: () => [...productKeys.all, "categories"] as const,
  colors: () => [...productKeys.all, "colors"] as const,
};

/** 목록 한 페이지. 호출부가 `select`로 자기 뷰를 붙인다 */
export function productListQueryOptions(query: ProductListQuery) {
  return queryOptions({
    queryKey: productKeys.list(query),
    queryFn: () =>
      apiFetchPage<ProductSummary>(PRODUCT_PATH.products, {
        searchParams: { q: query.q, page: query.page, size: query.size },
      }),
  });
}

/** 상품 상세(색상·SKU·게시글). 호출부가 `select`로 자기 뷰를 붙인다 */
export function productDetailQueryOptions(productId: number) {
  return queryOptions({
    queryKey: productKeys.detail(productId),
    queryFn: () => apiFetch<ProductDetail>(PRODUCT_PATH.product(productId)),
  });
}
