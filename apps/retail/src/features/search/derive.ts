import { DEFAULT_SEARCH_TAB, SEARCH_TABS } from "./constants";
import type {
  MatchedProduct,
  SearchOrder,
  SearchProduct,
  SearchResult,
  SearchTab,
  SearchWholesaler,
} from "./types";

/**
 * 매칭·정렬 규칙은 전부 여기 있다. **화면은 결과를 그리기만 한다** —
 * "품번이 정확히 일치하는 상품을 먼저 보여줘요"라는 약속이 지켜지는지
 * 한 함수만 보면 되게 하려는 것이다.
 */

/**
 * 검색어를 비교용 값으로 정리한다.
 *
 * 대소문자를 지우는 것은 화면이 사장에게 약속한 말이다 — `st-002`와 `ST-002`의
 * 결과가 같아야 한다. 좌우 공백도 지운다: 셸 검색창이 이미 trim 하지만
 * 주소로 직접 들어오는 경로(`/search?q=%20셔츠`)가 열려 있다.
 */
export function normalizeQuery(raw: string | null | undefined): string {
  return (raw ?? "").trim().toLowerCase();
}

/** 주소의 `?q=`가 비었거나 공백뿐인가. 그러면 결과 대신 안내를 그린다 */
export function isBlankQuery(raw: string | null | undefined): boolean {
  return normalizeQuery(raw).length === 0;
}

/** 주소의 `?tab=`을 정리한다. 목록에 없는 값(옛 링크·오타)은 `전체`로 떨어뜨린다 */
export function resolveTab(raw: string | null | undefined): SearchTab {
  return SEARCH_TABS.includes(raw as SearchTab)
    ? (raw as SearchTab)
    : DEFAULT_SEARCH_TAB;
}

function includes(haystack: string, needle: string): boolean {
  return haystack.toLowerCase().includes(needle);
}

/**
 * 상품 매칭 — 품번 · 상품명 · 도매처 이름 세 축. 안내 문구가 약속한 그대로다.
 *
 * **품번이 통째로 같은 것만 `정확 일치`다.** 부분 일치(`SU-1`이 `SU-18`에 걸리는
 * 것)까지 배지를 주면 배지가 아무 말도 하지 않게 된다.
 */
function matchProducts(
  products: readonly SearchProduct[],
  query: string,
): MatchedProduct[] {
  const matched = products
    .filter(
      (p) =>
        includes(p.code, query) ||
        includes(p.name, query) ||
        includes(p.wholesalerName, query),
    )
    .map((p) => ({ ...p, exactCode: p.code.toLowerCase() === query }));

  /* 정확 일치를 맨 위로. 나머지는 원래 순서(= 최신 게시 순)를 그대로 둔다 —
     sort는 안정 정렬이라 같은 값끼리는 자리가 안 바뀐다 */
  return matched.sort((a, b) => Number(b.exactCode) - Number(a.exactCode));
}

/** 도매처는 **이름으로만** 찾는다. 위치로 찾는 화면은 거래처 관리 쪽이다 */
function matchWholesalers(
  wholesalers: readonly SearchWholesaler[],
  query: string,
): SearchWholesaler[] {
  return wholesalers.filter((w) => includes(w.name, query));
}

/**
 * 내 주문은 **주문번호로도** 찾는다. 도매처와 통화하면서 번호를 받아 적고
 * 그대로 치는 경로가 실제 업무에 있다.
 */
function matchOrders(
  orders: readonly SearchOrder[],
  query: string,
): SearchOrder[] {
  return orders.filter(
    (o) =>
      includes(o.productName, query) ||
      includes(o.productCode, query) ||
      includes(o.orderNo, query) ||
      includes(o.wholesalerSummary, query),
  );
}

export function runSearch(
  query: string,
  source: {
    products: readonly SearchProduct[];
    wholesalers: readonly SearchWholesaler[];
    orders: readonly SearchOrder[];
  },
): SearchResult {
  return {
    products: matchProducts(source.products, query),
    wholesalers: matchWholesalers(source.wholesalers, query),
    orders: matchOrders(source.orders, query),
  };
}

/**
 * 탭에 찍히는 숫자. `전체`는 세 축의 합이다.
 *
 * **탭 숫자와 그 탭에서 실제로 그려지는 줄 수가 같다** — 한쪽만 따로 세면
 * `상품 3`이라고 해 놓고 두 줄만 나오는 화면이 된다.
 */
export function tabCounts(result: SearchResult): Record<SearchTab, number> {
  const products = result.products.length;
  const wholesalers = result.wholesalers.length;
  const orders = result.orders.length;

  return {
    all: products + wholesalers + orders,
    products,
    wholesalers,
    orders,
  };
}

/** 이 탭에서 그릴 섹션들. `전체`만 셋을 다 편다 */
export function visibleSections(
  tab: SearchTab,
): readonly Exclude<SearchTab, "all">[] {
  return tab === "all" ? ["products", "wholesalers", "orders"] : [tab];
}

/** 검색어·탭을 담은 주소. 탭이 바뀌어도 검색어는 그대로 실려 간다 */
export function searchHref(query: string, tab: SearchTab): string {
  const params = new URLSearchParams({ q: query });
  if (tab !== DEFAULT_SEARCH_TAB) params.set("tab", tab);

  return `/search?${params.toString()}`;
}

/** 12,500 → `12,500원~`. 검색 줄은 최저가만 보여 준다 */
export function rowPriceLabel(product: SearchProduct): string {
  const amount = `${product.priceMin.toLocaleString("ko-KR")}원`;
  return product.hasRange ? `${amount}~` : amount;
}

/** `무드온 · SU-18 · 컬러 2 · 사이즈 5` */
export function rowMeta(product: SearchProduct): string {
  return `${product.wholesalerName} · ${product.code} · 컬러 ${product.colorCount} · 사이즈 ${product.sizeLabel}`;
}

/** `2026.07.17 · 20260717-1152-0088 · 무드온 외 1곳 · 총 32장 · 417,000원` */
export function orderMeta(order: SearchOrder): string {
  return [
    order.orderedAt.replaceAll("-", "."),
    order.orderNo,
    order.wholesalerSummary,
    `총 ${order.totalSheets}장`,
    `${order.totalAmount.toLocaleString("ko-KR")}원`,
  ].join(" · ");
}
