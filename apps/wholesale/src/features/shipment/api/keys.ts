import type {
  OutboundListQuery,
  OutboundRetailersQuery,
  PackingRowsQuery,
} from "./queries";

/**
 * 출고 feature의 queryKey 팩토리. 문자열 키를 흩뿌리지 않는다 — 뮤테이션이 무효화할
 * 대상을 여기서 가리킨다.
 *
 * 계층:
 *   `all` ⊃ `packing()` ⊃ `packingRetailers(q)` / `packingRows(query)`     ← 포장 대기
 *         ⊃ `outbounds()` ⊃ `outboundRetailers(query)` / `outboundRows(query)` ← 출고 대기·완료
 *         ⊃ `detail(id)` / `statement(id)`
 *
 * 포장(POST /outbounds)은 대기 줄이 빠지고 봉투가 생기므로 `packing()`과 `outbounds()`를 통째로,
 * 출고 확정은 봉투가 `NOT_SHIPPED`에서 `SHIPPED`로 옮겨 가므로 `outbounds()`·`detail`·`statement`를 비운다.
 * 칩 건수는 소매처 목록과 같은 키를 봐서 따로 비울 게 없다.
 */
export const shipmentKeys = {
  all: ["shipment"] as const,
  packing: () => [...shipmentKeys.all, "packing"] as const,
  packingRetailers: (q: string | undefined) =>
    [...shipmentKeys.packing(), "retailers", q] as const,
  packingRows: (query: PackingRowsQuery) =>
    [...shipmentKeys.packing(), "rows", query] as const,
  outbounds: () => [...shipmentKeys.all, "outbound"] as const,
  outboundRetailers: (query: OutboundRetailersQuery) =>
    [...shipmentKeys.outbounds(), "retailers", query] as const,
  outboundRows: (query: OutboundListQuery) =>
    [...shipmentKeys.outbounds(), "rows", query] as const,
  detail: (outboundId: number) =>
    [...shipmentKeys.all, "detail", outboundId] as const,
  statement: (outboundId: number) =>
    [...shipmentKeys.all, "statement", outboundId] as const,
};
