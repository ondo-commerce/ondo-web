import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { getCatalogOptions } from "@/app/(shop)/masters";
import {
  LISTING_PATH,
  MAX_PAGE_SIZE,
  WholesalerHomeView,
  isFilterEmpty,
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
 * 첫 장을 서버 상한(100)까지 받아 이 도매처 것만 남긴다. **스펙에 도매처로
 * 거르는 길이 없다** — `GET /listings`에 `wholesalerId` 파라미터가 없고, 도매처를
 * id로 찾는 path도 없다(`04-wire.md` §3). 게시글이 100건을 넘는 마켓에서는
 * 뒷장의 상품이 빠진다 — BE 요청이 닫히면 파라미터 하나로 바뀔 자리다.
 *
 * 주소에 실린 필터(카테고리·컬러·사이즈)는 서버가 걸고, 도매처만 여기서 건다.
 */
async function fetchListingsOf(
  wholesalerId: string,
  filter: CatalogFilter,
): Promise<CatalogProduct[]> {
  const api = await serverApi();
  const result = await api.fetchPage<ListingSummaryWire>(LISTING_PATH.list, {
    searchParams: toListingParams(filter, MAX_PAGE_SIZE),
  });

  return productsOfWholesaler(result.items.map(toCatalogProduct), wholesalerId);
}

/**
 * **필터를 안 건 목록** — 상호와 "이 도매처가 있는가"는 여기서만 읽는다.
 *
 * 필터가 걸린 목록에서 상호를 찾으면 그 도매처가 안 파는 축(예: 여성복만 올린
 * 집에서 `남성`)을 고른 순간 0건 = 없는 도매처가 돼 화면이 통째로 404였다(F1).
 * 필터 결과에서 상호를 거를 수는 없다 — 목록 응답에 카테고리·컬러·사이즈가
 * 없어(`ListingSummaryResponse`) 서버가 걸어 줘야 한다. 그래서 필터가 있을 때는
 * 요청이 둘이다(필터 없이 1 + 필터 걸고 1). 둘 다 같은 첫 장(size=100)이라
 * 상호가 어긋날 길은 없다.
 *
 * `cache()`: `generateMetadata`와 본문이 같은 렌더에서 이 목록을 두 번 부르지
 * 않게 — 예전엔 둘이 따로 받아 필터 없는 화면도 요청이 둘이었다. 키는 id 하나다
 * (`options` 객체를 인자로 받으면 렌더마다 새 객체라 캐시가 안 맞는다).
 */
const getWholesalerListings = cache(
  async (wholesalerId: string): Promise<CatalogProduct[]> =>
    fetchListingsOf(wholesalerId, resolveFilter({}, await getCatalogOptions())),
);

/** 탭 제목에 상호를 넣는다 — 도매처를 여럿 벌려 놓고 비교하는 화면이다 */
export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { wholesalerId } = await params;
  const all = await getWholesalerListings(wholesalerId);
  const wholesaler = wholesalerOf(all, wholesalerId);

  return { title: wholesaler ? wholesaler.name : "도매처 판매 페이지" };
}

export default async function Page({ params, searchParams }: PageProps) {
  const { wholesalerId } = await params;
  const options = await getCatalogOptions();
  const filter = resolveFilter(await searchParams, options);

  const all = await getWholesalerListings(wholesalerId);

  /* 상호를 알 길이 게시글뿐이다 — 이 도매처 게시글이 첫 장에 하나도 없으면
     없는 도매처로 본다. 빈 머리를 그리면 "폐업"처럼 읽힌다. 필터로 0건이 된
     것은 여기 안 걸린다 — 그때는 머리가 남고 아래에 `초기화`가 선다 */
  const wholesaler = wholesalerOf(all, wholesalerId);
  if (!wholesaler) notFound();

  /* 필터가 없으면 방금 받은 목록이 곧 화면이다 — 같은 요청을 또 보내지 않는다 */
  const products = isFilterEmpty(filter)
    ? all
    : await fetchListingsOf(wholesalerId, filter);

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
      options={options}
      paging={toCatalogPaging(products.length, products.length)}
    />
  );
}
