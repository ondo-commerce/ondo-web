import type { BadgeProps } from "@ondo/ui";
import type { FulfillmentStatus, SettlementStatus } from "./types";

/** `Badge`가 가진 색은 이 둘뿐이다 — 늘리지 않는다(게이트 G-2) */
type BadgeTone = NonNullable<BadgeProps["tone"]>;

/** 이행 축 라벨 5종(glossary §4.3). 이 표에 없는 값을 화면에 적지 않는다 */
export const FULFILLMENT_LABEL: Record<FulfillmentStatus, string> = {
  placed: "신규 주문",
  confirmed: "주문 확정",
  partialShipped: "부분 출고",
  shipped: "출고 완료",
  canceled: "취소",
};

/**
 * 배지 색 규칙: **진행 중인 것만 파랑, 나머지는 회색.**
 *
 * Figma는 초록·파랑·회색 3색으로 그려져 있지만 `packages/ui`의 `Badge`는 2색이고
 * 게이트 결정(G-2)이 **feature 안에서도 색을 늘리지 않기로** 정했다.
 * 색이 겹쳐도 정보는 잃지 않는다 — 배지 글자가 이미 서로 다르기 때문이다.
 * 대신 구분을 글자와 부호가 맡으므로 라벨을 줄여 쓰거나 아이콘으로 대체하지 않는다.
 */
export const FULFILLMENT_TONE: Record<FulfillmentStatus, BadgeTone> = {
  placed: "active",
  confirmed: "active",
  partialShipped: "active",
  shipped: "done",
  canceled: "done",
};

/** 정산 축 라벨 3종 고정(glossary §5.1). 폐기어 `정산 대기`·`미정산`은 여기 없다 */
export const SETTLEMENT_LABEL: Record<SettlementStatus, string> = {
  unpaid: "미결제",
  partial: "부분 정산",
  settled: "정산 완료",
};

/**
 * 진행 중인 `부분 정산`만 파랑이다.
 * `미결제`와 `정산 완료`가 같은 회색이 되는 것은 **의도된 결과**다(게이트 Q2) —
 * 둘의 구분은 배지 글자와 같은 행의 `미수 잔액` 숫자가 맡는다.
 */
export const SETTLEMENT_TONE: Record<SettlementStatus, BadgeTone> = {
  unpaid: "done",
  partial: "active",
  settled: "done",
};

/**
 * 필터의 "전체" 값. 단일 선택이라 비어 있는 상태 대신 이 값을 쓴다
 * (Radix Select는 빈 문자열을 값으로 못 받는다). 재고 탭과 같은 규칙이다.
 */
export const FILTER_ALL = "전체";
