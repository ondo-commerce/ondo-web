/**
 * 수량 입력 한 벌 — 상수 · 판정 · clamp.
 *
 * **`features/product`에 있던 것을 그대로 올렸다.** 사장이 숫자를 넣는 자리가
 * 상품 상세 옵션 표와 장바구니 두 곳이 됐는데(Rule of Two), feature끼리는 직접
 * import 하지 않으므로 여기 두지 않으면 판정이 두 벌이 된다. 판정이 두 벌이면
 * 한쪽만 `45.5`를 막고 다른 쪽은 `455`로 삼키는 화면이 된다 — 그 결함은 도매
 * 5회차 내리 재발했다.
 *
 * 값과 문구를 같이 두는 이유: 상한을 고칠 때 안내 문장도 같이 안 고치면
 * "500까지"라고 말하면서 300에서 잘리는 칸이 된다.
 */

/**
 * 한 번에 주문할 수 있는 상한. **SKU 하나당**이다(glossary G13) — 상품 단위가
 * 아니다. 색상 × 사이즈 조합마다 500장까지이고, 조합이 여럿이면 합계는 더 커질
 * 수 있다. 화면 문구와 clamp가 이 값 하나를 같이 읽는다.
 */
export const SKU_ORDER_LIMIT = 500;

/** 수량 단위. 소매는 `장`이다(게이트 Q9). 도매 화면의 `개`와는 별도 이슈로 맞춘다 */
export const QTY_UNIT = "장";

/**
 * 수량 입력이 걸렸을 때 그 행에 뜨는 말.
 *
 * **값만 되돌리고 말을 안 하면 "고장난 칸"이 된다**(도매 5회차 F5). 특히
 * `45.5`처럼 소수점을 넣은 경우 — 점만 조용히 지우면 `455`가 되어 45배를
 * 주문하게 되므로, 친 글자를 그대로 두고 왜 못 받는지 말한다.
 */
export const QTY_ISSUE_TEXT = {
  NOT_A_NUMBER: `수량은 낱장 단위예요. 0 이상의 정수만 넣을 수 있어요(소수점 · 부호 · 전각 숫자는 못 받아요).`,
  OVER_LIMIT: `SKU 하나당 한 번에 ${SKU_ORDER_LIMIT}${QTY_UNIT}까지예요. ${SKU_ORDER_LIMIT}${QTY_UNIT}으로 맞췄어요.`,
} as const;

export type QtyIssue = "NOT_A_NUMBER" | "OVER_LIMIT";

export interface QtyParse {
  /** 합계에 들어갈 값. 못 읽은 입력은 0으로 본다(값을 지어내지 않는다) */
  qty: number;
  /** 걸린 이유. 있으면 그 행에 문구가 뜬다 */
  issue: QtyIssue | null;
}

/**
 * 수량 칸의 **글자**를 수량으로 읽는다.
 *
 * 핵심은 **숫자가 아닌 글자를 지우지 않는 것**이다. `45.5`에서 점만 조용히
 * 빼면 `455`가 되어 45배를 주문하게 된다(5회차 내리 재발한 결함). 못 읽는
 * 입력은 값을 0으로 보되 친 글자는 화면에 그대로 두고, 왜 못 받는지 말한다.
 *
 * `\d`는 ASCII 숫자만 잡는다 — 전각 `０１`도 여기서 걸린다. 부호(`-3`·`3-`)와
 * 지수 표기(`1e3`)도 정규식이 통째로 막는다. `Number()`에 먼저 넣지 않는 이유가
 * 이것이다: `Number("1e3")`은 1000이고 `Number("")`은 0이라, 숫자로 바꾼 뒤에는
 * 무엇이 들어왔는지 알 수 없다.
 */
export function parseQty(raw: string): QtyParse {
  const text = raw.trim();
  if (text === "") return { qty: 0, issue: null };
  if (!/^\d+$/.test(text)) return { qty: 0, issue: "NOT_A_NUMBER" };

  const value = Number(text);
  if (value > SKU_ORDER_LIMIT) {
    return { qty: SKU_ORDER_LIMIT, issue: "OVER_LIMIT" };
  }

  return { qty: value, issue: null };
}

/** −/+ 버튼이 쓰는 clamp. 상한·하한을 넘지 않는다 */
export function clampQty(value: number): number {
  return Math.min(Math.max(value, 0), SKU_ORDER_LIMIT);
}
