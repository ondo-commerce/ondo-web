/**
 * 미송 0일 때 출고 준비 중 주문 답(loop-08i `01-plan.md` §4-2, §5-2). **목 규칙 = BE 규칙**이다. 순수 함수만 둔다.
 *
 * 포장 원본은 부르는 쪽이 넘긴다 — 목은 주문 목과 출고 목(이슈 #391 전까지 빈 원본), 골든셋은 시나리오 칸
 * `room.packings`. 원본은 **거르지 않고 다 넘긴다.** 이 방 도매처와 소매처의 유효한 포장만 고르는 건 여기서 한다.
 * 미송 후보(`backorderCandidates.ts`)와 같은 이유다: 거르는 곳이 판정 안에 있어야 골든이 거르기 규칙까지 계약으로
 * 잡고 BE도 같은 표로 시험한다.
 *
 * 포장 한 줄에 **없는 칸**도 규칙이다: 출고 예정일, 상품명, 옵션. 본문에는 주문 번호만 나간다(수량도 안 쓴다, D31).
 */

/** 포장 원본 한 줄. 거르지 않은 전부. 고르는 건 판정이 한다 */
export interface InquiryPacking {
  packingId: number;
  orderId: number;
  /** 실제 소유. 모르면 null(판정이 뺀다). 줄마다 도매처가 다르거나 상품을 못 찾으면 원본이 null로 채운다 */
  wholesalerId: number | null;
  retailerId: number;
  orderCancelled: boolean;
  packingStatus: "READY" | "PACKED";
  /** 담긴 봉투의 출고 여부. 봉투 없으면 null */
  outboundShipped: boolean | null;
  /** 이 포장 줄 수량 합 */
  qty: number;
}

/** 원본 전체. 도매처, 소매처, 상태로 거르지 않은 것. 던지면 판정이 넘김으로 바꾼다 */
export type InquiryPackingSource = () => readonly InquiryPacking[];

/**
 * 출고 준비 중이라고 말해도 되는 포장인가. 남기는 조합은 둘뿐이다: READY + 봉투 없음, PACKED + 봉투 출고 전.
 * READY인데 봉투가 있거나, PACKED인데 봉투가 없거나, 이미 출고된 것은 뺀다 — 이상값을 "준비 중"으로 읽으면
 * 이미 떠난 물건을 기다리라고 말하게 된다(07 M2와 같이 안전 쪽으로 읽는다)
 */
function readyToShip(p: InquiryPacking): boolean {
  if (p.packingStatus === "READY") return p.outboundShipped === null;
  return p.outboundShipped === false;
}

/**
 * §4-2 3, 4. 이 방 도매처 + 이 소매처의 유효한 출고 준비 중 포장을 **주문으로 묶은** orderId 목록(오름차순).
 * 소유를 보는 줄이 이 함수의 핵심이다 — 지우면 남의 도매처 주문 번호가 소매에게 나간다.
 * 순서는 orderId다. 주문 시각을 쓰지 않는 건 BE 출고 묶음 응답의 `PackingRef`에 주문 시각이 없어서다
 */
export function packingOrdersOf(
  rows: readonly InquiryPacking[],
  wholesalerId: number,
  retailerId: number,
): number[] {
  const ids = rows
    .filter(
      (p) => p.wholesalerId === wholesalerId && p.retailerId === retailerId,
    )
    .filter((p) => !p.orderCancelled && p.qty > 0)
    .filter(readyToShip)
    .map((p) => p.orderId);
  return [...new Set(ids)].sort((a, b) => a - b);
}

/** 본문에 번호를 싣는 주문 수 상한. 넘치면 "외 n건" */
export const PACKING_ORDER_SHOWN = 3;

/**
 * 포장 답 본문(§5-2, D57 Q1 ①). 번호 뒤에 조사를 안 붙인다(끝 숫자마다 은/는이 바뀐다). 수량을 쓰지 않는다 —
 * 일부만 준비된 주문도 틀린 말이 안 되고, 소매에게 정확 수량을 말하지 않는다(D31)
 */
export function packingReplyBody(orderIds: readonly number[]): string {
  const shown = orderIds
    .slice(0, PACKING_ORDER_SHOWN)
    .map((id) => `#${id}`)
    .join(", ");
  if (orderIds.length === 1) return `출고 준비 중인 주문이 있어요(${shown})`;
  const more = orderIds.length - PACKING_ORDER_SHOWN;
  const tail = more > 0 ? ` 외 ${more}건` : "";
  return `출고 준비 중인 주문 ${orderIds.length}건이 있어요(${shown}${tail})`;
}
