import type { SearchParams } from "@ondo/api";
import {
  ALL_AXES,
  FILTER_ALL,
  LIST_PARAM,
  MAX_PAGE_SIZE,
  PAGE_SIZE,
  PRICE_BANDS,
} from "./constants";
import type {
  CatalogFilter,
  FilterAxes,
  CatalogOptions,
  CatalogPaging,
  CatalogProduct,
  CatalogSort,
  CategoryWire,
  FilterOptionsWire,
  ListingDetailWire,
  ListingSummaryWire,
  Wholesaler,
} from "./types";

/**
 * 화면이 읽는 값은 전부 여기서 나온다. **JSX 안에서 계산하지 않는다** —
 * 건수·최저가는 QA가 눈으로 검증하는 지점이라 한 곳에 모여 있어야
 * "무엇과 무엇이 같아야 하는지"를 말할 수 있다.
 */

/* ────────────────────────────────────────────────────────────────────────
   wire → 뷰. 화면은 wire 모양을 모른다.
   ──────────────────────────────────────────────────────────────────────── */

/**
 * 목록 카드 한 장. `thumbnailUrl`은 생성 타입상 non-optional이지만 소매 스펙이
 * `nullable`을 안 적어서(README) 사진 없는 게시글이 null로 올 수 있다 — 여기서
 * 빈 문자열로 좁히고 카드는 비어 있으면 회색 슬롯을 그린다.
 */
export function toCatalogProduct(wire: ListingSummaryWire): CatalogProduct {
  return {
    id: String(wire.listingId),
    name: wire.title,
    wholesalerId: String(wire.wholesaler.id),
    wholesalerName: wire.wholesaler.name,
    thumbnailUrl: wire.thumbnailUrl ?? "",
    colorCount: wire.colorCount,
    sizeCount: wire.sizeCount,
    priceMin: wire.minSalePrice,
    isSinglePieceAllowed: wire.isSinglePieceAllowed,
  };
}

/**
 * 상세 응답으로 만든 카드. **찜 목록만 쓴다** — 그 화면은 목록 API를 못 부르고
 * (찜 집합이 브라우저에만 있다) 상세를 하나씩 받는다. 가짓수는 게시된 옵션에서
 * 다시 센다: 색상은 `colorOptions` 수, 사이즈는 겹치지 않는 `size` 수.
 * 대표 이미지는 `images[0]` — 서버가 `sortOrder` 순으로 정렬해 준다(스펙).
 */
export function toCatalogProductFromDetail(
  wire: ListingDetailWire,
): CatalogProduct {
  const sizes = new Set(
    wire.colorOptions.flatMap((c) => c.variants.map((v) => v.size)),
  );

  return {
    id: String(wire.listingId),
    name: wire.title,
    wholesalerId: String(wire.wholesaler.id),
    wholesalerName: wire.wholesaler.name,
    thumbnailUrl: wire.images[0]?.url ?? "",
    colorCount: wire.colorOptions.length,
    sizeCount: sizes.size,
    priceMin: wire.minSalePrice,
    isSinglePieceAllowed: wire.isSinglePieceAllowed,
  };
}

/**
 * 카테고리 바·필터가 세울 선택지. **카테고리는 최상위 한 단만이다** — 스펙의
 * `CategoryResponse`는 설명("3단 트리")과 달리 `id`·`name`뿐이고 `children`이
 * 없다. 스냅샷에 없는 필드는 없는 것이라(ADR-0002) 하위 단은 안 그린다
 * (`04-wire.md` §3). 컬러는 그룹을 펼치되 순서는 서버가 준 대로 둔다.
 */
export function toCatalogOptions(
  categories: readonly CategoryWire[],
  filterOptions: FilterOptionsWire | null,
): CatalogOptions {
  return {
    categories: categories.map((c) => ({ id: c.id, name: c.name })),
    colors:
      filterOptions?.colorGroups.flatMap((group) =>
        group.colors.map((color) => ({
          id: color.id,
          name: color.name,
          hex: color.hex,
          groupName: group.name,
        })),
      ) ?? [],
    sizes: filterOptions?.sizes ?? [],
  };
}

/* ────────────────────────────────────────────────────────────────────────
   카드 표기
   ──────────────────────────────────────────────────────────────────────── */

/** 12,500 → `12,500원`. 금액 표기가 화면마다 갈리지 않게 여기 한 곳을 쓴다 */
export function formatWon(amount: number): string {
  return `${amount.toLocaleString("ko-KR")}원`;
}

/**
 * 카드에 찍히는 가격. **늘 최저가 + `~`다** — 목록 응답은 `minSalePrice`만 주고
 * 스펙이 그 값을 "카드에 `12,500원~`으로 그린다"고 적었다. 단일가인지는 상세에
 * 가야 안다.
 */
export function priceLabel(product: CatalogProduct): string {
  return `${formatWon(product.priceMin)}~`;
}

/**
 * `컬러 3 · 사이즈 5`. 목록 응답은 가짓수만 주므로 사이즈가 하나뿐이어도 이름
 * (`사이즈 Free`)을 못 쓴다 — 이름은 상세에만 있다.
 */
export function optionSummary(product: CatalogProduct): string {
  return `컬러 ${product.colorCount} · 사이즈 ${product.sizeCount}`;
}

/* ────────────────────────────────────────────────────────────────────────
   주소 ↔ 필터 ↔ 서버 파라미터. **주소가 곧 상태다**(상품 상세를 갔다 와도
   좁혀 둔 조건이 남는 이유). 걸러 내는 것은 서버다 — 화면은 받은 것을 그린다.
   ──────────────────────────────────────────────────────────────────────── */

function one(
  params: Record<string, string | string[] | undefined>,
  key: string,
): string | undefined {
  const raw = params[key];
  return Array.isArray(raw) ? raw[0] : raw;
}

/** 주소의 값이 목록에 없으면(옛 링크·오타) `전체`로 떨어뜨린다 — 화면이 빈 채로 남지 않게 */
function resolveOne(
  value: string | undefined,
  allowed: readonly string[],
): string {
  return value && allowed.includes(value) ? value : FILTER_ALL;
}

/**
 * 주소 → 필터. 허용 목록이 서버 값(`options`)이라 카테고리·컬러 id가 사라지면
 * 그 축은 저절로 `전체`가 된다.
 *
 * `axes`가 `false`인 축은 **주소를 읽지도 않는다.** 도매처 홈처럼 드롭다운을
 * 감춘 축이 주소로만 걸리면 목록은 줄고 `초기화`는 켜지는데 무엇이 걸렸는지
 * 화면에 아무 표시가 없다(#181). 드롭다운이 없으면 걸릴 길도 없어야 한다.
 */
export function resolveFilter(
  params: Record<string, string | string[] | undefined>,
  options: CatalogOptions,
  axes: FilterAxes = ALL_AXES,
): CatalogFilter {
  const read = (key: keyof CatalogFilter, allowed: readonly string[]) =>
    axes[key] ? resolveOne(one(params, LIST_PARAM[key]), allowed) : FILTER_ALL;

  return {
    category: read(
      "category",
      options.categories.map((c) => String(c.id)),
    ),
    color: read(
      "color",
      options.colors.map((c) => String(c.id)),
    ),
    size: read("size", options.sizes),
    price: read(
      "price",
      PRICE_BANDS.map((b) => b.value),
    ),
  };
}

/**
 * 필터 → `GET /listings` 파라미터. 이름은 스냅샷의 `parameters` 그대로다
 * (`categoryId` · `colorIds` · `sizes` · `priceFrom` · `priceTo` · `page` · `size`).
 * 화면은 축마다 하나만 고르므로 배열 파라미터에도 값 하나만 실린다.
 *
 * 주소의 페이지는 1부터, API의 페이지는 0부터 시작한다.
 */
export function toListingParams(
  filter: CatalogFilter,
  page: number,
  size = PAGE_SIZE,
): SearchParams {
  const band = PRICE_BANDS.find((b) => b.value === filter.price);

  return {
    categoryId:
      filter.category === FILTER_ALL ? undefined : Number(filter.category),
    colorIds: filter.color === FILTER_ALL ? undefined : Number(filter.color),
    sizes: filter.size === FILTER_ALL ? undefined : filter.size,
    priceFrom: band?.min,
    priceTo: band?.max ?? undefined,
    page: page - 1,
    size,
  };
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

/**
 * 지금 주소 위에 한 축만 바꾼 주소를 만든다.
 *
 * 기본값(`전체`)인 축은 **주소에서 빼 버린다** — 그래야 `초기화`가 그냥 기본
 * 경로가 된다. 필터가 달라질 때는 첫 페이지부터 보여 준다.
 */
export function catalogHref(
  basePath: string,
  current: CatalogFilter,
  patch: Partial<CatalogFilter>,
  page = 1,
): string {
  const next = { ...current, ...patch };
  const params = new URLSearchParams();
  for (const key of ["category", "color", "size", "price"] as const) {
    if (next[key] !== FILTER_ALL) params.set(LIST_PARAM[key], next[key]);
  }

  if (page > 1) params.set(LIST_PARAM.page, String(page));

  const query = params.toString();
  return query ? `${basePath}?${query}` : basePath;
}

/** 예전 공유 링크는 마지막으로 펼쳤던 상품이 있는 페이지로 연결한다. */
export function resolveCatalogPage(
  params: Record<string, string | string[] | undefined>,
): number {
  const raw = one(params, LIST_PARAM.page);
  if (raw === undefined) {
    const shown = one(params, "shown");
    return shown && /^\d+$/.test(shown)
      ? Math.max(
          1,
          Math.ceil(Math.min(Number(shown), MAX_PAGE_SIZE) / PAGE_SIZE),
        )
      : 1;
  }

  const page = Number(raw);
  // API가 받는 page는 int32다. 음수, 지수 표기, 범위 밖 숫자는 첫 페이지로 돌린다.
  return /^\d+$/.test(raw) && page >= 1 && page <= 2_147_483_647 ? page : 1;
}

export function toCatalogPaging(page: number, total: number): CatalogPaging {
  const totalPages = Math.ceil(total / PAGE_SIZE);
  return { page: Math.min(page, Math.max(1, totalPages)), totalPages, total };
}

/** 좁은 화면에서도 한 줄로 이동하도록 현재 페이지 근처의 번호 다섯 개를 제공한다. */
export function catalogPageNumbers({
  page,
  totalPages,
}: CatalogPaging): number[] {
  const count = Math.min(5, totalPages);
  const first = Math.max(1, Math.min(page - 2, totalPages - count + 1));
  return Array.from({ length: count }, (_, index) => first + index);
}

/* ────────────────────────────────────────────────────────────────────────
   도매처 홈
   ──────────────────────────────────────────────────────────────────────── */

/**
 * 받은 목록에서 이 도매처 것만. **서버가 도매처로 못 거른다** — `GET /listings`에
 * `wholesalerId` 파라미터가 없고 도매처를 id로 찾는 path도 없다(`04-wire.md` §3).
 * 그래서 도매처 홈은 마켓의 각 장을 받을 때마다 도매처 id를 대조한다.
 */
export function productsOfWholesaler(
  products: readonly CatalogProduct[],
  wholesalerId: string,
): CatalogProduct[] {
  return products.filter((p) => p.wholesalerId === wholesalerId);
}

/**
 * 도매처 홈 머리. 상호는 그 도매처 게시글의 `wholesaler.name`에서 온다 —
 * 게시글이 하나도 없으면 상호를 알 길이 없어 null이고 화면은 `notFound()`로 간다.
 * 필터 조회가 0건이면 호출부가 필터를 해제하고 첫 일치 상품으로 상호를 확인한다.
 */
export function wholesalerOf(
  products: readonly CatalogProduct[],
  wholesalerId: string,
): Wholesaler | null {
  const first = products.find((p) => p.wholesalerId === wholesalerId);
  if (!first) return null;

  return {
    id: wholesalerId,
    name: first.wholesalerName,
    initial: first.wholesalerName.slice(0, 1),
  };
}

/* ────────────────────────────────────────────────────────────────────────
   찜 목록
   ──────────────────────────────────────────────────────────────────────── */

/** 찜 집합(문자열 id) → 상세를 부를 숫자 id. 못 읽는 값(옛 세션의 `p-…`)은 버린다 */
export function favoriteListingIds(favorites: ReadonlySet<string>): number[] {
  return [...favorites].filter((id) => /^\d+$/.test(id)).map(Number);
}

/** 주소 → 정렬. 이 화면이 못 고르는 값이 실려 오면 첫 번째(기본값)로 떨어뜨린다 */
export function resolveSort(
  params: Record<string, string | string[] | undefined>,
  allowed: readonly CatalogSort[],
): CatalogSort {
  const value = one(params, LIST_PARAM.sort);
  const fallback = allowed[0] ?? "favorited-desc";

  return allowed.includes(value as CatalogSort)
    ? (value as CatalogSort)
    : fallback;
}

/** 주소의 `?seller=`. 목록에 없는 도매처인지는 화면이 찜 집합을 받은 뒤 다시 본다 */
export function resolveSeller(
  params: Record<string, string | string[] | undefined>,
): string {
  return one(params, LIST_PARAM.seller) ?? FILTER_ALL;
}

/** 찜 목록의 도매처 칩. 찜한 상품이 없는 도매처가 칩으로 나오지 않게 목록에서 만든다 */
export function availableWholesalers(
  products: readonly CatalogProduct[],
): { id: string; name: string }[] {
  const seen = new Map<string, string>();
  for (const p of products) seen.set(p.wholesalerId, p.wholesalerName);

  return [...seen].map(([id, name]) => ({ id, name }));
}

/** 도매처 칩으로 좁힌다. `전체`면 그대로 */
export function filterBySeller(
  products: readonly CatalogProduct[],
  seller: string,
): CatalogProduct[] {
  return seller === FILTER_ALL
    ? [...products]
    : products.filter((p) => p.wholesalerId === seller);
}

/**
 * 찜 목록 정렬. `최근 찜한 순`은 **찜 집합의 삽입 순서를 뒤집은 것**이다 —
 * 서버에 찜이 없어 시각이 없고, `Set`이 넣은 순서를 지키므로 그것이 곧 시각이다.
 * 원본 배열은 건드리지 않는다.
 */
export function sortWishlist(
  products: readonly CatalogProduct[],
  favoriteOrder: readonly string[],
  sort: CatalogSort,
): CatalogProduct[] {
  const list = [...products];

  switch (sort) {
    case "price-asc":
      return list.sort((a, b) => a.priceMin - b.priceMin);
    case "price-desc":
      return list.sort((a, b) => b.priceMin - a.priceMin);
    case "favorited-desc":
    default: {
      const rank = new Map(favoriteOrder.map((id, i) => [id, i]));
      return list.sort(
        (a, b) => (rank.get(b.id) ?? -1) - (rank.get(a.id) ?? -1),
      );
    }
  }
}

/** 찜 목록의 주소. 기본값인 축은 빼서 `초기 상태 = 그냥 /wishlist`가 되게 한다 */
export function wishlistHref(
  seller: string,
  sort: CatalogSort,
  defaultSort: CatalogSort,
): string {
  const params = new URLSearchParams();
  if (seller !== FILTER_ALL) params.set(LIST_PARAM.seller, seller);
  if (sort !== defaultSort) params.set(LIST_PARAM.sort, sort);

  const query = params.toString();
  return query ? `/wishlist?${query}` : "/wishlist";
}

/**
 * 미결제 잔액의 표시. **음수에 `-` 부호를 쓰지 않는다.**
 *
 * 잔액이 음수면 더 보낸 돈이 남아 있다는 뜻이고, 그건 `-30,000원`이 아니라
 * `선수금 30,000원`이다(§3-0 E). `features/settlement/derive.ts`의 `formatBalance`와
 * 같은 규칙이다 — feature끼리 직접 import하지 않으므로 이 중복이 정답이고
 * (`CLAUDE.md`), 규칙이 바뀌면 두 곳을 같이 고친다.
 */
export function formatUnpaid(amount: number): string {
  return amount < 0
    ? `선수금 ${formatWon(Math.abs(amount))}`
    : formatWon(amount);
}
