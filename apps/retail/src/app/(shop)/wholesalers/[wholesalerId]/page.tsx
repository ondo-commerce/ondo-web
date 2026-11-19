import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { getCatalogOptions } from "@/app/(shop)/masters";
import {
  FILTER_ALL,
  LISTING_PATH,
  MAX_PAGE_SIZE,
  PAGE_SIZE,
  WHOLESALER_HOME_AXES,
  WholesalerHomeView,
  catalogHref,
  isFilterEmpty,
  productsOfWholesaler,
  resolveCatalogPage,
  resolveFilter,
  toCatalogPaging,
  toCatalogProduct,
  toListingParams,
  wholesalerOf,
  type CatalogFilter,
  type CatalogProduct,
  type ListingSummaryWire,
  type TradeStatsSlot,
} from "@/features/catalog";
import { InquiryButton, InquiryEntry, InquiryError } from "@/features/chat";
import {
  SETTLEMENT_API_PATH,
  findSettlement,
  toPartnerSettlements,
  type PartnerSettlementWire,
} from "@/features/settlement";
import { serverApi } from "@/shared/api/server";

type PageProps = {
  params: Promise<{ wholesalerId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/** 세션 쿠키로 목록을 받는 화면이라 정적으로 굳힐 수 없다. 주소가 곧 상태이기도 하다 */
export const dynamic = "force-dynamic";

/** 서버가 도매처 조건을 받지 않아 마켓의 각 장에서 해당 도매처 상품만 남긴다. */
async function fetchListingsOf(
  wholesalerId: string,
  filter: CatalogFilter,
  firstMatchOnly = false,
): Promise<CatalogProduct[]> {
  const api = await serverApi();
  const listings = new Map<string, CatalogProduct>();
  let totalPages = 1;
  for (let page = 1; page <= totalPages; page++) {
    const result = await api.fetchPage<ListingSummaryWire>(LISTING_PATH.list, {
      searchParams: toListingParams(filter, page, MAX_PAGE_SIZE),
    });
    // 조회 도중 게시글이 추가돼도 이번 요청의 마지막 장은 늘리지 않는다.
    if (page === 1) totalPages = result.meta.totalPages;
    const matching = productsOfWholesaler(
      result.items.map(toCatalogProduct),
      wholesalerId,
    );
    if (firstMatchOnly && matching[0]) return [matching[0]];
    for (const product of matching) listings.set(product.id, product);
  }
  return [...listings.values()];
}

/** 같은 렌더에서 제목과 본문이 조회 결과를 공유한다. 캐시 키는 정규화된 필터 값이다. */
const getSellerCatalog = cache(
  async (id: string, category: string, color: string, size: string) => {
    const filter = { category, color, size, price: FILTER_ALL };
    const products = await fetchListingsOf(id, filter);
    // 필터를 건 결과가 비어도 존재하는 도매처의 판매 페이지는 열려야 한다.
    const identity =
      products.length === 0 && !isFilterEmpty(filter)
        ? await fetchListingsOf(
            id,
            {
              category: FILTER_ALL,
              color: FILTER_ALL,
              size: FILTER_ALL,
              price: FILTER_ALL,
            },
            true,
          )
        : products;
    return { products, wholesaler: wholesalerOf(identity, id) };
  },
);

async function loadCatalog({ params, searchParams }: PageProps) {
  const [{ wholesalerId }, query, options] = await Promise.all([
    params,
    searchParams,
    getCatalogOptions(),
  ]);
  const filter = resolveFilter(query, options, WHOLESALER_HOME_AXES);
  const catalog = await getSellerCatalog(
    wholesalerId,
    filter.category,
    filter.color,
    filter.size,
  );
  return { ...catalog, filter, options, page: resolveCatalogPage(query) };
}

/**
 * 이 도매처와의 거래 지표. `GET /settlements`에서 이 도매처 줄을 찾는다 — 정산·
 * 거래처 표와 **같은 응답·같은 변환**이라 세 화면이 같은 금액을 말한다(F1 · #183).
 * 마켓(`catalog`)과 정산(`settlement`)은 서로를 import하지 않으므로 여기서 합친다.
 *
 * **못 받으면 `unavailable`이고 던지지 않는다.** 이 화면의 본문은 상품 목록이다 —
 * 통계 카드 하나 때문에 상품까지 `error.tsx`로 보내지 않는다(`layout.tsx`가 장바구니
 * 뱃지를 삼키는 것과 같은 이유). 줄이 없으면 `null` = 거래한 적 없는 도매처다.
 */
async function fetchTradeStats(wholesalerId: string): Promise<TradeStatsSlot> {
  const api = await serverApi();
  try {
    const rows = toPartnerSettlements(
      await api.fetch<PartnerSettlementWire[]>(SETTLEMENT_API_PATH.list),
    );
    const row = findSettlement(wholesalerId, rows);
    return {
      status: "ready",
      stats: row ? { balance: row.balance, lastPaidAt: row.lastPaidAt } : null,
    };
  } catch {
    return { status: "unavailable" };
  }
}

/** 탭 제목에 상호를 넣는다 — 도매처를 여럿 벌려 놓고 비교하는 화면이다 */
export async function generateMetadata(props: PageProps): Promise<Metadata> {
  const { wholesaler } = await loadCatalog(props);
  return { title: wholesaler ? wholesaler.name : "도매처 판매 페이지" };
}

export default async function Page(props: PageProps) {
  const { wholesalerId } = await props.params;
  const [{ products, wholesaler, filter, options, page }, tradeStats] =
    await Promise.all([loadCatalog(props), fetchTradeStats(wholesalerId)]);
  if (!wholesaler) notFound();

  const paging = toCatalogPaging(page, products.length);
  if (paging.page !== page) {
    redirect(
      catalogHref(`/wholesalers/${wholesaler.id}`, filter, {}, paging.page),
    );
  }
  const start = (page - 1) * PAGE_SIZE;

  /* `문의하기`(loop-05a)는 `features/chat`이라 여기서 끼운다. 도매처 홈엔 상품 문맥이 없다(listingId null) */
  return (
    <InquiryEntry wholesalerId={Number(wholesaler.id)} listingId={null}>
      <WholesalerHomeView
        wholesaler={wholesaler}
        tradeStats={tradeStats}
        products={products.slice(start, start + PAGE_SIZE)}
        filter={filter}
        options={options}
        paging={paging}
        inquiryAction={<InquiryButton ac="S5-2 S5-4 S5-11" />}
        inquiryNotice={<InquiryError />}
      />
    </InquiryEntry>
  );
}
