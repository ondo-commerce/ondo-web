import type {
  OutboundCreateField,
  OutboundStatus,
  ReceiveBy,
  ShipmentStage,
} from "./types";

/**
 * 수령 방식 라벨. 코드값은 스펙 enum 그대로 두고 한국어는 여기서만 만든다 —
 * `AGENT`를 화면 글자에 맞춰 `agentVisit`처럼 바꾸면 서버 계약과 갈린다.
 */
export const RECEIVE_BY_LABEL: Record<ReceiveBy, string> = {
  RETAILER: "직접 수령",
  AGENT: "사입삼촌",
};

/** 필터 드롭다운에 세울 순서. 표의 묶음 순서(직접 수령 먼저)도 이 배열을 따른다(판정 D7) */
export const RECEIVE_BY_ORDER: readonly ReceiveBy[] = ["RETAILER", "AGENT"];

/**
 * 3단 필터 칩의 글자. 건수는 화면에서 붙인다.
 *
 * `packed`의 라벨은 **`출고 대기`**다(명세 변경). 단계 키(`packed`)는 그대로다 — 서버 `status`
 * 파라미터로는 아래 `STAGE_STATUS`가 바꿔 준다.
 */
export const STAGE_LABEL: Record<ShipmentStage, string> = {
  ready: "포장 대기",
  packed: "출고 대기",
  shipped: "출고 완료",
};

/** 칩 순서 = 업무 흐름 순서. 되돌아가는 전이가 없어서 이 순서가 곧 진행 방향이다 */
export const STAGES: readonly ShipmentStage[] = ["ready", "packed", "shipped"];

/** 봉투 단계 → 서버 `status`. 포장 대기(`ready`)는 봉투가 아니라 여기 없다 */
export const STAGE_STATUS: Record<
  Exclude<ShipmentStage, "ready">,
  OutboundStatus
> = {
  packed: "NOT_SHIPPED",
  shipped: "SHIPPED",
};

/**
 * 수령방식 필터의 "전체" 값. 단일 선택이라 빈 상태 대신 이 값을 쓴다
 * (Radix Select는 빈 문자열을 값으로 못 받는다 — 재고 탭 FILTER_ALL과 같은 이유).
 */
export const FILTER_ALL = "전체";

/** 수령방식 필터가 가질 수 있는 값. 문자열로 두면 라벨 조회에서 캐스팅이 생긴다 */
export type ReceiveByFilterValue = ReceiveBy | typeof FILTER_ALL;

/**
 * 출고 소매처 목록 한 페이지. 화면에 페이저가 없어(Figma) 첫 페이지만 보인다 — 그 안에 최대한 담는다.
 * 상한은 상품 목록과 같은 100으로 본다(이 경로의 상한은 스펙에 없다, 04-wire §3).
 * 칩 건수도 이 한 페이지의 합이라 소매처 100곳을 넘으면 못 센다.
 */
export const RETAILER_PAGE_SIZE = 100;

/** 소매처 하나를 펼쳤을 때 봉투 목록 한 페이지. 같은 이유로 첫 페이지만 */
export const OUTBOUND_PAGE_SIZE = 100;

/** 포장 요청의 칸. 서버 `VALIDATION_FAILED`의 `field`가 이 이름이면 그 칸으로 간다 */
export const OUTBOUND_CREATE_FIELDS: readonly OutboundCreateField[] = [
  "packingItemIds",
];

/**
 * 포장·출고가 거절됐을 때 사장에게 보일 문구. 코드로만 가른다 — 서버 `message`는 개발자용이라
 * 바뀔 수 있고, 그 아래 보조로만 쓴다(`derive.outboundErrorText`).
 */
export const OUTBOUND_ERROR_TEXT: Readonly<Record<string, string>> = {
  // 포장(POST /outbounds)
  INVARIANT_VIOLATED: "요청이 맞지 않아요. 선택을 다시 확인해 주세요.",
  DUPLICATE_PACKING_ITEM: "같은 줄이 두 번 들어갔어요. 선택을 다시 해 주세요.",
  RETAILER_MIXED: "한 포장에는 한 소매처의 품목만 담을 수 있어요.",
  RECEIVE_BY_MIXED:
    "직접 수령과 사입삼촌은 한 포장으로 묶을 수 없어요. 한 가지만 남겨 주세요.",
  // 409·404 뒤엔 재조회가 나가고, 대기열에서 빠진 줄은 선택 패널이 세어 버튼을 잠근다 —
  // "다시 눌러라"고 하지 않는다(fix F3: 시키는 대로 누르면 같은 409였다)
  PACKING_NOT_READY:
    "이미 포장된 줄이 섞여 있어요. 목록을 새로 불러왔어요 — 빠진 줄을 선택에서 빼 주세요.",
  RESOURCE_NOT_FOUND:
    "이미 없어진 항목이에요. 목록을 새로 불러왔어요 — 빠진 줄을 선택에서 빼 주세요.",
  // 출고 확정(POST /outbounds/{id}/ship)
  TRANSITION_NOT_ALLOWED:
    "이미 출고된 봉투예요. 목록을 새로 불러왔으니 확인한 뒤 다시 눌러 주세요.",
  OUTBOUND_EMPTY: "담긴 품목이 없어 출고할 수 없어요.",
  INSUFFICIENT_STOCK:
    "재고가 부족해 출고할 수 없어요. 재고를 먼저 확인해 주세요.",
};

/** 선택 전 우측 안내. 단계마다 무엇을 고르라는 말이 달라서 한 문구로 못 쓴다 */
export const EMPTY_DETAIL_TEXT: Record<ShipmentStage, string> = {
  ready: "좌측 목록에서 포장할 품목을 선택하세요",
  packed: "좌측 목록에서 포장을 선택하세요",
  shipped: "좌측 목록에서 출고 건을 선택하세요",
};

/** 목록이 비었을 때(검색어 없이). 검색 결과 0건은 따로 `검색 결과가 없습니다` */
export const EMPTY_LIST_TEXT: Record<ShipmentStage, string> = {
  ready: "포장 대기 중인 품목이 없습니다",
  packed: "출고 대기 중인 묶음이 없습니다",
  shipped: "출고된 묶음이 없습니다",
};
