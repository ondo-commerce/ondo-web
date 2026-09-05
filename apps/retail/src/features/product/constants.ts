import { QTY_UNIT, SKU_ORDER_LIMIT } from "@/shared/qty";

/**
 * 거래 조건 3줄. **화면마다 다시 적지 않는다** — 결제 수단 표기가 갈리면
 * 어느 쪽이 맞는지 사장이 알 수 없다.
 *
 * 결제가 `현금 · 계좌 이체`인 것은 게이트 D2(2026-08-31) 확정이다.
 * `retail_screen_spec.md` RT-23은 아직 `현장 결제`로 적혀 있으나 그 말은 폐기됐다.
 * 수령의 표준어는 **`사입삼촌`(붙여 씀)**이다(§4). `사입 삼촌`으로 띄우지 않는다.
 * 서버 값이 아니다 — 상세 응답에 거래 조건 필드가 없다(`04-wire.md` §1-2).
 */
export const TRADE_TERMS: readonly {
  term: string;
  value: string;
  why: string;
}[] = [
  {
    term: "결제",
    value: "현금 · 계좌 이체",
    why: "도매처가 입금을 건별로 확인해요",
  },
  {
    term: "수령",
    value: "직접 수령 · 사입삼촌 방문",
    why: "택배는 지원하지 않아요",
  },
  {
    term: "교환·반품",
    value: "반품만 가능해요",
    why: "환불 불가 · 도매처와 전화로 진행",
  },
];

/** 가격 범위 아래 한 줄. 왜 값이 하나가 아닌지를 미리 말한다 */
export const PRICE_HINT =
  "컬러 · 사이즈 조합마다 가격이 달라요 — 아래 옵션 목록에서 확인할 수 있어요.";

/** 갤러리에 세우는 썸네일 칸 수. 원본이 5칸이고 넘치면 마지막 칸이 `+N`이 된다 */
export const THUMB_SLOTS = 5;

/**
 * 수량 상수·문구는 **`shared/qty.ts`가 원본이다.** 사장이 숫자를 넣는 자리가
 * 장바구니까지 두 곳이 되면서 올렸다(Rule of Two). 여기서 다시 내보내는 것은
 * 이 화면의 부르는 쪽들이 경로 하나만 알면 되게 하려는 것이고, **정의는 한
 * 곳뿐이다** — 두 벌이 되면 한쪽만 상한이 바뀐다.
 */
export { QTY_ISSUE_TEXT, QTY_UNIT, SKU_ORDER_LIMIT } from "@/shared/qty";

/** 수량 칸 각주. 상한이 어느 단위에 걸리는지를 여기서 못박는다 */
export const QTY_FOOTNOTE = `수량 칸에 숫자를 바로 입력하세요. −/+ 는 미세 조정용이에요. SKU 하나당 한 번에 최대 ${SKU_ORDER_LIMIT}${QTY_UNIT}까지 주문할 수 있어요.`;

/**
 * 같은 상한을 **적용하기 전에** 말할 때 쓰는 말.
 *
 * `QTY_ISSUE_TEXT.OVER_LIMIT`은 값이 실제로 500으로 되돌아간 뒤에 뜨는 완료형
 * (`맞췄어요`)이다. 일괄 입력 팝오버는 `적용`을 누르기 전이라 칸에 아직 900이
 * 그대로 있는데, 같은 문장을 쓰면 **아직 안 한 일을 했다고 말하는 화면**이 된다.
 */
export const BULK_OVER_LIMIT_HINT = `SKU 하나당 한 번에 ${SKU_ORDER_LIMIT}${QTY_UNIT}까지예요. 적용하면 ${SKU_ORDER_LIMIT}${QTY_UNIT}으로 들어가요.`;

/** 재고 소진이지만 미송으로 주문은 되는 조합. **수치는 주지 않는다**(게이트 Q1) */
export const SOLD_OUT_BADGE = "재고 소진 · 미송 가능";

/** 담기가 실패했는데 서버가 문구를 안 줬을 때. 서버 문구가 있으면 그것을 쓴다 */
export const ADD_TO_CART_FAILED =
  "장바구니에 담지 못했어요. 잠시 뒤 다시 시도해 주세요.";
