import type { OrderListQuery } from "../derive";

/**
 * 주문 feature의 queryKey 팩토리. 문자열 키를 흩뿌리지 않는다 — 뮤테이션이 무효화할
 * 대상을 여기서 가리킨다.
 *
 * 계층: `all` ⊃ `lists()` ⊃ `list(query)` / `filters(q)` / `detail(id)` / `packings(id)`.
 * 확정·취소·포장은 어느 칩·페이지에 그 주문이 걸릴지 모르므로 `lists()`와 `filters()`를
 * 통째로 비운다. 상세는 `detail(id)`만, 포장 대기열은 `packings(id)`만.
 */
export const orderKeys = {
  all: ["order"] as const,
  lists: () => [...orderKeys.all, "list"] as const,
  list: (query: OrderListQuery) => [...orderKeys.lists(), query] as const,
  filters: () => [...orderKeys.all, "filters"] as const,
  filter: (q: string | undefined) => [...orderKeys.filters(), q] as const,
  detail: (orderId: number) => [...orderKeys.all, "detail", orderId] as const,
  packings: (orderId: number) =>
    [...orderKeys.all, "packings", orderId] as const,
};
