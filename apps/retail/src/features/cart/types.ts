/**
 * 장바구니 도메인 타입.
 *
 * **`shared/`가 아니라 여기 있다.** 이 폴더를 지우면 장바구니가 통째로 사라져야
 * 한다(`docs/02-folder-structure.md` 원칙 2). 헤더 뱃지가 이 값을 읽어야 해서
 * 한때 `shared/`에 뒀지만, 뱃지 자체를 이 feature의 public API로 내보내고
 * 부모 `app/(shop)/layout.tsx`에서 조립하면 import 방향(`app → features →
 * shared`)을 어기지 않는다.
 */

/**
 * 담긴 조합 한 줄 = SKU 하나(색상 × 사이즈).
 *
 * **재고 수치가 없다**(게이트 Q1). "재고가 없지만 미송으로 주문은 된다"는
 * 사실만 `soldOut` boolean으로 온다 — 숫자를 지어내지 않는다.
 */
export interface CartLine {
  /** 도매처 + SKU. 같은 조합을 두 도매처에서 담을 수 있어 SKU만으로는 안 된다 */
  lineId: string;
  wholesalerId: string;
  wholesalerName: string;
  /** 상가 · 층 · 호. 사입삼촌에게 넘길 주소라 그룹 머리에 계속 붙어 있다 */
  wholesalerLocation: string;
  productId: string;
  productName: string;
  /** 품번 (SU-18 형태) — 게이트 Q3 */
  productCode: string;
  /** 노출용 색상 표기(자유 텍스트). 팔레트 키가 아니라 도매 현장의 색 이름이다 */
  colorLabel: string;
  size: string;
  /** 담을 때의 판매가. 장바구니에서 고칠 수 없다 */
  price: number;
  /** 재고 소진 · 미송 가능. 수량은 그래도 넣을 수 있다 */
  soldOut: boolean;
  /** 담긴 장수. 이 화면에서 고치는 것은 #106 몫이고 지금은 읽기만 한다 */
  qty: number;
}
