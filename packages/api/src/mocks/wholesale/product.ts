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

/** 스펙 자동 핸들러 **앞에** 놓는다. 같은 경로면 이쪽이 이긴다 */
export const productHandlers = [
  http.get("*/api/wholesale/products", () =>
    HttpResponse.json({ data: PRODUCT_SUMMARIES, meta: PAGE_META }),
  ),
  http.post("*/api/wholesale/products", () =>
    HttpResponse.json({ data: PRODUCT_DETAIL }, { status: 201 }),
  ),
  http.get("*/api/wholesale/products/:productId", () =>
    HttpResponse.json({ data: PRODUCT_DETAIL }),
  ),
  http.patch("*/api/wholesale/products/:productId", () =>
    HttpResponse.json({ data: PRODUCT_DETAIL }),
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
