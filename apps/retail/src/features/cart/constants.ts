/**
 * 장바구니 화면의 고정 문구. **컴포넌트 안에 문장을 적지 않는다** — 같은 말이
 * 두 곳에 있으면 한쪽만 고쳐진다.
 */

/**
 * 재고가 없지만 미송으로 주문은 되는 조합의 배지.
 *
 * 문구가 원본 세 곳에서 달랐다 — 사양 RT-31 `재고 소진 · 미송 주문 가능` /
 * 장바구니 와이어프레임 `재고 소진 · 미송 주문 가능` / 상품 상세 `재고 소진 ·
 * 미송 가능`. **게이트 Q2(2026-08-31)가 `재고 소진 · 미송 가능`으로 통일했다** —
 * 같은 조합을 상품 상세에서 담고 여기서 다시 보는데 말이 달라지면 안 된다.
 * `features/product/constants.ts`의 `SOLD_OUT_BADGE`와 같은 값이고, feature 간
 * import가 막혀 있어 복제한 것이다(상수는 feature마다 중복 정의가 정답 —
 * `CLAUDE.md`).
 */
export const SOLD_OUT_BADGE = "재고 소진 · 미송 가능";

/**
 * 패널 부제 뒷부분. **접수가 도매처별로 나뉜다는 사실**을 담는 화면에서 미리
 * 말한다 — 주문한 뒤 상태가 도매처마다 따로 도는 것을 그때 처음 알면 늦다.
 */
export const CART_SUB_TAIL =
  "서로 다른 도매처도 한 번에 주문할 수 있어요. 접수는 도매처별로 나뉘어요.";

/** 목록 아래 안내 패널. 재고 소진 배지가 왜 담기를 막지 않는지를 설명한다 */
export const BACKORDER_NOTICE =
  "재고가 없는 조합도 담을 수 있어요. 도매처가 주문을 확정할 때 모자란 수량이 미송으로 넘어가요.";

/** 빈 장바구니 문구. `05b_cart_empty.html` 확정본 그대로다 */
export const EMPTY_CART = {
  title: "장바구니가 비어 있어요",
  description: "마음에 드는 상품을 담으면 여기 모여요.",
} as const;

/**
 * `선택 삭제`가 끝난 뒤에 뜨는 말. **일어난 일만 과거형으로 적는다** —
 * 아직 안 한 일을 완료형으로 말하는 화면을 만들지 않는다(직전 회차 F12).
 */
export function removedNotice(count: number): string {
  return `${count}개 조합을 장바구니에서 뺐어요.`;
}

/**
 * 되돌리기 동선의 두 버튼에 박는 id.
 *
 * **실행 뒤 포커스를 옮길 자리를 찾는 데 쓴다.** `선택 삭제`는 누르고 나면
 * `disabled`가 되고 `되돌리기`는 누르고 나면 사라져서, 그대로 두면 키보드
 * 포커스가 두 번 다 `<body>`로 떨어진다 — 되돌리려면 Tab을 문서 맨 위부터 다시
 * 밟아야 한다(WCAG 2.4.3). `packages/ui`의 `Button`은 ref를 받지 않으므로
 * 두 버튼을 id로 부른다.
 */
export const CART_ACTION_ID = {
  removeSelected: "cart-remove-selected",
  restore: "cart-restore-removed",
} as const;

/**
 * 담아둔 사이에 시즌이 끝났거나 옵션이 지워진 조합의 배지(`isOrderable: false`).
 * 스펙 설명이 "행은 남으니 회색으로 그리고 주문에서 뺀다"라, 행은 두되 체크와
 * 수량 칸을 잠근다. `재고 소진 · 미송 가능`과는 다른 상태다 — 저건 살 수 있고
 * 이건 못 산다.
 */
export const UNORDERABLE_BADGE = "주문 불가";

/**
 * 서버가 `title`을 null로 준 행의 이름 자리. dev의 장바구니에는 도매에 없는
 * variant 행이 실제로 있다 — 빈 칸으로 두면 무엇을 빼야 하는지 알 수 없다.
 */
export const MISSING_PRODUCT_NAME = "상품 정보 없음";

/**
 * 수량 저장이 서버에서 실패했을 때 그 줄에 뜨는 말. 칸은 **서버에 남아 있는 값**으로
 * 되돌린다 — 저장 안 된 숫자를 칸에 두면 합계가 서버와 다른 값을 말한다.
 */
export const SAVE_FAILED_TEXT =
  "수량을 저장하지 못했어요. 저장된 값으로 되돌렸어요. 다시 넣어 주세요.";

/** 빼기·되돌리기가 실패했을 때 툴바 아래 한 줄. 서버가 준 말이 없을 때만 쓴다 */
export const CART_ACTION_FAILED =
  "장바구니를 바꾸지 못했어요. 잠시 뒤 다시 시도해 주세요.";

/**
 * `선택 삭제`가 **일부만** 됐을 때. 일괄 API가 없어 줄마다 DELETE가 따로 나가고
 * 그중 몇은 서버가 받았다 — "못 바꿨어요" 한마디는 거짓말이다. 남은 줄은
 * refresh가 그 자리에 다시 그리므로 사장이 다시 골라 지우면 된다.
 */
export function removeFailedText(total: number, failed: number): string {
  return `${total}개 중 ${failed}개를 못 지웠어요. 남은 조합을 다시 골라 지워 주세요.`;
}

/**
 * `되돌리기`가 **일부만** 됐을 때. 이미 다시 담긴 줄은 버퍼에서 빠져서, 다시
 * 누르면 남은 것만 담는다 — 같은 SKU를 두 번 담으면 서버가 수량을 합산한다.
 */
export function restoreFailedText(total: number, failed: number): string {
  return `${total}개 중 ${failed}개를 되돌리지 못했어요. 되돌리기를 다시 누르면 남은 것만 담아요.`;
}

/**
 * 수량 칸의 글자가 멈춘 뒤 저장까지 기다리는 시간. `1` → `10`을 치는 사이에
 * 앞 값이 먼저 저장되지 않게 한다. 상품 목록 검색의 300ms보다 조금 길다 —
 * 두 자리 수를 치는 손이 그보다 느리다.
 */
export const QTY_SAVE_DELAY_MS = 400;

/**
 * 서버가 도매처 묶음의 `wholesaler`를 null로 준 상자의 이름 자리. dev의 도매에 없는
 * variant 행은 상품뿐 아니라 도매처까지 null이다 — 상자 머리가 비면 어느 묶음인지
 * 말할 수 없다.
 */
export const MISSING_WHOLESALER_NAME = "도매처 정보 없음";
