import type { StockMovementType } from "./types";

/**
 * 변동 이력 유형 라벨 — **재고 탭 안에서만 쓰는 이름이다**(glossary §4.5 라벨 예외).
 * `stockOut`을 "출고"라고 부르는 건 이 화면뿐이고, 주문·출고 탭에서 "출고"는
 * 주문 이행을 뜻한다. 그래서 코드값은 그대로 두고 이 표만 재고 탭에 둔다.
 */
export const MOVEMENT_LABEL: Record<StockMovementType, string> = {
  stockIn: "입고",
  stockOut: "출고",
  adjust: "재고 조정",
};

/**
 * 색상·사이즈 필터의 "전체" 값. 단일 선택이라 비어 있는 상태 대신 이 값을 쓴다
 * (Radix Select는 빈 문자열을 값으로 못 받는다).
 */
export const FILTER_ALL = "전체";
