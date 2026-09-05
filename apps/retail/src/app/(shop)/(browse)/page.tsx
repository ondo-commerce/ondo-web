import type { Metadata } from "next";
import { getCatalogOptions } from "@/app/(shop)/masters";
import {
  HomeView,
  LISTING_PATH,
  resolveFilter,
  resolveShown,
  toCatalogPaging,
  toCatalogProduct,
  toListingParams,
  type ListingSummaryWire,
} from "@/features/catalog";
import { serverApi } from "@/shared/api/server";

/* 탭 제목을 화면 이름으로 채운다. 기본값(`온도 마켓`)만 두면 홈 탭이 앱 이름과
   같아져서, 탭을 여러 장 벌려 놓았을 때 어느 것이 홈인지 탭 줄에서 안 보인다 */
export const metadata: Metadata = { title: "쇼핑몰 홈" };

/**
 * 쇼핑몰 홈. **좁혀 둔 조건은 주소가 원본이라 서버에서 읽어 `GET /listings`에
 * 그대로 실어 보낸다** — 거르는 것은 서버고 화면은 받은 것을 그린다.
 *
 * `더 보기`는 `?shown=`을 `size`로 보내 첫 장을 더 크게 받는다(`toListingParams`
 * 주석). 401은 `(shop)` 레이아웃의 `requireSession`이 먼저 걸러 여기까지 안 온다.
 * 그 밖의 실패는 그대로 던져 `(shop)/error.tsx`가 받는다.
 *
 * `(browse)` 레이아웃이 `force-dynamic`이라 첫 HTML부터 좁혀진 목록이 온다.
 */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const options = await getCatalogOptions();
  const filter = resolveFilter(params, options);
  const shown = resolveShown(params.shown);

  const api = await serverApi();
  const result = await api.fetchPage<ListingSummaryWire>(LISTING_PATH.list, {
    searchParams: toListingParams(filter, shown),
  });
  const products = result.items.map(toCatalogProduct);

  return (
    <HomeView
      products={products}
      filter={filter}
      options={options}
      paging={toCatalogPaging(products.length, result.meta.totalElements)}
    />
  );
}
