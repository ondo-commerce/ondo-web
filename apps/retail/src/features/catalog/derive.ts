import {
  COLOR_PALETTE,
  FILTER_ALL,
  PAGE_SIZE,
  PRICE_BANDS,
  SIZES,
  type PaletteColor,
} from "./constants";
import type {
  CatalogFilter,
  CatalogProduct,
  CatalogSort,
  SizeName,
} from "./types";

/**
 * 화면이 읽는 값은 전부 여기서 나온다. **JSX 안에서 계산하지 않는다** —
 * 건수·최저가·정렬은 QA가 눈으로 검증하는 지점이라 한 곳에 모여 있어야
 * "무엇과 무엇이 같아야 하는지"를 말할 수 있다.
 */

/** 12,500 → `12,500원`. 금액 표기가 화면마다 갈리지 않게 여기 한 곳을 쓴다 */
export function formatWon(amount: number): string {
  return `${amount.toLocaleString("ko-KR")}원`;
}

/**
 * 카드에 찍히는 가격. **조합마다 값이 달라서 최솟값 + `~`** 로 적는다.
 * 단일가면 `~`를 붙이지 않는다 — 붙이면 더 비싼 조합이 있다고 잘못 읽힌다.
 */
export function priceLabel(product: CatalogProduct): string {
  return product.priceMax > product.priceMin
    ? `${formatWon(product.priceMin)}~`
    : formatWon(product.priceMin);
}

/** 상품 상세 머리의 큰 가격. `12,500 ~ 13,500` — 단위 `원`은 화면이 따로 붙인다 */
export function priceRangeLabel(product: CatalogProduct): string {
  return product.priceMax > product.priceMin
    ? `${product.priceMin.toLocaleString("ko-KR")} ~ ${product.priceMax.toLocaleString("ko-KR")}`
    : product.priceMin.toLocaleString("ko-KR");
}

/**
 * `컬러 3 · 사이즈 5`.
 *
 * 사이즈가 하나뿐이면 개수 대신 그 이름을 쓴다(`사이즈 Free`) — 확정
 * 와이어프레임이 그렇고, `사이즈 1`은 정보가 없는 말이라 자리만 먹는다.
 */
export function optionSummary(product: CatalogProduct): string {
  const size =
    product.sizes.length === 1 ? product.sizes[0] : product.sizes.length;

  return `컬러 ${product.colors.length} · 사이즈 ${size}`;
}

/** 지금 주문할 수 있는가. 시즌 종료·게시 내림은 링크도 걸지 않는다 */
export function isOrderable(product: CatalogProduct): boolean {
  return product.status === "ON_SALE";
}

/**
 * 카드 좌하단 배지. 한 장에 하나만 붙는다 —
 * 주문할 수 없다는 사실이 구매 이력보다 먼저 읽혀야 한다.
 */
export function cardBadge(product: CatalogProduct): string | null {
  if (product.status === "SEASON_ENDED") return "시즌 종료";
  return product.purchased ? "구매 이력" : null;
}

/** 주소의 값이 목록에 없으면(옛 링크·오타) `전체`로 떨어뜨린다 — 화면이 빈 채로 남지 않게 */
function resolveOne(
  value: string | undefined,
  allowed: readonly string[],
): string {
  return value && allowed.includes(value) ? value : FILTER_ALL;
}

/**
 * 주소 → 필터. **주소가 곧 상태다**(상품 상세를 갔다 와도 좁혀 둔 조건이 남는 이유).
 *
 * 카테고리만 허용 목록을 밖에서 받는다 — 셸 카테고리 바(`shared/config/nav.ts`)와
 * 같은 축이라 목록의 원본이 이 feature 밖에 있다.
 */
export function resolveFilter(
  params: Record<string, string | string[] | undefined>,
  categorySlugs: readonly string[],
): CatalogFilter {
  const one = (key: string) => {
    const raw = params[key];
    return Array.isArray(raw) ? raw[0] : raw;
  };

  return {
    category: resolveOne(one("category"), categorySlugs),
    color: resolveOne(
      one("color"),
      COLOR_PALETTE.flatMap((g) => g.colors.map((c) => c.name)),
    ),
    size: resolveOne(one("size"), SIZES),
    price: resolveOne(
      one("price"),
      PRICE_BANDS.map((b) => b.value),
    ),
  };
}

/** 주소 → 정렬. 이 화면이 못 고르는 값이 실려 오면 첫 번째(기본값)로 떨어뜨린다 */
export function resolveSort(
  params: Record<string, string | string[] | undefined>,
  allowed: readonly CatalogSort[],
): CatalogSort {
  const raw = params.sort;
  const value = Array.isArray(raw) ? raw[0] : raw;
  const fallback = allowed[0] ?? "latest";

  return allowed.includes(value as CatalogSort)
    ? (value as CatalogSort)
    : fallback;
}

/** 네 축이 모두 `전체`인가. `초기화` 버튼을 띄울지, 빈 상태에 무엇을 적을지가 갈린다 */
export function isFilterEmpty(filter: CatalogFilter): boolean {
  return (
    filter.category === FILTER_ALL &&
    filter.color === FILTER_ALL &&
    filter.size === FILTER_ALL &&
    filter.price === FILTER_ALL
  );
}

function matchesPrice(product: CatalogProduct, bandValue: string): boolean {
  const band = PRICE_BANDS.find((b) => b.value === bandValue);
  if (!band) return true;

  /* 상품은 가격이 **범위**다. 구간과 조금이라도 겹치면 걸린다 —
     최저가만 보면 `12,500 ~ 32,000`짜리가 `3만원 이상`에서 사라진다 */
  const overMin = band.max === null || product.priceMin <= band.max;
  return product.priceMax >= band.min && overMin;
}

/** 네 축을 **함께** 건다. 컬러를 좁힌 채로 사이즈를 더 좁힐 수 있어야 한다 */
export function filterProducts(
  products: readonly CatalogProduct[],
  filter: CatalogFilter,
): CatalogProduct[] {
  return products.filter(
    (p) =>
      (filter.category === FILTER_ALL || p.categorySlug === filter.category) &&
      (filter.color === FILTER_ALL || p.colors.includes(filter.color)) &&
      (filter.size === FILTER_ALL ||
        p.sizes.includes(filter.size as SizeName)) &&
      (filter.price === FILTER_ALL || matchesPrice(p, filter.price)),
  );
}

/** 원본 배열을 건드리지 않는다 — fixtures는 모듈 하나를 모든 화면이 같이 읽는다 */
export function sortProducts(
  products: readonly CatalogProduct[],
  sort: CatalogSort,
): CatalogProduct[] {
  const list = [...products];

  switch (sort) {
    case "price-asc":
      return list.sort((a, b) => a.priceMin - b.priceMin);
    case "price-desc":
      return list.sort((a, b) => b.priceMin - a.priceMin);
    case "favorited-desc":
      /* 찜한 적 없는 것은 뒤로 — 찜 목록 밖에서 이 정렬을 쓸 일은 없지만
         빈 값이 앞에 오면 목록이 통째로 뒤집혀 보인다 */
      return list.sort((a, b) =>
        (b.favoritedAt ?? "").localeCompare(a.favoritedAt ?? ""),
      );
    case "latest":
    default:
      return list.sort((a, b) => b.listedAt.localeCompare(a.listedAt));
  }
}

/**
 * 컬러 필터에 세울 색. **지금 이 목록에 실제로 있는 색만** 세운다 —
 * 26종을 다 세우면 고르는 순간 0건이 되는 칸이 대부분이다.
 * 순서·표시명·색값은 팔레트가 정한다(클릭 순서가 아니라 팔레트 순서).
 */
export function availableColors(
  products: readonly CatalogProduct[],
): PaletteColor[] {
  const used = new Set(products.flatMap((p) => p.colors));

  return COLOR_PALETTE.flatMap((g) => g.colors).filter((c) => used.has(c.name));
}

/** 사이즈 필터에 세울 값. 같은 이유로 실제로 있는 것만, 순서는 `SIZES`가 정한다 */
export function availableSizes(
  products: readonly CatalogProduct[],
): SizeName[] {
  const used = new Set(products.flatMap((p) => p.sizes));

  return SIZES.filter((s) => used.has(s));
}

/** 찜 목록의 도매처 칩. 찜한 상품이 없는 도매처가 칩으로 나오지 않게 목록에서 만든다 */
export function availableWholesalers(
  products: readonly CatalogProduct[],
): { id: string; name: string }[] {
  const seen = new Map<string, string>();
  for (const p of products) seen.set(p.wholesalerId, p.wholesalerName);

  return [...seen].map(([id, name]) => ({ id, name }));
}

/**
 * 지금 주소 위에 한 축만 바꾼 주소를 만든다.
 *
 * 기본값(`전체`·기본 정렬)인 축은 **주소에서 빼 버린다** — 그래야 `초기화`가
 * 그냥 기본 경로가 되고, 아무것도 안 고른 화면의 주소가 공유했을 때도 짧다.
 */
export function catalogHref(
  basePath: string,
  current: { filter: CatalogFilter; sort: CatalogSort },
  patch: Partial<CatalogFilter> & { sort?: CatalogSort },
  defaultSort: CatalogSort,
): string {
  const next = { ...current.filter, ...patch };
  const sort = patch.sort ?? current.sort;

  const params = new URLSearchParams();
  for (const key of ["category", "color", "size", "price"] as const) {
    if (next[key] !== FILTER_ALL) params.set(key, next[key]);
  }
  if (sort !== defaultSort) params.set("sort", sort);

  const query = params.toString();
  return query ? `${basePath}?${query}` : basePath;
}

/* ────────────────────────────────────────────────────────────────────────
   `상품 더 보기` — 펼친 정도도 주소가 갖는다.

   화면 안의 `useState`로 두면 카드 하나를 열어 보고 뒤로 왔을 때 다시 8장으로
   접힌다. 19개 중 8개만 첫 화면이라 훑다가 하나 열어 보는 동선에서 매번 겪는다.
   필터·정렬이 이미 주소에 있는 것과 같은 이유다 — 화면을 떠났다 오는 것이
   이 화면의 기본 동선이다.
   ──────────────────────────────────────────────────────────────────────── */

/** 몇 장까지 펼쳤는지. 주소에 실리는 이름 */
export const SHOWN_PARAM = "shown";

/**
 * 주소 → 펼친 장수. 못 읽는 값(`abc`·`-8`·`1e3`·소수)은 **접힌 상태로 떨어뜨린다** —
 * 링크를 손으로 고쳐 넣은 값 때문에 화면이 비거나 통째로 펼쳐지지 않게.
 */
export function resolveShown(raw: string | null): number {
  if (raw === null || !/^\d+$/.test(raw)) return PAGE_SIZE;

  const value = Number(raw);
  return value > PAGE_SIZE ? value : PAGE_SIZE;
}

/**
 * `상품 더 보기`가 갈 주소. **지금 주소 위에 `shown`만 얹는다** —
 * 필터를 바꾸면 `catalogHref`가 이 값을 안 싣기 때문에 펼침이 저절로 접힌다.
 * 좁힌 뒤에도 16장이 펼쳐져 있으면 건수와 카드 수가 어긋나 보인다.
 */
export function moreHref(currentHref: string, shown: number): string {
  const [path, query] = currentHref.split("?");
  const params = new URLSearchParams(query);
  params.set(SHOWN_PARAM, String(shown));

  return `${path}?${params.toString()}`;
}
