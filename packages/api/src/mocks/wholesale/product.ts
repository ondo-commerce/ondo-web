import { http, HttpResponse } from "msw";
import type { WholesaleSchema } from "../../wholesale";

/**
 * 상품 응답 example — BE `ProductStubExamples.java`를 그대로 옮겼다.
 *
 * 값을 지어내지 않는다. 지금 BE 스텁 서버가 돌려주는 것과 **같은 값**이라, 이 목으로
 * 본 화면이 곧 스텁 서버로 본 화면이다. BE가 스텁을 실구현으로 바꾸면 값은 달라지지만
 * 모양은 스펙이 지킨다 — 타입이 `WholesaleSchema`라 스펙이 바뀌면 여기가 컴파일에서 깨진다.
 */
const CATEGORY_PATH: WholesaleSchema<"CategoryPathItem">[] = [
  { id: 1, name: "여성" },
  { id: 12, name: "상의" },
  { id: 121, name: "티셔츠" },
];

function listing(
  status: WholesaleSchema<"ListingResponse">["status"],
): WholesaleSchema<"ListingResponse"> {
  const ended = status === "SEASON_ENDED";
  return {
    id: 4410,
    status,
    title: "[신상] 오버핏 코튼 티셔츠 데일리 남방",
    description: "넉넉한 오버핏 실루엣의 데일리 셔츠예요.",
    isSinglePieceAllowed: true,
    seasonStartedAt: "2026-08-01T09:00:00+09:00",
    // 스펙에 nullable이 없어 타입은 string이지만 서버는 진행 중이면 null을 준다(README 참고)
    seasonEndedAt: (ended
      ? "2026-08-24T15:20:00+09:00"
      : null) as unknown as string,
    images: [
      {
        id: 8801,
        url: "https://cdn.ondo.example/listings/4410/1.jpg",
        sortOrder: 0,
      },
    ],
  };
}

export const PRODUCT_DETAIL: WholesaleSchema<"ProductDetailResponse"> = {
  id: 5012,
  productNumber: 18,
  name: "오버핏 코튼 티셔츠",
  categoryPath: CATEGORY_PATH,
  colorOptions: [
    {
      color: { id: 1, name: "블랙", hex: "#191F28", groupName: "무채색" },
      variants: [
        {
          id: 90231,
          variantNumber: 1,
          size: "XS",
          stockQty: 33,
          allocatedQty: 0,
          backorderQty: 2,
          availableQty: 33,
          avgCost: 15200,
          salePrice: 29000,
          orderLimit: 100,
        },
      ],
    },
  ],
  listing: listing("ON_SALE"),
};

/**
 * 게시글 **없이** 등록한 상품 — dev의 1013 "목 테스트 셔츠"(무드온 계정)를 2026-09-08
 * `GET /products/1013` 응답 그대로 옮겼다. 값을 지어내지 않는다.
 *
 * 왜 따로 두나: 게시글이 없으면 서버가 `variants[].salePrice`·`orderLimit`을 **null**로
 * 준다. 스펙 `VariantResponse`엔 `nullable`이 없어 생성 타입은 `number`라 캐스팅으로
 * 눕힌다(`seasonEndedAt`과 같은 사정, README 참고). 이 목이 없으면 "null" 글자가
 * 가격표 칸에 들어가는 결함(dev에서 사용자가 발견)이 mock에서 재현되지 않는다.
 */
const NO_LISTING_CATEGORY_PATH: WholesaleSchema<"CategoryPathItem">[] = [
  { id: 1, name: "여성" },
  { id: 12, name: "상의" },
  { id: 122, name: "맨투맨" },
];

/** 재고·가격이 전부 비어 있는 variant. 사이즈 순서(XS·S·FREE)와 번호도 서버 응답 그대로다 */
function emptyVariant(
  id: number,
  variantNumber: number,
  size: WholesaleSchema<"VariantResponse">["size"],
): WholesaleSchema<"VariantResponse"> {
  return {
    id,
    variantNumber,
    size,
    stockQty: 0,
    allocatedQty: 0,
    backorderQty: 0,
    availableQty: 0,
    avgCost: 0,
    salePrice: null as unknown as number,
    orderLimit: null as unknown as number,
  };
}

/** 색상 하나의 variant 3개. dev는 XS·S·FREE 순으로 주고 번호는 FREE가 먼저 매겨져 있다 */
function emptyColorOption(
  color: WholesaleSchema<"ColorResponse">,
  firstVariantId: number,
  firstVariantNumber: number,
): WholesaleSchema<"ColorOptionResponse"> {
  return {
    color,
    variants: [
      emptyVariant(firstVariantId + 1, firstVariantNumber + 1, "XS"),
      emptyVariant(firstVariantId + 2, firstVariantNumber + 2, "S"),
      emptyVariant(firstVariantId, firstVariantNumber, "FREE"),
    ],
  };
}

export const PRODUCT_DETAIL_NO_LISTING: WholesaleSchema<"ProductDetailResponse"> =
  {
    id: 1013,
    productNumber: 8,
    name: "목 테스트 셔츠",
    categoryPath: NO_LISTING_CATEGORY_PATH,
    colorOptions: [
      emptyColorOption(
        { id: 1, name: "블랙", hex: "#191F28", groupName: "무채색" },
        3055,
        1,
      ),
      emptyColorOption(
        { id: 7, name: "베이지", hex: "#E3D5BF", groupName: "베이지·브라운" },
        3058,
        4,
      ),
      emptyColorOption(
        { id: 11, name: "네이비", hex: "#1F3A68", groupName: "블루" },
        3061,
        7,
      ),
      emptyColorOption(
        { id: 14, name: "연청", hex: "#A9C7E0", groupName: "데님 워싱" },
        3064,
        10,
      ),
      emptyColorOption(
        { id: 17, name: "레드", hex: "#D0393F", groupName: "컬러" },
        3067,
        13,
      ),
      emptyColorOption(
        { id: 25, name: "골드", hex: "#C9A227", groupName: "특수" },
        3070,
        16,
      ),
    ],
    // 게시글 없음. 스펙에 nullable이 없어 타입은 객체지만 서버는 null을 준다
    listing: null as unknown as WholesaleSchema<"ListingResponse">,
  };

export const PRODUCT_SUMMARIES: WholesaleSchema<"ProductSummaryResponse">[] = [
  {
    id: 5012,
    productNumber: 18,
    name: "오버핏 코튼 티셔츠",
    categoryPath: CATEGORY_PATH,
    listingStatus: "ON_SALE",
    colorCount: 3,
    variantCount: 8,
  },
  {
    id: 1013,
    productNumber: 8,
    name: "목 테스트 셔츠",
    categoryPath: NO_LISTING_CATEGORY_PATH,
    // 게시글 없음 = null. `seasonEndedAt`·`listing`과 같은 사정
    listingStatus:
      null as unknown as WholesaleSchema<"ProductSummaryResponse">["listingStatus"],
    colorCount: 6,
    variantCount: 18,
  },
];

/**
 * 카테고리·색상 마스터 — BE `V5__category_color_seed.sql`(2026-09-03 팀 확정본)을 그대로 옮겼다.
 *
 * `CategoryController`·`ColorController`는 스텁이 아니라 실구현이라 `*StubExamples.java`가
 * 없다. 스펙 자동 조립(뼈대)은 노드 1개·문자열 "name"이라 셀렉트가 비어 보여서, 시드 값을
 * 옮긴다. 값을 지어내지 않는다 — id·이름·hex·순서 전부 시드 그대로다.
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

const PAGE_META: WholesaleSchema<"PageMeta"> = {
  page: 0,
  size: 20,
  totalElements: PRODUCT_SUMMARIES.length,
  totalPages: 1,
};

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
  http.get("*/api/wholesale/products", () =>
    HttpResponse.json({ data: PRODUCT_SUMMARIES, meta: PAGE_META }),
  ),
  http.post<never, WholesaleSchema<"ProductCreateRequest">>(
    "*/api/wholesale/products",
    async ({ request }) => {
      const body = await request.json();
      // 스펙 타입은 non-optional이지만 "null이면 상품만"이 계약이라 런타임엔 null이 온다
      const errors = variantPriceTargetErrors(
        body.listing as WholesaleSchema<"ListingUpsertRequest"> | null,
      );
      if (errors.length > 0) return validationFailed(errors);
      return HttpResponse.json({ data: PRODUCT_DETAIL }, { status: 201 });
    },
  ),
  // 1013만 게시글 없는 상품. 나머지 id는 전부 스텁 상품 — 등록 직후 재조회도 이쪽으로 온다
  http.get<{ productId: string }>(
    "*/api/wholesale/products/:productId",
    ({ params }) =>
      HttpResponse.json({
        data:
          params.productId === String(PRODUCT_DETAIL_NO_LISTING.id)
            ? PRODUCT_DETAIL_NO_LISTING
            : PRODUCT_DETAIL,
      }),
  ),
  http.patch<{ productId: string }, WholesaleSchema<"ProductUpdateRequest">>(
    "*/api/wholesale/products/:productId",
    async ({ request }) => {
      const body = await request.json();
      // 생략 = 무변경(스펙)이라 키가 없을 수 있다
      const errors = variantPriceTargetErrors(
        body.listing as WholesaleSchema<"ListingUpsertRequest"> | undefined,
      );
      if (errors.length > 0) return validationFailed(errors);
      return HttpResponse.json({ data: PRODUCT_DETAIL });
    },
  ),
  http.post("*/api/wholesale/listings/:listingId/season-end", () =>
    HttpResponse.json({ data: listing("SEASON_ENDED") }),
  ),
  http.post("*/api/wholesale/listings/:listingId/reopen", () =>
    HttpResponse.json({ data: listing("ON_SALE") }),
  ),
  // 204 — 자동 조립도 같은 답이지만, 상품 경로는 이 파일이 전부 맡는다는 걸 한 곳에서 읽히게 둔다
  http.delete(
    "*/api/wholesale/products/:productId",
    () => new HttpResponse(null, { status: 204 }),
  ),
  http.get("*/api/wholesale/categories", () =>
    HttpResponse.json({ data: CATEGORIES }),
  ),
  http.get("*/api/wholesale/colors", () =>
    HttpResponse.json({ data: COLOR_GROUPS }),
  ),
];
