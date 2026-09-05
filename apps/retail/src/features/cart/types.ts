import type { RetailSchema } from "@ondo/api";
import type { QtyIssue } from "@/shared/qty";

/* ------------------------------------------------------------------------
 * wire — 스펙에서 생성한 타입의 별칭(ADR-0002). 손으로 쓴 Response 타입은 없다.
 * 서버가 필드를 바꾸면 여기가 아니라 `codegen`이 알려준다.
 *
 * 소매 스펙은 `nullable`을 안 적어서 전부 non-optional로 보인다. dev의 장바구니에는
 * 도매에 없는 variant 행이 있어 `title`·`salePrice`가 null로 온다 — 읽는 쪽
 * (`derive.ts`의 `toCartLines`)이 `?? `로 좁힌다.
 * ------------------------------------------------------------------------ */

export type CartWire = RetailSchema<"CartResponse">;
export type CartGroupWire = RetailSchema<"CartGroup">;
export type CartItemWire = RetailSchema<"CartItem">;
export type CartCountWire = RetailSchema<"CartCountResponse">;
export type AddCartItemRequest = RetailSchema<"AddCartItemRequest">;
export type AddCartItemResult = RetailSchema<"AddCartItemResponse">;
export type ChangeQtyRequest = RetailSchema<"ChangeQtyRequest">;
export type ChangeQtyResult = RetailSchema<"ChangeQtyResponse">;

/* ------------------------------------------------------------------------
 * 뷰 — 화면이 받는 모양. `derive.ts`의 `toCartLines(wire)`로만 만든다.
 *
 * **`shared/`가 아니라 여기 있다.** 이 폴더를 지우면 장바구니가 통째로 사라져야
 * 한다(`docs/02-folder-structure.md` 원칙 2). 헤더 뱃지(`CartButton`)도 이
 * feature의 public API이고 부모 `app/(shop)/layout.tsx`가 끼워 넣는다.
 * ------------------------------------------------------------------------ */

/**
 * 담긴 조합 한 줄 = SKU 하나(색상 × 사이즈).
 *
 * 서버가 주는 값과 UI 상태가 섞여 있다 — `qtyText`만 UI 상태(칸에 친 글자)이고
 * 나머지는 전부 `GET /cart-items`에서 왔다. `store.ts`는 서버 값을 들고 있지
 * 않으므로, 서버 행에 칸 글자를 얹는 것은 `derive.ts`의 `applyDrafts`가 한다.
 *
 * **재고 수치가 없다**(게이트 Q1). 재고 소진 여부(`soldOut`)도 스펙에 없어서
 * 항상 false다 — 배지 자리는 남겨 두고 값이 오면 켠다(`04-wire.md` §3).
 */
export interface CartLine {
  /** `String(cartItemId)`. 선택 집합·draft·되돌리기 버퍼가 이 문자열 키를 쓴다 */
  lineId: string;
  /** 수량 변경·빼기 요청에 실리는 값 */
  cartItemId: number;
  /** 되돌리기(다시 담기)에 실리는 SKU id */
  variantId: number;
  wholesalerId: string;
  wholesalerName: string;
  /**
   * 상가 · 층 · 호. **스펙에 없다** — `CartWholesaler`는 `id`·`name`뿐이라
   * 빈 문자열이고, 화면은 비어 있으면 그 자리를 숨긴다. 사입삼촌에게 넘길
   * 주소라 BE 요청 목록에 올렸다.
   */
  wholesalerLocation: string;
  /** 상품 상세로 갈 때 쓰는 게시글 id(`listingId`) */
  productId: string;
  productName: string;
  /** 노출용 색상 표기(자유 텍스트). 팔레트 키가 아니라 도매 현장의 색 이름이다 */
  colorLabel: string;
  size: string;
  /** 담을 때가 아니라 **매번 도매에서 다시 가져온** 판매가. 주문 불가면 null일 수 있다 */
  price: number | null;
  /** 재고 소진 · 미송 가능. 스펙에 없어 항상 false */
  soldOut: boolean;
  /**
   * 담아둔 사이에 시즌이 끝났거나 옵션이 지워졌으면 false. 행은 남지만 체크
   * 못 하고 수량 칸이 잠기며 합계에서 빠진다 — 빼기(X)만 된다.
   */
  orderable: boolean;
  /** 서버에 저장된 수량. 칸 글자(`qtyText`)와 다를 수 있다 — 저장 전이거나 못 읽는 글자일 때 */
  qty: number;
  /**
   * 수량 칸에 들어 있는 **글자 그대로**. 숫자가 아니다.
   *
   * `45.5`처럼 못 읽는 입력도 그대로 들고 있어야 사장이 무엇을 쳤는지 화면이
   * 되돌려 말해 줄 수 있다. 점만 조용히 지우면 `455`가 되어 45배를 주문하게
   * 된다 — 도매 5회차 내리 재발한 결함이다. 숫자로 바꾸는 것은 `parseQty`
   * 한 곳에서만 한다.
   */
  qtyText: string;
}

/**
 * 한 줄에 붙는 이유 문구의 종류. `shared/qty`의 두 가지에 **저장 실패**가 더해졌다 —
 * 서버가 생기면서 "값은 맞는데 저장이 안 된" 경우가 새로 생겼다.
 */
export type CartLineIssue = QtyIssue | "SAVE_FAILED";

/** `선택 삭제`로 뺀 것 중 되돌릴 때 다시 담을 값. 서버 행이 아니라 되돌리기 버퍼다 */
export interface RemovedLine {
  lineId: string;
  variantId: number;
  qty: number;
}
