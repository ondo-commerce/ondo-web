import type { PickupMethod, ShipmentStage } from "./types";

/**
 * 수령 방식 라벨. 코드값은 glossary §4.3의 ENUM 그대로 두고 한국어는 여기서만 만든다 —
 * `AGENT_VISIT`을 화면 글자에 맞춰 `agentVisit`처럼 바꾸면 서버 계약과 갈린다.
 */
export const PICKUP_METHOD_LABEL: Record<PickupMethod, string> = {
  SELF_PICKUP: "직접 수령",
  AGENT_VISIT: "사입삼촌",
};

/** 필터 드롭다운에 세울 순서. 표의 묶음 순서(직접 수령 먼저)도 이 배열을 따른다 */
export const PICKUP_METHODS: readonly PickupMethod[] = [
  "SELF_PICKUP",
  "AGENT_VISIT",
];

/**
 * 3단 필터 칩의 글자. 건수는 화면에서 붙인다.
 *
 * `packed`의 라벨이 `포장 완료`에서 **`출고 대기`로 바뀌었다**(명세 변경).
 * 바뀐 건 한국어 라벨뿐이고 **단계 키(`packed`)와 상태값(`PackageStatus.PACKED`)은 그대로다** —
 * 위 PICKUP_METHOD_LABEL 주석과 같은 이유로, 화면 글자에 맞춰 코드값을 돌리면 서버 계약과 갈린다
 * (`settlement_data_model.md` §2.7의 ENUM이 `PACKED`다).
 */
export const STAGE_LABEL: Record<ShipmentStage, string> = {
  ready: "포장 대기",
  packed: "출고 대기",
  shipped: "출고 완료",
};

/**
 * 수령방식 필터의 "전체" 값. 단일 선택이라 빈 상태 대신 이 값을 쓴다
 * (Radix Select는 빈 문자열을 값으로 못 받는다 — 재고 탭 FILTER_ALL과 같은 이유).
 */
export const FILTER_ALL = "전체";

/** 수령방식 필터가 가질 수 있는 값. 문자열로 두면 라벨 조회에서 캐스팅이 생긴다 */
export type PickupFilterValue = PickupMethod | typeof FILTER_ALL;

/**
 * 장끼의 `도매처` 칸에 들어갈 이름 = 이 ERP를 쓰는 도매처 자신.
 * 로그인·업체 정보 화면이 아직 없어서 더미로 둔다.
 *
 * 라벨이 `판매처`가 아닌 이유: glossary §2.1이 `판매처`를 폐기어(→소매처)로
 * 지정해서, 그대로 쓰면 같은 카드의 `거래처`(소매처)와 정반대를 가리키게 된다.
 */
export const WHOLESALER_NAME = "도도도매";
