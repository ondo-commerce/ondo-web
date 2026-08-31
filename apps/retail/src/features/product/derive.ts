import { SKU_ORDER_LIMIT } from "./constants";
import type { OptionRow, ProductDetail } from "./types";

/**
 * 상품 상세의 파생값. **JSX 안에서 계산하지 않는다** — 가격 범위·조합 수는
 * 목록 화면이 카드에 찍은 값과 같아야 하는 숫자라, 어디서 나오는지가 한 곳에
 * 모여 있어야 대조할 수 있다.
 */

/** 게시된 조합 전부를 한 줄로 편다. 합계·범위 계산이 전부 이 배열에서 나온다 */
export function allRows(product: ProductDetail): OptionRow[] {
  return product.colorGroups.flatMap((g) => g.rows);
}

/** 도매처가 마켓에 올린 조합 수. `총 5개 조합`의 앞숫자 */
export function publishedCount(product: ProductDetail): number {
  return allRows(product).length;
}

/**
 * 머리에 서는 가격. `12,500 ~ 13,500` — 단위 `원`은 화면이 따로 붙인다
 * (크기가 다른 글자라 문자열로 합치면 한 덩어리가 된다).
 *
 * 조합이 하나뿐이거나 값이 모두 같으면 `~` 없이 한 값이다. 붙이면 더 비싼 조합이
 * 있다고 잘못 읽힌다.
 */
export function priceRangeLabel(product: ProductDetail): string {
  const prices = allRows(product).map((r) => r.price);
  if (prices.length === 0) return "0";

  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const won = (n: number) => n.toLocaleString("ko-KR");

  return max > min ? `${won(min)} ~ ${won(max)}` : won(min);
}

/** 12,500 → `12,500원` */
export function formatWon(amount: number): string {
  return `${amount.toLocaleString("ko-KR")}원`;
}

/** 지금 주문할 수 있는가. 시즌 종료·게시 내림이면 수량 입력까지 잠긴다 */
export function isOrderable(product: ProductDetail): boolean {
  return product.status === "ON_SALE";
}

/**
 * 게시 옵션 제목 옆 문구.
 * `총 5개 조합 · 전체 15개 중 도매처가 마켓에 올린 것만`
 */
export function optionSummaryText(product: ProductDetail): string {
  return `총 ${publishedCount(product)}개 조합 · 전체 ${product.totalSkuCount}개 중 도매처가 마켓에 올린 것만`;
}

/* ────────────────────────────────────────────────────────────────────────
   수량 입력 — 이 화면에서 사장이 숫자를 넣는 유일한 자리다.
   도매 5회차에서 `45.5 → 455` 입력 방어 결함이 **5회차 전부 재발**했다.
   ──────────────────────────────────────────────────────────────────────── */

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

/** 행 소계 = 판매가 × 수량. 0장이면 금액이 아니라 `—`라 여기서는 0을 준다 */
export function rowSubtotal(row: OptionRow, qty: number): number {
  return row.price * qty;
}

export interface OrderTotals {
  /** 수량을 넣은 조합 수. `장바구니 담기` 결과 신호가 이 값을 읽는다 */
  comboCount: number;
  /** 총 장수 */
  sheets: number;
  /** 합계 금액 */
  amount: number;
  /** 아직 못 읽은 입력이 남아 있는가. 있으면 담기를 막는다 */
  hasIssue: boolean;
}

/**
 * 합계 바가 읽는 값 전부. **화면에서 더하지 않는다** —
 * `총 N장`과 `합계`가 서로 다른 곳에서 계산되면 한쪽만 안 따라온다.
 */
export function orderTotals(
  product: ProductDetail,
  drafts: Readonly<Record<string, string>>,
): OrderTotals {
  return allRows(product).reduce<OrderTotals>(
    (acc, row) => {
      const { qty, issue } = parseQty(drafts[row.skuId] ?? "");

      return {
        comboCount: acc.comboCount + (qty > 0 ? 1 : 0),
        sheets: acc.sheets + qty,
        amount: acc.amount + rowSubtotal(row, qty),
        hasIssue: acc.hasIssue || issue === "NOT_A_NUMBER",
      };
    },
    { comboCount: 0, sheets: 0, amount: 0, hasIssue: false },
  );
}

/**
 * 지금 넣은 수량을 한 문자열로 굳힌다. `장바구니 담기`가 **또 눌러야 하는지**를
 * 판단하는 열쇠다 — 담은 뒤 값이 그대로면 같은 것을 두 번 담을 이유가 없고,
 * 한 칸이라도 바뀌면 다시 담을 수 있어야 한다.
 */
export function draftKey(
  product: ProductDetail,
  drafts: Readonly<Record<string, string>>,
): string {
  return allRows(product)
    .map((row) => `${row.skuId}:${parseQty(drafts[row.skuId] ?? "").qty}`)
    .join("|");
}
