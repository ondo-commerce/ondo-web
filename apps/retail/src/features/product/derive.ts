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
