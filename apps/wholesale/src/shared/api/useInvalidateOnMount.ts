import { useQueryClient, type QueryKey } from "@tanstack/react-query";
import { useEffect } from "react";

/**
 * 뷰가 마운트될 때 자기 feature 키를 한 번 무효화한다.
 *
 * 왜 필요한가: 상단 메뉴는 클라이언트 내비게이션이라 QueryClient가 살아 있고, `staleTime`이
 * 30초라 다른 탭에서 바꾼 상태(주문 탭 포장 준비 → 출고 탭 포장 대기)가 30초 안에는 옛 캐시로
 * 온다. 창 포커스 재조회도 꺼 두어 시간이 지나도 저절로 안 돌아온다(wire-shipment F1).
 * feature끼리는 서로 키를 못 비우니(import 금지) **탭에 들어올 때 자기 것을 비우는** 게 유일한 자리다.
 *
 * 왜 `staleTime: 0`이 아닌가: 같은 탭 안의 펼침·필터·검색 왕복은 캐시를 써야 요청이 안 터진다.
 * 탭 **진입** 한 번만 새로 받고, 그 뒤 30초는 캐시가 맞다.
 *
 * 첫 마운트엔 중복 요청이 안 나간다 — Suspense 자식이 이미 시작한 fetch는 데이터가 없어 취소되지
 * 않고 그 promise를 그대로 쓰며, 그 응답이 `isInvalidated`를 지운다. `cancelRefetch: false`는
 * 캐시가 30초를 넘겨 관찰자가 이미 재조회를 시작한 경우에도 그 요청을 끊고 다시 보내지 않게 한다.
 * `refetchType`은 기본(`active`) — 관찰자가 살아 있는 칩 건수 쿼리는 지금 돌고, 관찰자 없는
 * 다른 필터 캐시는 표시만 해 뒀다가 다음에 볼 때 돈다.
 *
 * `queryKey`는 팩토리의 `all`처럼 **안정된 참조**를 넘긴다. 렌더마다 새 배열을 만들면 매번 비운다.
 */
export function useInvalidateOnMount(queryKey: QueryKey) {
  const queryClient = useQueryClient();
  useEffect(() => {
    void queryClient.invalidateQueries({ queryKey }, { cancelRefetch: false });
  }, [queryClient, queryKey]);
}
