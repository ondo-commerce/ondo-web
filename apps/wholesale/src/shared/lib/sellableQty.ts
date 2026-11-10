/**
 * 판매가능 = 현재고 − 주문처리중 − 미송대기(glossary 3절 공식, 2026-11-10 사용자 결정 #212).
 *
 * 서버 `availableQty`는 이 값이 아니다 — `stockQty − reservedQty`라 미송대기를 안 뺀다
 * (BE web-handoff-2026-11 3절). 그 값을 그대로 그리면 한 줄에 `2 · 0 · 5 · 판매가능 2`가 떠서
 * 사장이 팔 수 있는 2장이 있다고 읽는다. 그래서 서버가 준 세 숫자로 화면이 다시 센다.
 * 재고 탭과 상품 탭이 같이 쓴다 — 공식이 두 곳에 있으면 그게 다시 갈린다.
 *
 * 음수는 그대로 돌려준다. 0으로 감추지 않는다(PM Q4) — 얼마나 모자란지가 숫자로 보여야 한다.
 */
export function sellableQtyOf(
  stock: number,
  reserved: number,
  backorder: number,
): number {
  return stock - reserved - backorder;
}
