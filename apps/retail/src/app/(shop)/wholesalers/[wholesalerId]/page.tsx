import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCatalogOptions } from "@/app/(shop)/masters";
import {
  LISTING_PATH,
  MAX_PAGE_SIZE,
  WholesalerHomeView,
  productsOfWholesaler,
  resolveFilter,
  toCatalogPaging,
  toCatalogProduct,
  toListingParams,
  wholesalerOf,
  type CatalogFilter,
  type CatalogProduct,
  type ListingSummaryWire,
} from "@/features/catalog";
import { partnerStatsOf } from "@/features/settlement";
import { serverApi } from "@/shared/api/server";

type PageProps = {
  params: Promise<{ wholesalerId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/** 세션 쿠키로 목록을 받는 화면이라 정적으로 굳힐 수 없다. 주소가 곧 상태이기도 하다 */
export const dynamic = "force-dynamic";

/**
 * 이 도매처의 상품. **스펙에 도매처로 거르는 길이 없다** — `GET /listings`에
 * `wholesalerId` 파라미터가 없고, 도매처를 id로 찾는 path도 없다(`04-wire.md` §3).
 * 그래서 첫 장을 서버 상한(100)까지 받아 `wholesaler.id`로 여기서 거른다.
 * 게시글이 100건을 넘는 마켓에서는 뒷장의 상품이 빠진다 — BE 요청이 닫히면
 * 파라미터 하나로 바뀔 자리다.
 *
 * 주소에 실린 필터(카테고리·컬러·사이즈)는 서버가 걸고, 도매처만 여기서 건다.
 */
async function fetchWholesalerProducts(
  wholesalerId: string,
  params: Record<string, string | string[] | undefined>,
): Promise<{
  products: CatalogProduct[];
  filter: CatalogFilter;
}> {
  const options = await getCatalogOptions();
  const filter = resolveFilter(params, options);
  const api = await serverApi();
  const result = await api.fetchPage<ListingSummaryWire>(LISTING_PATH.list, {
    searchParams: toListingParams(filter, MAX_PAGE_SIZE),
  });

  return {
    products: productsOfWholesaler(
      result.items.map(toCatalogProduct),
      wholesalerId,
    ),
    filter,
  };
}

/** 탭 제목에 상호를 넣는다 — 도매처를 여럿 벌려 놓고 비교하는 화면이다 */
export async function generateMetadata({
  params,
  searchParams,
}: PageProps): Promise<Metadata> {
  const { wholesalerId } = await params;
  const { products } = await fetchWholesalerProducts(
    wholesalerId,
    await searchParams,
  );
  const wholesaler = wholesalerOf(products, wholesalerId);

  return { title: wholesaler ? wholesaler.name : "도매처 판매 페이지" };
}

export default async function Page({ params, searchParams }: PageProps) {
  const { wholesalerId } = await params;
  const query = await searchParams;
  const { products, filter } = await fetchWholesalerProducts(
    wholesalerId,
    query,
  );

  /* 상호를 알 길이 게시글뿐이다 — 필터를 걸어 0건이 됐을 때도 머리는 남아야
     하므로 필터 없이 한 번 더 찾지 않고, 이 도매처 게시글이 첫 장에 하나도
     없으면 없는 도매처로 본다. 빈 머리를 그리면 "폐업"처럼 읽힌다 */
  const wholesaler = wholesalerOf(products, wholesalerId);
  if (!wholesaler) notFound();

  /* 진행 중·미송·미결제 잔액은 거래 원장에서 나온다. 마켓(`catalog`)과
     정산(`settlement`)은 서로를 import하지 않으므로 **여기서 합친다**(F1 · #128).
     정산은 아직 fixtures라 id 축이 다르다(`w-moodon` vs 숫자) — 거래 없음으로 선다 */
  const tradeStats = partnerStatsOf(wholesaler.id);

  return (
    <WholesalerHomeView
      wholesaler={wholesaler}
      tradeStats={tradeStats}
      products={products}
      filter={filter}
      options={await getCatalogOptions()}
      paging={toCatalogPaging(products.length, products.length)}
    />
  );
}
