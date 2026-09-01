import type { CartLine } from "./types";

/**
 * 장바구니에 이미 담겨 있는 조합 더미. API가 붙으면 이 파일만 지운다.
 *
 * 값은 확정 와이어프레임 `05_cart.html`의 4줄 그대로다. 상품명·품번·판매가·
 * 재고 소진 여부는 **`features/product/fixtures.ts`의 같은 조합과 일치**해야
 * 한다 — 상품 상세에서 담아 온 화면이라 어긋나면 담은 값과 다른 값이 뜬다.
 * feature 간 import가 막혀 있어 값을 다시 적는 대신, 어느 SKU에서 왔는지를
 * `lineId`가 그대로 말하게 두었다(`${도매처id}:${상품id}-${팔레트색}-${사이즈}`
 * — 상품 상세와 같은 규칙).
 *
 * 수량이 숫자가 아니라 **글자**인 것은 사장이 칸에 친 것을 그대로 들고 있어야
 * 하기 때문이다 — `types.ts`의 `qtyText` 주석 참조.
 *
 * 도매처 위치는 **확정 와이어프레임**을 따른다. 코튼클럽은 `05_cart` ·
 * `06_checkout` · `09_order_detail` · `12_partners` 네 장이 전부 `디오트 3층
 * 51호`라, 먼저 구현된 `features/catalog|product|search/fixtures.ts`의 `APM
 * 2층 33호` 쪽을 이 값으로 맞췄다. 사입삼촌에게 넘길 주소라 화면마다 다르면
 * 안 된다.
 */
export const CART_SEED: readonly CartLine[] = [
  {
    lineId: "w-moodon:p-flower-shirt-레드-S",
    wholesalerId: "w-moodon",
    wholesalerName: "무드온",
    wholesalerLocation: "청평화패션몰 2층 24호",
    productId: "p-flower-shirt",
    productName: "빈티지 플라워 셔츠",
    productCode: "SU-18",
    colorLabel: "체리레드",
    size: "S",
    price: 12500,
    soldOut: false,
    qtyText: "10",
  },
  {
    lineId: "w-moodon:p-flower-shirt-레드-M",
    wholesalerId: "w-moodon",
    wholesalerName: "무드온",
    wholesalerLocation: "청평화패션몰 2층 24호",
    productId: "p-flower-shirt",
    productName: "빈티지 플라워 셔츠",
    productCode: "SU-18",
    colorLabel: "체리레드",
    size: "M",
    price: 13000,
    soldOut: false,
    qtyText: "6",
  },
  {
    lineId: "w-moodon:p-flower-shirt-네이비-L",
    wholesalerId: "w-moodon",
    wholesalerName: "무드온",
    wholesalerLocation: "청평화패션몰 2층 24호",
    productId: "p-flower-shirt",
    productName: "빈티지 플라워 셔츠",
    productCode: "SU-18",
    colorLabel: "딥네이비",
    size: "L",
    /* 상품 상세에서도 재고 소진인 조합이다. **담기는 그대로 된다** — 모자란
       수량은 도매처가 주문을 확정할 때 미송으로 넘어간다(RT-31) */
    price: 13500,
    soldOut: true,
    qtyText: "10",
  },
  {
    lineId: "w-cotton:p-cotton-tee-화이트-M",
    wholesalerId: "w-cotton",
    wholesalerName: "코튼클럽",
    wholesalerLocation: "디오트 3층 51호",
    productId: "p-cotton-tee",
    productName: "데일리 코튼 티셔츠",
    productCode: "SU-03",
    colorLabel: "화이트",
    size: "M",
    price: 4500,
    soldOut: false,
    qtyText: "20",
  },
];
