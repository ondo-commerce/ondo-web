import { http, HttpResponse } from "msw";
import type { WholesaleSchema } from "../../wholesale";

/**
 * 상품 목 — BE `V900__seed_dev.sql`(MUL-110, dev 배포 시드)의 `product`·`color_option`·`variant`·
 * `listing`·`listing_variant`·`listing_image` 행을 그대로 옮겼다.
 *
 * 상품 API는 실구현(#156)이라 `ProductStubExamples.java`가 더는 없다. 예전 목은 그 스텁의
 * 상품 1건·SKU 1개였는데, 재고 탭(#193)은 색상 그룹·사이즈 필터·SKU별 입고를 봐야 해서
 * 시드 6건·SKU 20개로 바꿨다. 주문·미송 목(`./order`·`./backorder`)과 같은 시드다.
 * **값을 지어내지 않는다** — id·품번·상품명·카테고리·색상·사이즈·재고·판매가·주문제한·게시글 전부 시드다.
 *
 * 시드와 다른 것, 머리에 적는다:
 *  1. 시드 상품은 도매처 3곳(101·102·103) 것이다. 소유를 안 가리고 6건을 다 내린다 —
 *     한 도매처(101)만 보면 상품이 둘뿐이라 목록·필터를 볼 수 없다. 그래서 품번 `1`·`2`가 셋씩이다.
 *  2. `avg_cost`(평균원가)는 시드에 없다. 0으로 시작하고 입고(`./inventory`)가 이동평균으로 올린다.
 *  3. `allocatedQty`(주문처리중)는 시드 `order_item.allocated_qty − shipped_qty`라 전부 0이다.
 *     `backorderQty`는 OPEN 미송 합(3003: 13 · 3011: 1 · 3019: 2). `availableQty = 재고 − 주문처리중 − 미송`
 *     — 3003은 음수(-13)다. 서버가 음수를 0으로 감추는지는 미확인(§7 Q4는 감추지 않는다).
 *  4. 시드의 시각은 `now() - interval`이라 절대값이 없다. 기준일 2026-09-07(KST)로 박았다.
 *  5. 주문·미송 목과 **재고 상태를 공유하지 않는다** — 여기서 입고해도 미송 탭의 가용재고는 안 바뀐다.
 *
 * 재고 수량은 **상태**다 — `./inventory`가 입고·조정으로 `stockQty`·`avgCost`를 바꾼다.
 * 새로고침하면 시드로 돌아간다.
 */

type Size = WholesaleSchema<"VariantResponse">["size"];
type ListingStatus = WholesaleSchema<"ListingResponse">["status"];

/** 기준일. 시드의 `now()`를 이 날로 고정했다(주문·미송 목과 같다) */
const TODAY_MS = Date.parse("2026-09-07T09:00:00+09:00");
const DAY_MS = 86_400_000;

function daysAgo(days: number): string {
  return new Date(TODAY_MS - days * DAY_MS).toISOString();
}

/* --- 마스터 (V5 시드) --------------------------------------------------- */

/**
 * 카테고리·색상 마스터 — BE `V5__category_color_seed.sql`(2026-09-03 팀 확정본)을 그대로 옮겼다.
 *
 * `CategoryController`·`ColorController`는 실구현이라 `*StubExamples.java`가 없다. 스펙 자동
 * 조립(뼈대)은 노드 1개·문자열 "name"이라 셀렉트가 비어 보여서, 시드 값을 옮긴다.
 * 카테고리 id 규칙(시드 주석): 자식 = 부모×10 + 순번. 상품은 depth 3 리프에만 단다.
 */
function node(
  id: number,
  name: string,
  depth: number,
  children: WholesaleSchema<"CategoryNodeResponse">[] = [],
): WholesaleSchema<"CategoryNodeResponse"> {
  return { id, name, depth, children };
}

function leaves(
  parent: number,
  names: readonly string[],
): WholesaleSchema<"CategoryNodeResponse">[] {
  return names.map((name, i) => node(parent * 10 + i + 1, name, 3));
}

export const CATEGORIES: WholesaleSchema<"CategoryNodeResponse">[] = [
  node(1, "여성", 1, [
    node(
      11,
      "아우터",
      2,
      leaves(11, ["코트", "재킷", "데님", "패딩", "점퍼", "가디건/베스트"]),
    ),
    node(12, "상의", 2, leaves(12, ["티셔츠", "맨투맨", "후드", "나시"])),
    node(13, "블라우스/셔츠", 2, leaves(13, ["블라우스", "셔츠"])),
    node(14, "원피스", 2, leaves(14, ["미니", "롱", "점프수트", "투피스"])),
    node(
      15,
      "니트",
      2,
      leaves(15, [
        "니트 티",
        "니트 가디건",
        "니트 베스트",
        "니트 원피스",
        "니트 후드티",
        "니트 스커트",
        "니트 바지",
      ]),
    ),
    node(
      16,
      "팬츠",
      2,
      leaves(16, ["캐주얼", "데님", "슬랙스", "레깅스", "트레이닝"]),
    ),
    node(17, "스커트", 2, leaves(17, ["미니", "롱", "팬츠스커트"])),
    node(
      18,
      "홈/언더웨어",
      2,
      leaves(18, ["홈 웨어", "캐미솔/슬립", "언더웨어"]),
    ),
  ]),
  node(2, "남성", 1, [
    node(
      21,
      "아우터",
      2,
      leaves(21, ["코트", "재킷", "데님", "패딩", "점퍼", "가디건/베스트"]),
    ),
    node(
      22,
      "상의",
      2,
      leaves(22, ["티셔츠", "셔츠/남방", "맨투맨", "후드", "나시"]),
    ),
    node(
      23,
      "니트",
      2,
      leaves(23, [
        "니트 티",
        "니트 가디건",
        "니트 베스트",
        "니트 후드티",
        "니트 바지",
      ]),
    ),
    node(24, "팬츠", 2, leaves(24, ["캐주얼", "데님", "슬랙스", "트레이닝"])),
    node(25, "홈/언더웨어", 2, leaves(25, ["홈 웨어", "언더웨어"])),
  ]),
];

function colorGroup(
  id: number,
  name: string,
  colors: readonly [id: number, name: string, hex: string][],
): WholesaleSchema<"ColorGroupResponse"> {
  return {
    id,
    name,
    colors: colors.map(([cid, cname, hex]) => ({ id: cid, name: cname, hex })),
  };
}

export const COLOR_GROUPS: WholesaleSchema<"ColorGroupResponse">[] = [
  colorGroup(1, "무채색", [
    [1, "블랙", "#191F28"],
    [2, "차콜", "#4E5968"],
    [3, "그레이", "#B0B8C1"],
    [4, "화이트", "#FFFFFF"],
    [5, "아이보리", "#F2ECE0"],
    [6, "크림", "#F7E9C9"],
  ]),
  colorGroup(2, "베이지·브라운", [
    [7, "베이지", "#E3D5BF"],
    [8, "카멜", "#C08A4E"],
    [9, "브라운", "#6B4A2F"],
    [10, "카키", "#7A7A52"],
  ]),
  colorGroup(3, "블루", [
    [11, "네이비", "#1F3A68"],
    [12, "블루", "#2B5FD9"],
    [13, "소라", "#8FBCE6"],
  ]),
  colorGroup(4, "데님 워싱", [
    [14, "연청", "#A9C7E0"],
    [15, "중청", "#5B86B3"],
    [16, "진청", "#2F4A6B"],
  ]),
  colorGroup(5, "컬러", [
    [17, "레드", "#D0393F"],
    [18, "버건디", "#6E1F2E"],
    [19, "핑크", "#F0A8BD"],
    [20, "오렌지", "#EF7A2A"],
    [21, "옐로우", "#F2C744"],
    [22, "그린", "#3F7D44"],
    [23, "민트", "#7FD8C1"],
    [24, "퍼플", "#7C5CFF"],
  ]),
  colorGroup(6, "특수", [
    [25, "골드", "#C9A227"],
    [26, "실버", "#C4C9CE"],
  ]),
];

/** 리프 id → 대>중>소 경로. 서버가 리프까지의 경로를 순서대로 준다 */
function categoryPath(leafId: number): WholesaleSchema<"CategoryPathItem">[] {
  const walk = (
    nodes: readonly WholesaleSchema<"CategoryNodeResponse">[],
    trail: WholesaleSchema<"CategoryPathItem">[],
  ): WholesaleSchema<"CategoryPathItem">[] | null => {
    for (const n of nodes) {
      const next = [...trail, { id: n.id, name: n.name }];
      if (n.id === leafId) return next;
      const found = walk(n.children ?? [], next);
      if (found) return found;
    }
    return null;
  };
  return walk(CATEGORIES, []) ?? [];
}

function colorOf(colorId: number): WholesaleSchema<"ColorResponse"> {
  for (const group of COLOR_GROUPS) {
    const hit = (group.colors ?? []).find((c) => c.id === colorId);
    if (hit) return { ...hit, groupName: group.name };
  }
  // 시드에 없는 색 — 등록 요청이 모르는 id를 보냈을 때. 서버는 400인데 목은 이름만 비운다
  return {
    id: colorId,
    name: `색상 ${colorId}`,
    hex: "#FFFFFF",
    groupName: "",
  };
}

/* --- 시드 (V900) -------------------------------------------------------- */

interface MockProduct {
  id: number;
  wholesalerId: number;
  productNumber: number;
  name: string;
  categoryId: number;
  /** `created_at`. 목록 기본 정렬(`createdAt,desc`)의 기준 */
  createdAt: string;
}

/** `wholesale.variant` + `color_option` + `listing_variant`. 수량·원가는 상태다 */
export interface MockVariant {
  id: number;
  productId: number;
  colorId: number;
  variantNumber: number;
  size: Size;
  stockQty: number;
  /** 주문처리중. 시드 `allocated_qty − shipped_qty` */
  allocatedQty: number;
  /** 미송대기. 시드 OPEN 미송의 합 */
  backorderQty: number;
  /** 평균원가. 시드에 없어 0에서 시작 — 입고가 이동평균으로 올린다 */
  avgCost: number;
  salePrice: number;
  orderLimit: number;
}

interface MockListing {
  id: number;
  productId: number;
  title: string;
  description: string;
  isSinglePieceAllowed: boolean;
  status: ListingStatus;
  seasonStartedAt: string;
  seasonEndedAt: string | null;
  images: WholesaleSchema<"ListingImageResponse">[];
}

function seedProducts(): MockProduct[] {
  // 시드 INSERT 순서 = 등록 순서. 목록은 그 역순이다
  return [
    {
      id: 1001,
      wholesalerId: 101,
      productNumber: 1,
      name: "빈티지 플라워 셔츠",
      categoryId: 132,
      createdAt: daysAgo(10),
    },
    {
      id: 1002,
      wholesalerId: 101,
      productNumber: 2,
      name: "루즈핏 니트 가디건",
      categoryId: 152,
      createdAt: daysAgo(8),
    },
    {
      id: 1003,
      wholesalerId: 102,
      productNumber: 1,
      name: "와이드 데님 팬츠",
      categoryId: 162,
      createdAt: daysAgo(6),
    },
    {
      id: 1004,
      wholesalerId: 102,
      productNumber: 2,
      name: "코튼 반팔 티셔츠",
      categoryId: 121,
      createdAt: daysAgo(4),
    },
    {
      id: 1005,
      wholesalerId: 103,
      productNumber: 1,
      name: "린넨 셋업 자켓",
      categoryId: 112,
      createdAt: daysAgo(2),
    },
    {
      id: 1006,
      wholesalerId: 103,
      productNumber: 2,
      name: "시즌 종료 원피스",
      categoryId: 142,
      createdAt: daysAgo(90),
    },
  ];
}

function variant(
  id: number,
  productId: number,
  colorId: number,
  size: Size,
  variantNumber: number,
  stockQty: number,
  salePrice: number,
  orderLimit: number,
  backorderQty = 0,
): MockVariant {
  return {
    id,
    productId,
    colorId,
    variantNumber,
    size,
    stockQty,
    allocatedQty: 0,
    backorderQty,
    avgCost: 0,
    salePrice,
    orderLimit,
  };
}

function seedVariants(): MockVariant[] {
  return [
    // 1001 빈티지 플라워 셔츠 · 레드(17) 3 + 네이비(11) 2
    variant(3001, 1001, 17, "S", 1, 40, 12500, 500),
    variant(3002, 1001, 17, "M", 2, 35, 12500, 500),
    // 재고 0 + OPEN 미송 4(9001) + 9(9005). 판매가능이 음수로 떨어지는 표본
    variant(3003, 1001, 17, "L", 3, 0, 13500, 0, 13),
    variant(3004, 1001, 11, "S", 4, 20, 12500, 500),
    variant(3005, 1001, 11, "M", 5, 18, 12500, 500),
    // 1002 루즈핏 니트 가디건 · 낱장 상품이라 FREE만
    variant(3006, 1002, 1, "FREE", 1, 12, 23000, 0),
    variant(3007, 1002, 7, "FREE", 2, 8, 23000, 0),
    // 1003 와이드 데님 팬츠
    variant(3008, 1003, 11, "S", 1, 15, 31000, 0),
    variant(3009, 1003, 11, "M", 2, 22, 31000, 0),
    variant(3010, 1003, 11, "L", 3, 9, 31000, 0),
    variant(3011, 1003, 13, "M", 4, 6, 31000, 0, 1),
    // 1004 코튼 반팔 티셔츠 · 사이즈가 제일 많다
    variant(3012, 1004, 4, "S", 1, 50, 8900, 0),
    variant(3013, 1004, 4, "M", 2, 60, 8900, 0),
    variant(3014, 1004, 4, "L", 3, 45, 8900, 0),
    variant(3015, 1004, 4, "XL", 4, 10, 9900, 0),
    variant(3016, 1004, 1, "M", 5, 30, 8900, 0),
    variant(3017, 1004, 1, "L", 6, 25, 8900, 0),
    // 1005 린넨 셋업 자켓
    variant(3018, 1005, 7, "M", 1, 7, 45000, 20),
    variant(3019, 1005, 7, "L", 2, 4, 45000, 20, 2),
    // 1006 시즌 종료 원피스
    variant(3020, 1006, 1, "M", 1, 3, 19000, 0),
  ];
}

function image(
  id: number,
  listingId: number,
  sortOrder: number,
): WholesaleSchema<"ListingImageResponse"> {
  return {
    id,
    url: `https://cdn.ondo.test/listings/${listingId}/${sortOrder + 1}.jpg`,
    sortOrder,
  };
}

function seedListings(): MockListing[] {
  return [
    {
      id: 2001,
      productId: 1001,
      title: "빈티지 플라워 셔츠",
      description: "봄 신상. 부드러운 레이온 혼방.",
      isSinglePieceAllowed: false,
      status: "ON_SALE",
      seasonStartedAt: daysAgo(10),
      seasonEndedAt: null,
      images: [image(5001, 2001, 0), image(5002, 2001, 1)],
    },
    {
      id: 2002,
      productId: 1002,
      title: "루즈핏 니트 가디건",
      description: "오버핏. 낱장 구매 가능.",
      isSinglePieceAllowed: true,
      status: "ON_SALE",
      seasonStartedAt: daysAgo(8),
      seasonEndedAt: null,
      images: [image(5003, 2002, 0)],
    },
    {
      id: 2003,
      productId: 1003,
      title: "와이드 데님 팬츠",
      description: "워싱 데님. 밑단 마감 처리.",
      isSinglePieceAllowed: false,
      status: "ON_SALE",
      seasonStartedAt: daysAgo(6),
      seasonEndedAt: null,
      images: [image(5004, 2003, 0), image(5005, 2003, 1)],
    },
    {
      id: 2004,
      productId: 1004,
      title: "코튼 반팔 티셔츠",
      description: "20수 코튼. 낱장 구매 가능.",
      isSinglePieceAllowed: true,
      status: "ON_SALE",
      seasonStartedAt: daysAgo(4),
      seasonEndedAt: null,
      images: [image(5006, 2004, 0)],
    },
    {
      id: 2005,
      productId: 1005,
      title: "린넨 셋업 자켓",
      description: "린넨 혼방 셋업. 팬츠 별도.",
      isSinglePieceAllowed: false,
      status: "ON_SALE",
      seasonStartedAt: daysAgo(2),
      seasonEndedAt: null,
      images: [image(5007, 2005, 0)],
    },
    // 2006만 SEASON_ENDED. 시즌 종료 배지·잠긴 폼을 보는 표본
    {
      id: 2006,
      productId: 1006,
      title: "시즌 종료 원피스",
      description: "지난 시즌 상품.",
      isSinglePieceAllowed: false,
      status: "SEASON_ENDED",
      seasonStartedAt: daysAgo(90),
      seasonEndedAt: daysAgo(30),
      images: [image(5008, 2006, 0)],
    },
  ];
}

/* --- 상태 --------------------------------------------------------------- */

let products = seedProducts();
let variants = seedVariants();
let listings = seedListings();
let nextProductId = 1007;
let nextVariantId = 3021;
let nextListingId = 2007;

/** 재고 목(`./inventory`)이 입고·조정으로 수량을 바꿀 때 쓴다. 없으면 null */
export function findMockVariant(variantId: number): MockVariant | null {
  return variants.find((v) => v.id === variantId) ?? null;
}

export function findMockProduct(productId: number) {
  return products.find((p) => p.id === productId) ?? null;
}

/* --- 응답 조립 ------------------------------------------------------------ */

/** 스펙 enum 순서. 서버가 variant를 사이즈 순으로 정렬해 준다 */
const SIZE_ORDER: readonly Size[] = ["XS", "S", "M", "L", "XL", "2XL", "FREE"];

/**
 * `hasListing`이 false면 판매가·주문 제한을 **null**로 준다 — dev 서버가 게시글 없는 상품
 * (예: 1013)의 variant를 그렇게 내린다. 스펙엔 nullable이 없어 캐스팅한다(#156 §3-9).
 */
function variantResponse(
  v: MockVariant,
  hasListing: boolean,
): WholesaleSchema<"VariantResponse"> {
  return {
    id: v.id,
    variantNumber: v.variantNumber,
    size: v.size,
    stockQty: v.stockQty,
    allocatedQty: v.allocatedQty,
    backorderQty: v.backorderQty,
    // 판매가능 = 현재고 − 주문처리중 − 미송대기. 음수를 감추지 않는다(glossary §7 Q4 — 서버 동작은 미확인)
    availableQty: v.stockQty - v.allocatedQty - v.backorderQty,
    avgCost: v.avgCost,
    salePrice: hasListing ? v.salePrice : (null as unknown as number),
    orderLimit: hasListing ? v.orderLimit : (null as unknown as number),
  };
}

/** 스펙에 nullable이 없어 타입은 string이지만 진행 중이면 null이다 */
function nullable(value: string | null): string {
  return value as unknown as string;
}

function listingResponse(l: MockListing): WholesaleSchema<"ListingResponse"> {
  return {
    id: l.id,
    status: l.status,
    title: l.title,
    description: l.description,
    isSinglePieceAllowed: l.isSinglePieceAllowed,
    seasonStartedAt: l.seasonStartedAt,
    seasonEndedAt: nullable(l.seasonEndedAt),
    images: [...l.images].sort((a, b) => a.sortOrder - b.sortOrder),
  };
}

/** 색상은 그룹 → 색상 순(= 마스터 id 순), variant는 사이즈 순 — 스펙: "정렬은 서버 보장" */
export function productDetail(
  productId: number,
): WholesaleSchema<"ProductDetailResponse"> | null {
  const p = findMockProduct(productId);
  if (!p) return null;
  const own = variants.filter((v) => v.productId === p.id);
  const colorIds = [...new Set(own.map((v) => v.colorId))].sort(
    (a, b) => a - b,
  );
  const listing = listings.find((l) => l.productId === p.id) ?? null;
  return {
    id: p.id,
    productNumber: p.productNumber,
    name: p.name,
    categoryPath: categoryPath(p.categoryId),
    colorOptions: colorIds.map((colorId) => ({
      color: colorOf(colorId),
      variants: own
        .filter((v) => v.colorId === colorId)
        .sort((a, b) => SIZE_ORDER.indexOf(a.size) - SIZE_ORDER.indexOf(b.size))
        .map((v) => variantResponse(v, listing !== null)),
    })),
    // 게시글 없음 = null. 스펙엔 nullable이 없어 타입은 객체다
    listing: (listing
      ? listingResponse(listing)
      : null) as unknown as WholesaleSchema<"ListingResponse">,
  };
}

function summaryResponse(
  p: MockProduct,
): WholesaleSchema<"ProductSummaryResponse"> {
  const own = variants.filter((v) => v.productId === p.id);
  const listing = listings.find((l) => l.productId === p.id) ?? null;
  return {
    id: p.id,
    productNumber: p.productNumber,
    name: p.name,
    categoryPath: categoryPath(p.categoryId),
    listingStatus: (listing?.status ??
      null) as unknown as WholesaleSchema<"ProductSummaryResponse">["listingStatus"],
    colorCount: new Set(own.map((v) => v.colorId)).size,
    variantCount: own.length,
  };
}

/** 서버 에러 본문 모양. `packages/api` 런타임이 `code`·`message`로 읽는다 */
function fail(status: number, code: string, message: string, field?: string) {
  return HttpResponse.json(
    {
      code,
      message,
      errors: field ? [{ field, reason: message }] : [],
      traceId: "mock",
    },
    { status },
  );
}

function matchesQuery(p: MockProduct, q: string | null): boolean {
  if (!q) return true;
  const lower = q.toLowerCase();
  return (
    p.name.toLowerCase().includes(lower) || String(p.productNumber) === lower
  );
}

/** 등록·수정 요청의 색상×사이즈를 variant 행으로. 기존 SKU는 id를 지키고 새 것만 만든다 */
function upsertVariants(
  productId: number,
  options: readonly { colorId: number; sizes?: readonly Size[] }[],
  prices: readonly WholesaleSchema<"VariantPriceRequest">[] | undefined,
) {
  const existing = variants.filter((v) => v.productId === productId);
  const next: MockVariant[] = [];
  let seq = existing.reduce((max, v) => Math.max(max, v.variantNumber), 0);
  for (const option of options) {
    for (const size of option.sizes ?? []) {
      const known = existing.find(
        (v) => v.colorId === option.colorId && v.size === size,
      );
      const price = (prices ?? []).find(
        (x) => x.colorId === option.colorId && x.size === size,
      );
      if (known) {
        if (price) {
          known.salePrice = price.salePrice;
          known.orderLimit = price.orderLimit ?? 0;
        }
        next.push(known);
      } else {
        seq += 1;
        next.push(
          variant(
            nextVariantId++,
            productId,
            option.colorId,
            size,
            seq,
            0,
            price?.salePrice ?? 0,
            price?.orderLimit ?? 0,
          ),
        );
      }
    }
  }
  variants = [...variants.filter((v) => v.productId !== productId), ...next];
}

function upsertListing(
  productId: number,
  body: WholesaleSchema<"ListingUpsertRequest"> | null | undefined,
) {
  if (!body) return;
  const known = listings.find((l) => l.productId === productId);
  const images = (body.images ?? []).map((url, i) => ({
    id: 5100 + i,
    url,
    sortOrder: i,
  }));
  if (known) {
    known.title = body.title;
    known.description = body.description;
    known.isSinglePieceAllowed = body.isSinglePieceAllowed;
    known.images = images;
    return;
  }
  listings.push({
    id: nextListingId++,
    productId,
    title: body.title,
    description: body.description,
    isSinglePieceAllowed: body.isSinglePieceAllowed,
    status: "ON_SALE",
    seasonStartedAt: new Date().toISOString(),
    seasonEndedAt: null,
    images,
  });
}

/* --- 핸들러 ------------------------------------------------------------- */

/**
 * 실서버가 요청 본문에서 거절하는 것 가운데 **목에서도 같이 거절해야 하는 것.**
 *
 * `listing.variantPrices[i]`는 SKU를 `variantId` **또는** `(colorId, size)` 한쪽으로만
 * 가리킨다. 둘 다 실으면 dev가 400 `VALIDATION_FAILED`인데 목은 아무 본문이나 받아서,
 * 화면이 둘 다 싣는 버그가 mock 검증을 통과해 dev에서야 드러났다(dev-verify F2).
 * 응답의 `field`·`reason`·`message`는 2026-09-08 dev 응답 그대로다 — 지어내지 않는다.
 * 나머지 검증(빈 제목·리프 아님 …)은 목에 두지 않는다 — 스펙 example 응답만 돌려준다.
 */
function variantPriceTargetErrors(
  listing: WholesaleSchema<"ListingUpsertRequest"> | null | undefined,
): { field: string; reason: string }[] {
  return (listing?.variantPrices ?? []).flatMap((price, i) => {
    const byId = price.variantId !== undefined;
    const byColorSize = price.colorId !== undefined || price.size !== undefined;
    const bothOrNeither = byId === byColorSize;
    return bothOrNeither
      ? [
          {
            field: `listing.variantPrices[${i}].targetSpecified`,
            reason: "variantId 또는 (colorId, size) 중 한쪽만 지정한다.",
          },
        ]
      : [];
  });
}

function validationFailed(errors: { field: string; reason: string }[]) {
  return HttpResponse.json(
    {
      code: "VALIDATION_FAILED",
      message: "입력값이 올바르지 않습니다.",
      errors,
      traceId: "mock",
    },
    { status: 400 },
  );
}

/** 스펙 자동 핸들러 **앞에** 놓는다. 같은 경로면 이쪽이 이긴다 */
export const productHandlers = [
  http.get("*/api/wholesale/products", ({ request }) => {
    const url = new URL(request.url);
    const q = url.searchParams.get("q");
    const page = Number(url.searchParams.get("page") ?? 0);
    const size = Number(url.searchParams.get("size") ?? 20);
    if (size > 100)
      return fail(
        400,
        "VALIDATION_FAILED",
        "size는 100 이하여야 합니다.",
        "size",
      );

    // 기본 정렬 `createdAt,desc`
    const rows = products
      .filter((p) => matchesQuery(p, q))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map(summaryResponse);
    const meta: WholesaleSchema<"PageMeta"> = {
      page,
      size,
      totalElements: rows.length,
      totalPages: Math.max(Math.ceil(rows.length / size), 1),
    };
    return HttpResponse.json({
      data: rows.slice(page * size, page * size + size),
      meta,
    });
  }),

  http.post("*/api/wholesale/products", async ({ request }) => {
    const body =
      (await request.json()) as WholesaleSchema<"ProductCreateRequest">;
    // dev와 같은 400 — variantId 와 (colorId, size)를 같이 실으면 거절 (#156)
    const targetErrors = variantPriceTargetErrors(body.listing);
    if (targetErrors.length > 0) return validationFailed(targetErrors);
    // 소유 도매처는 101로 본다 — 세션이 없는 목이라 시드 첫 도매처를 쓴다
    const wholesalerId = 101;
    const product: MockProduct = {
      id: nextProductId++,
      wholesalerId,
      productNumber:
        products.filter((p) => p.wholesalerId === wholesalerId).length + 1,
      name: body.name,
      categoryId: body.categoryId,
      createdAt: new Date().toISOString(),
    };
    products.push(product);
    upsertVariants(
      product.id,
      body.colorOptions ?? [],
      body.listing?.variantPrices,
    );
    upsertListing(product.id, body.listing);
    return HttpResponse.json(
      { data: productDetail(product.id) },
      { status: 201 },
    );
  }),

  http.get("*/api/wholesale/products/:productId", ({ params }) => {
    const detail = productDetail(Number(params.productId));
    if (!detail)
      return fail(
        404,
        "RESOURCE_NOT_FOUND",
        "상품이 없거나 접근할 수 없습니다.",
      );
    return HttpResponse.json({ data: detail });
  }),

  http.patch(
    "*/api/wholesale/products/:productId",
    async ({ params, request }) => {
      const product = findMockProduct(Number(params.productId));
      if (!product)
        return fail(
          404,
          "RESOURCE_NOT_FOUND",
          "상품이 없거나 접근할 수 없습니다.",
        );
      const body =
        (await request.json()) as WholesaleSchema<"ProductUpdateRequest">;
      // 생략 = 무변경(스펙)이라 키가 없을 수 있다. 있으면 dev와 같은 400 검사 (#156)
      const targetErrors = variantPriceTargetErrors(body.listing);
      if (targetErrors.length > 0) return validationFailed(targetErrors);
      product.name = body.name;
      product.categoryId = body.categoryId;
      upsertVariants(
        product.id,
        body.colorOptions ?? [],
        body.listing?.variantPrices,
      );
      // 생략 = 무변경(스펙)
      upsertListing(product.id, body.listing);
      return HttpResponse.json({ data: productDetail(product.id) });
    },
  ),

  http.post("*/api/wholesale/listings/:listingId/season-end", ({ params }) => {
    const listing = listings.find((l) => l.id === Number(params.listingId));
    if (!listing) return fail(404, "RESOURCE_NOT_FOUND", "게시글이 없습니다.");
    listing.status = "SEASON_ENDED";
    listing.seasonEndedAt = new Date().toISOString();
    return HttpResponse.json({ data: listingResponse(listing) });
  }),

  http.post("*/api/wholesale/listings/:listingId/reopen", ({ params }) => {
    const listing = listings.find((l) => l.id === Number(params.listingId));
    if (!listing) return fail(404, "RESOURCE_NOT_FOUND", "게시글이 없습니다.");
    listing.status = "ON_SALE";
    listing.seasonEndedAt = null;
    return HttpResponse.json({ data: listingResponse(listing) });
  }),

  http.delete("*/api/wholesale/products/:productId", ({ params }) => {
    const id = Number(params.productId);
    products = products.filter((p) => p.id !== id);
    variants = variants.filter((v) => v.productId !== id);
    listings = listings.filter((l) => l.productId !== id);
    return new HttpResponse(null, { status: 204 });
  }),

  http.get("*/api/wholesale/categories", () =>
    HttpResponse.json({ data: CATEGORIES }),
  ),
  http.get("*/api/wholesale/colors", () =>
    HttpResponse.json({ data: COLOR_GROUPS }),
  ),
];

/** 화면 검증 중 시드로 되돌릴 때. 앱은 부르지 않는다 */
export function resetProductMock() {
  products = seedProducts();
  variants = seedVariants();
  listings = seedListings();
  nextProductId = 1007;
  nextVariantId = 3021;
  nextListingId = 2007;
}
