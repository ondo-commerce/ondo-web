import type { InboundField, StockMovementType } from "./types";

/**
 * 변동 이력 유형 라벨 — **재고 탭 안에서만 쓰는 이름이다**(glossary §4.5 라벨 예외).
 * `OUT`을 "출고"라고 부르는 건 이 화면뿐이고, 주문·출고 탭에서 "출고"는
 * 주문 이행을 뜻한다. 그래서 코드값(스펙 enum)은 그대로 두고 이 표만 재고 탭에 둔다.
 */
export const MOVEMENT_LABEL: Record<StockMovementType, string> = {
  IN: "입고",
  OUT: "출고",
  ADJUST: "재고 조정",
};

/**
 * 색상·사이즈 필터의 "전체" 값. 단일 선택이라 비어 있는 상태 대신 이 값을 쓴다
 * (Radix Select는 빈 문자열을 값으로 못 받는다).
 */
export const FILTER_ALL = "전체";

/**
 * 목록 한 페이지. 스펙 기본값(20)이다. 상품 탭처럼 100을 안 쓰는 이유: 목록 응답에 재고 합계가
 * 없어 행마다 상세를 한 번씩 더 부른다(04-wire §3-1) — 한 페이지가 곧 요청 수다.
 */
export const PAGE_SIZE = 20;

/**
 * 변동 이력 한 페이지. 화면에 페이저가 없어(Figma) 첫 페이지만 보인다 — 그 안에 최대한 담는다.
 * 상한은 상품 목록과 같은 100으로 본다(이 경로의 상한은 스펙에 없다, 04-wire §3).
 */
export const MOVEMENT_PAGE_SIZE = 100;

/** 입고 요청의 칸. 서버 `VALIDATION_FAILED`의 `field`가 이 이름이면 그 칸으로 간다 */
export const INBOUND_FIELDS: readonly InboundField[] = ["receivedAt", "items"];

/**
 * 입고가 거절됐을 때 사장에게 보일 문구. 코드로만 가른다 — 서버 `message`는 개발자용이라
 * 바뀔 수 있고, 그 아래 보조로만 쓴다(`derive.inboundErrorText`).
 */
export const INBOUND_ERROR_TEXT: Readonly<Record<string, string>> = {
  DUPLICATE_LOT:
    "같은 SKU에 같은 단가가 두 줄 들어갔어요. 한 줄로 합쳐 주세요.",
  INVARIANT_VIOLATED: "수량이나 매입단가가 맞지 않아요. 다시 입력해 주세요.",
  RESOURCE_NOT_FOUND:
    "이미 없어진 SKU가 섞여 있어요. 목록을 다시 불러온 뒤 확인해 주세요.",
  IDEMPOTENCY_KEY_REUSED: "같은 요청이 이미 처리됐어요. 목록을 확인해 주세요.",
  STATE_CONFLICT:
    "지금 상태에서는 입고할 수 없어요. 목록을 다시 불러온 뒤 확인해 주세요.",
};
