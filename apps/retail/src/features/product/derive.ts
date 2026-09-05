import { isApiError } from "@ondo/api";
import { parseQty } from "@/shared/qty";
import { ADD_TO_CART_FAILED } from "./constants";
import type {
  CartItemDraft,
  ColorGroup,
  ColorOptionWire,
  ListingDetailWire,
  OptionRow,
  ProductDetail,
  VariantWire,
} from "./types";

/**
 * 상품 상세의 파생값. **JSX 안에서 계산하지 않는다** — 가격 범위·조합 수는
 * 목록 화면이 카드에 찍은 값과 같아야 하는 숫자라, 어디서 나오는지가 한 곳에
 * 모여 있어야 대조할 수 있다.
 */

/* ────────────────────────────────────────────────────────────────────────
   wire → 뷰. 화면은 wire 모양을 모른다.
   ──────────────────────────────────────────────────────────────────────── */

function toOptionRow(variant: VariantWire): OptionRow {
  return {
    skuId: String(variant.id),
    variantId: variant.id,
    size: variant.size,
    price: variant.salePrice,
    /* 스펙에 없다. 값이 오기 전까지 배지는 안 뜬다(`04-wire.md` §3) */
    soldOut: false,
    orderLimit: variant.orderLimit,
  };
}

function toColorGroup(option: ColorOptionWire): ColorGroup {
  return {
    colorId: option.color.id,
    hex: option.color.hex,
    displayName: option.color.name,
    rows: option.variants.map(toOptionRow),
  };
}

/**
 * 상세 한 장. 정렬은 서버가 보장한다(색상은 그룹 → 색상 순, 사이즈 순, 이미지는
 * `sortOrder` ASC) — 다시 정렬하지 않는다.
 *
 * 한 조합도 안 올린 색은 그룹 자체를 만들지 않는다 — 머리만 있고 표가 빈 그룹이
 * 생기면 "여기도 살 수 있나" 하고 한 번 더 보게 된다. 스펙상 `colorOptions`는
 * 게시된 것만이지만 빈 `variants`가 오지 않는다는 보장은 없다.
 *
 * `storeBuilding`·`storeUnit`·`images`는 생성 타입상 non-optional이지만 소매 스펙이
 * `nullable`을 안 적어서 null이 올 수 있다(장바구니 회차 실측과 같은 유형) —
 * 여기서 한 번만 좁힌다.
 */
export function toProductDetail(wire: ListingDetailWire): ProductDetail {
  const { wholesaler } = wire;

  return {
    id: String(wire.listingId),
    name: wire.title,
    code: String(wire.productNumber),
    categoryPath: (wire.categoryPath ?? []).map((node) => node.name),
    wholesaler: {
      id: String(wholesaler.id),
      name: wholesaler.name,
      initial: wholesaler.name.slice(0, 1),
      location: [wholesaler.storeBuilding, wholesaler.storeUnit]
        .filter((part) => Boolean(part))
        .join(" "),
    },
    images: (wire.images ?? []).map((image) => image.url),
    priceMin: wire.minSalePrice,
    priceMax: wire.maxSalePrice,
    colorGroups: wire.colorOptions
      .map(toColorGroup)
      .filter((group) => group.rows.length > 0),
    listedCount: wire.listedVariantCount,
    totalSkuCount: wire.totalVariantCount,
  };
}

/* ────────────────────────────────────────────────────────────────────────
   표기
   ──────────────────────────────────────────────────────────────────────── */

/** 게시된 조합 전부를 한 줄로 편다. 합계 계산이 전부 이 배열에서 나온다 */
export function allRows(product: ProductDetail): OptionRow[] {
  return product.colorGroups.flatMap((g) => g.rows);
}

/**
 * 머리에 서는 가격. `12,500 ~ 13,500` — 단위 `원`은 화면이 따로 붙인다
 * (크기가 다른 글자라 문자열로 합치면 한 덩어리가 된다).
 *
 * 서버의 `minSalePrice`·`maxSalePrice`를 그대로 쓴다 — 행에서 다시 세면 목록
 * 카드(`minSalePrice`)와 어긋날 길이 생긴다. 값이 같으면 `~` 없이 한 값이다.
 * 붙이면 더 비싼 조합이 있다고 잘못 읽힌다.
 */
export function priceRangeLabel(product: ProductDetail): string {
  const won = (n: number) => n.toLocaleString("ko-KR");

  return product.priceMax > product.priceMin
    ? `${won(product.priceMin)} ~ ${won(product.priceMax)}`
    : won(product.priceMin);
}

/** 12,500 → `12,500원` */
export function formatWon(amount: number): string {
  return `${amount.toLocaleString("ko-KR")}원`;
}

/**
 * 게시 옵션 제목 옆 문구.
 * `총 5개 조합 · 전체 15개 중 도매처가 마켓에 올린 것만`
 */
export function optionSummaryText(product: ProductDetail): string {
  return `총 ${product.listedCount}개 조합 · 전체 ${product.totalSkuCount}개 중 도매처가 마켓에 올린 것만`;
}

/* ────────────────────────────────────────────────────────────────────────
   수량 입력 — 이 화면에서 사장이 숫자를 넣는 유일한 자리다.
   도매 5회차에서 `45.5 → 455` 입력 방어 결함이 **5회차 전부 재발**했다.
   ──────────────────────────────────────────────────────────────────────── */

/**
 * 판정은 **`shared/qty.ts` 한 곳**에서 한다. 장바구니도 같은 칸을 쓰게 되면서
 * 올렸다 — 두 벌이 되면 한쪽만 `45.5`를 막고 다른 쪽은 `455`로 삼킨다.
 * 여기서 다시 내보내는 것은 이 화면의 부르는 쪽 경로를 하나로 두려는 것뿐이다.
 */
export { clampQty, parseQty } from "@/shared/qty";
export type { QtyIssue, QtyParse } from "@/shared/qty";

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

/**
 * 칸의 글자 → `POST /cart-items` 요청 목록. **수량이 0인 조합은 보내지 않는다** —
 * 서버는 `qty` 최소 1이다. 스펙이 한 요청에 조합 하나라(`AddCartItemRequest`),
 * 조합 수만큼 요청이 나간다(`04-wire.md` §3).
 */
export function toCartItems(
  product: ProductDetail,
  drafts: Readonly<Record<string, string>>,
): CartItemDraft[] {
  return allRows(product).flatMap((row) => {
    const { qty } = parseQty(drafts[row.skuId] ?? "");
    return qty > 0 ? [{ variantId: row.variantId, qty }] : [];
  });
}

/**
 * 담기 실패를 사장이 읽을 한 줄로. 서버가 준 말이 있으면 그대로 쓴다 —
 * 이 path의 코드(`VALIDATION_FAILED`·`RESOURCE_NOT_FOUND`·`INTERNAL_ERROR`)를
 * 코드별로 갈라 그릴 만큼 화면이 할 수 있는 일이 다르지 않다. 401은
 * `providers.tsx`가 먼저 잡아 `/login`으로 보낸다.
 */
export function describeAddToCartError(error: unknown): string {
  if (isApiError(error) && error.message !== "") return error.message;
  return ADD_TO_CART_FAILED;
}
