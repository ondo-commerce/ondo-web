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
];
