import type { SearchParams } from "@ondo/api";
import { DEFAULT_SEARCH_TAB, SEARCH_PAGE_SIZE, SEARCH_TABS } from "./constants";
import type {
  ListingSummaryWire,
  SearchProduct,
  SearchResult,
  SearchTab,
  SearchWholesaler,
} from "./types";

/**
 * 결과를 만드는 규칙은 전부 여기 있다. **화면은 결과를 그리기만 한다.**
 * 상품은 서버가 찾고(`GET /listings?q=`), 도매처는 그 결과에서 파생한다.
 */

/**
 * 검색어를 비교용 값으로 정리한다. 좌우 공백을 지운다: 셸 검색창이 이미 trim
 * 하지만 주소로 직접 들어오는 경로(`/search?q=%20셔츠`)가 열려 있다.
 * 소문자로 바꾸는 것은 **도매처 이름 파생 비교용**이다 — 서버에 보내는 `q`는
 * 친 그대로다(서버가 대소문자를 어떻게 보는지 스펙에 없다).
 */
export function normalizeQuery(raw: string | null | undefined): string {
  return (raw ?? "").trim().toLowerCase();
}

/** 주소의 `?q=`가 비었거나 공백뿐인가. 그러면 결과 대신 안내를 그린다 */
export function isBlankQuery(raw: string | null | undefined): boolean {
  return normalizeQuery(raw).length === 0;
}

/** 주소의 `?tab=`을 정리한다. 목록에 없는 값(옛 링크·오타·`orders`)은 `전체`로 떨어뜨린다 */
export function resolveTab(raw: string | null | undefined): SearchTab {
  return SEARCH_TABS.includes(raw as SearchTab)
    ? (raw as SearchTab)
    : DEFAULT_SEARCH_TAB;
}

/** `GET /listings` 파라미터. 이름은 스냅샷 그대로(`q`·`page`·`size`) */
export function toSearchParams(query: string): SearchParams {
  return { q: query, page: 0, size: SEARCH_PAGE_SIZE };
}

/* ────────────────────────────────────────────────────────────────────────
   wire → 뷰
   ──────────────────────────────────────────────────────────────────────── */

/** `thumbnailUrl`은 non-optional로 생성되지만 사진 없는 게시글이 null로 올 수 있다 */
export function toSearchProduct(wire: ListingSummaryWire): SearchProduct {
  return {
    id: String(wire.listingId),
    name: wire.title,
    wholesalerId: String(wire.wholesaler.id),
    wholesalerName: wire.wholesaler.name,
    thumbnailUrl: wire.thumbnailUrl ?? "",
    colorCount: wire.colorCount,
    sizeCount: wire.sizeCount,
    priceMin: wire.minSalePrice,
  };
}

/**
 * 도매처는 **결과에 나온 상품의 도매처 중 이름이 검색어를 담은 곳**이다.
 * 도매처를 이름으로 찾는 path가 없다(`04-wire.md` §3) — 서버 `q`가 도매처 이름을
 * 보는지도 스펙에 없어서, 검색어가 도매처 이름에만 맞으면 여기도 0건일 수 있다.
 */
function wholesalersOf(
  products: readonly SearchProduct[],
  normalized: string,
): SearchWholesaler[] {
  const seen = new Map<string, SearchWholesaler>();
  for (const p of products) {
    if (!p.wholesalerName.toLowerCase().includes(normalized)) continue;
    if (!seen.has(p.wholesalerId)) {
      seen.set(p.wholesalerId, {
        id: p.wholesalerId,
        name: p.wholesalerName,
        initial: p.wholesalerName.slice(0, 1),
      });
    }
  }
  return [...seen.values()];
}

/** 서버가 준 상품 한 장 + 전체 수 → 화면이 그릴 결과 */
export function toSearchResult(
  items: readonly ListingSummaryWire[],
  productTotal: number,
  normalized: string,
): SearchResult {
  const products = items.map(toSearchProduct);
  return {
    products,
    wholesalers: wholesalersOf(products, normalized),
    productTotal,
  };
}

/* ────────────────────────────────────────────────────────────────────────
   표기
   ──────────────────────────────────────────────────────────────────────── */

/**
 * 탭에 찍히는 숫자. `전체`는 두 축의 합이다.
 *
 * **탭 숫자와 그 탭에서 실제로 그려지는 줄 수가 같다** — 한쪽만 따로 세면
 * `상품 3`이라고 해 놓고 두 줄만 나오는 화면이 된다. 서버가 더 갖고 있는 것은
 * 섹션 머리의 `전체 N건`이 따로 말한다.
 */
export function tabCounts(result: SearchResult): Record<SearchTab, number> {
  const products = result.products.length;
  const wholesalers = result.wholesalers.length;

  return {
    all: products + wholesalers,
    products,
    wholesalers,
  };
}

/** 이 탭에서 그릴 섹션들. `전체`만 둘을 다 편다 */
export function visibleSections(
  tab: SearchTab,
): readonly Exclude<SearchTab, "all">[] {
  return tab === "all" ? ["products", "wholesalers"] : [tab];
}

/** 검색어·탭을 담은 주소. 탭이 바뀌어도 검색어는 그대로 실려 간다 */
export function searchHref(query: string, tab: SearchTab): string {
  const params = new URLSearchParams({ q: query });
  if (tab !== DEFAULT_SEARCH_TAB) params.set("tab", tab);

  return `/search?${params.toString()}`;
}

/** 12,500 → `12,500원~`. 목록 응답이 최저가만 주므로 늘 `~`다(스펙: "카드에 12,500원~으로") */
export function rowPriceLabel(product: SearchProduct): string {
  return `${product.priceMin.toLocaleString("ko-KR")}원~`;
}

/** `무드온 · 컬러 2 · 사이즈 5`. 품번은 목록 응답에 없다 */
export function rowMeta(product: SearchProduct): string {
  return `${product.wholesalerName} · 컬러 ${product.colorCount} · 사이즈 ${product.sizeCount}`;
}
