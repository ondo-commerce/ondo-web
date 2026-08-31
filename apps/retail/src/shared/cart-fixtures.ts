import type { CartLine } from "@/shared/cart-store";

/**
 * 장바구니에 이미 담겨 있는 조합 더미. API가 붙으면 이 파일만 지운다.
 *
 * **`features/cart/fixtures.ts`가 아니라 `shared/`에 있다.** 헤더 뱃지
 * (`shared/components/CartButton`)와 장바구니 화면(`features/cart`)이 같은 값
 * 하나를 읽어야 하는데, import 방향이 `features → shared` 한 방향뿐이라
 * (`CLAUDE.md`) 둘의 공통 조상은 `shared/`밖에 없다. feature 안에 두면 셸이
 * 그것을 못 읽어 뱃지가 자기 숫자를 따로 갖게 되고, 그게 바로 원본의
 * §6-4 결함(헤더 `6개 담김` · 뱃지 `4` · 본문 `담긴 조합 4개`)이다.
 *
 * 값은 확정 와이어프레임 `05_cart.html`의 4줄 그대로다. 상품명·품번·판매가·
 * 재고 소진 여부는 **`features/product/fixtures.ts`의 같은 조합과 일치**해야
 * 한다 — 상품 상세에서 담아 온 화면이라 어긋나면 담은 값과 다른 값이 뜬다.
 * feature 간 import가 막혀 있어 값을 다시 적는 대신, 어느 SKU에서 왔는지를
 * `skuId`가 그대로 말하게 두었다(`${상품id}-${팔레트색}-${사이즈}` — 상품
 * 상세와 같은 규칙).
 *
 * 도매처 위치는 **`features/product/fixtures.ts`의 값**을 쓴다. 와이어프레임은
 * 코튼클럽을 `디오트 3층 51호`로 적었지만 이미 구현된 상품 상세·도매처 홈이
 * `APM 2층 33호`라, 같은 도매처가 화면마다 다른 곳에 있게 된다.
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
    qty: 10,
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
    qty: 6,
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
    qty: 10,
  },
  {
    lineId: "w-cotton:p-cotton-tee-화이트-M",
    wholesalerId: "w-cotton",
    wholesalerName: "코튼클럽",
    wholesalerLocation: "APM 2층 33호",
    productId: "p-cotton-tee",
    productName: "데일리 코튼 티셔츠",
    productCode: "SU-03",
    colorLabel: "화이트",
    size: "M",
    price: 4500,
    soldOut: false,
    qty: 20,
  },
];
