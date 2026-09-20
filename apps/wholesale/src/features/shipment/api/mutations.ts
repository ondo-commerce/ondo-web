"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@ondo/api";
import { shipmentKeys } from "./keys";
import { SHIPMENT_PATH } from "./queries";
import { isStaleRejection } from "../derive";
import type {
  OutboundCreated,
  OutboundCreateRequest,
  OutboundDetail,
} from "../types";

/**
 * 쓰기는 전부 여기. 성공하면 `keys.ts`의 팩토리로 무효화한다 — 칩·아코디언·펼침 표가
 * 같은 봉투를 보고 있어서, 한쪽만 갱신하면 칩은 3인데 표는 2줄이 된다.
 *
 * **409·404로 거절됐을 때도 같은 무효화를 한다.** 화면이 든 값이 서버와 어긋난 것이라
 * 다시 불러오지 않으면 같은 버튼을 눌러 같은 거절을 본다(wire-order F3 · wire-backorder F1).
 *
 * `onSuccess`는 **재조회가 끝난 뒤** `onDone`을 부른다. 재조회가 실패해도 여기서 던지지 않는다 —
 * 던지면 포장이 거절된 것처럼 보여 사장이 한 번 더 누른다. 대신 `refreshed=false`를 넘겨
 * 화면이 "됐지만 목록이 옛것"이라고 말하고 버튼을 잠근다(wire-inventory F2).
 */

type QueryClient = ReturnType<typeof useQueryClient>;

/**
 * 무효화 + 재조회 결과. `throwOnError`로 재조회 실패를 받아 boolean으로 바꾼다 —
 * 기본값이면 실패가 조용히 삼켜져 화면이 옛 목록을 새 목록인 줄 안다.
 */
function refetch(
  queryClient: QueryClient,
  keys: readonly (readonly unknown[])[],
): Promise<boolean> {
  return Promise.all(
    keys.map((queryKey) =>
      queryClient.invalidateQueries({ queryKey }, { throwOnError: true }),
    ),
  ).then(
    () => true,
    () => false,
  );
}

/** 포장 뒤 낡는 것 — 대기 소매처·줄(빠진다), 출고 소매처·봉투 목록(생긴다). 칩은 같은 키다 */
function refetchAfterPack(queryClient: QueryClient) {
  return refetch(queryClient, [
    shipmentKeys.packing(),
    shipmentKeys.outbounds(),
  ]);
}

/** 출고 확정 뒤 낡는 것 — 출고 소매처·봉투 목록(NOT_SHIPPED → SHIPPED로 옮겨 간다), 그 봉투의 장끼 */
function refetchAfterShip(queryClient: QueryClient, outboundId: number) {
  return refetch(queryClient, [
    shipmentKeys.outbounds(),
    shipmentKeys.statement(outboundId),
  ]);
}

/**
 * `onDone`은 **훅 옵션**으로 받는다. `mutate(vars, { onSuccess })`로 넘기면 안 된다 —
 * 선택이 풀리며 우측 패널이 언마운트되는데, TanStack v5는 언마운트된 컴포넌트의 호출별
 * 콜백을 건너뛴다. 훅 옵션의 콜백은 뮤테이션 자체에 붙어 늘 돈다.
 */
export interface CreateOutboundDone {
  onDone?: (created: OutboundCreated, refreshed: boolean) => void;
}

/** 포장 완료(봉투 생성). 재고는 아직 줄지 않는다 — 차감은 출고 확정(스펙) */
export function useCreateOutboundMutation({ onDone }: CreateOutboundDone = {}) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: OutboundCreateRequest) =>
      apiFetch<OutboundCreated>(SHIPMENT_PATH.outbounds, {
        method: "POST",
        body,
      }),
    // 반환한 promise를 TanStack이 기다린다 — `isPending`은 재조회가 **끝난 뒤**에 풀린다
    onSuccess: async (created) => {
      const refreshed = await refetchAfterPack(queryClient);
      onDone?.(created, refreshed);
    },
    onError: (error) =>
      isStaleRejection(error) ? refetchAfterPack(queryClient) : undefined,
  });
}

export interface ShipOutboundDone {
  onDone?: (detail: OutboundDetail, refreshed: boolean) => void;
}

/**
 * 출고 확정 — 재고가 실제로 줄어드는 유일한 지점(스펙). 응답은 **상세와 같은 스키마**라
 * 상세 캐시에 wire 그대로 심는다 — `useOutboundDetailQuery`의 `select`가 읽을 때 뷰로 바꾼다.
 */
export function useShipOutboundMutation(
  outboundId: number,
  { onDone }: ShipOutboundDone = {},
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch<OutboundDetail>(SHIPMENT_PATH.ship(outboundId), {
        method: "POST",
      }),
    onSuccess: async (detail) => {
      queryClient.setQueryData(shipmentKeys.detail(outboundId), detail);
      const refreshed = await refetchAfterShip(queryClient, outboundId);
      onDone?.(detail, refreshed);
    },
    onError: (error) =>
      isStaleRejection(error)
        ? Promise.all([
            queryClient.invalidateQueries({
              queryKey: shipmentKeys.detail(outboundId),
            }),
            refetchAfterShip(queryClient, outboundId),
          ])
        : undefined,
  });
}

/**
 * 재조회가 실패한 뒤 `다시 불러오기`가 부른다 — 뮤테이션과 **같은 무효화**다.
 * 어느 단계에 있든 포장·출고 둘 다 비운다(이 탭의 목록 전부). 결과(성공 여부)를 돌려준다.
 */
export function useShipmentRefresh() {
  const queryClient = useQueryClient();
  return () => refetch(queryClient, [shipmentKeys.all]);
}
