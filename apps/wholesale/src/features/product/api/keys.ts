import type { ProductListQuery } from "../derive";

/**
 * 상품 feature의 queryKey 팩토리. 문자열 키를 흩뿌리지 않는다 — 뮤테이션이 무효화할
 * 대상을 여기서 가리킨다.
 *
 * 계층: `all` ⊃ `lists()` ⊃ `list(query)` / `detail(id)` / `categories()` / `colors()`.
 * 등록·삭제는 `lists()`를 통째로 비운다(어느 페이지·검색어에 새 상품이 걸릴지 모른다).
 * 수정은 `detail(id)`도 같이 비운다.
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
