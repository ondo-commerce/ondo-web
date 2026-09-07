import type { BackorderListQuery } from "../derive";

/**
 * 미송 feature의 queryKey 팩토리. 문자열 키를 흩뿌리지 않는다 — 뮤테이션이 무효화할
 * 대상을 여기서 가리킨다.
 *
 * 계층: `all` ⊃ `lists()` ⊃ `list(query)` / `details()` ⊃ `detail(variantId)`.
 * 배분 확정은 목록(총 미송 수량이 줄고 SKU가 빠질 수 있다)과 그 SKU의 펼침(행·요약)을,
 * 예상 입고일은 목록(예상 입고일 열)과 펼침(`stats.expectedInboundDate`)을 비운다.
 */
export const backorderKeys = {
  all: ["backorder"] as const,
  lists: () => [...backorderKeys.all, "list"] as const,
  list: (query: BackorderListQuery) =>
    [...backorderKeys.lists(), query] as const,
  details: () => [...backorderKeys.all, "detail"] as const,
  detail: (variantId: number) =>
    [...backorderKeys.details(), variantId] as const,
};
