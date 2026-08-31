import type { Metadata } from "next";
import {
  CATALOG_PRODUCTS,
  WISHLIST_SORTS,
  WishlistView,
  availableWholesalers,
  resolveSeller,
  resolveSort,
} from "@/features/catalog";

export const metadata: Metadata = { title: "찜 목록" };

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;

  /* **찜한 것만 골라 내리지 않는다.** 무엇이 목록에 서는지는 화면에 들어온
     순간의 찜 집합이 정하고(게이트 Q7), 그 집합은 서버가 모른다 — 사장이 홈에서
     방금 찜한 상품도 다음에 들어올 때 여기 서야 한다 */
  return (
    <WishlistView
      products={CATALOG_PRODUCTS}
      /* 아예 없는 도매처 슬러그(옛 링크·오타)는 여기서 `전체`로 떨어뜨리고,
         "지금 목록에 없는 도매처"인지는 화면이 다시 한 번 본다 */
      seller={resolveSeller(
        query,
        availableWholesalers(CATALOG_PRODUCTS).map((w) => w.id),
      )}
      sort={resolveSort(query, WISHLIST_SORTS)}
    />
  );
}
