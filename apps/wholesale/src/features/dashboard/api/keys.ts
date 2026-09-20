/**
 * 대시보드 feature의 queryKey 팩토리. 세 쿼리 전부 `all` 아래에 둔다 —
 * 탭 진입 때 `useInvalidateOnMount(dashboardKeys.all)` 한 번으로 셋을 같이 비운다.
 *
 * 큐는 주문 탭과 같은 엔드포인트를 보지만 키는 `order`가 아니라 여기다. 주문 탭의
 * 확정·취소 뮤테이션은 자기 키(`orderKeys`)만 비우므로 이 큐는 그 즉시 갱신되지 않는다 —
 * 30초 안에 폴링이 따라잡고, 탭을 오가면 진입 때 비운다. feature끼리 키를 나누지 않는다.
 */
export const dashboardKeys = {
  all: ["dashboard"] as const,
  summary: () => [...dashboardKeys.all, "summary"] as const,
  newOrders: () => [...dashboardKeys.all, "new-orders"] as const,
  attention: () => [...dashboardKeys.all, "attention"] as const,
};
