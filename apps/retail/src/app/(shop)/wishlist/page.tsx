import type { Metadata } from "next";
import {
  WISHLIST_SORTS,
  WishlistView,
  resolveSeller,
  resolveSort,
} from "@/features/catalog";

export const metadata: Metadata = { title: "찜 목록" };

/**
 * 찜 목록. **서버가 받는 목록이 없다** — 찜 집합이 브라우저 세션에만 있고
 * (찜 API 없음, `04-wire.md` §4) 서버 컴포넌트는 그 집합을 모른다. 그래서
 * 이 페이지는 주소만 읽어 넘기고, 카드는 `WishlistView`가 브라우저에서 찜한
 * id마다 `GET /listings/{id}`로 받는다.
 */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;

  return (
    <WishlistView
      /* 없는 도매처 슬러그(옛 링크·오타)는 화면이 찜 집합을 받은 뒤 `전체`로
         떨어뜨린다 — 여기서는 어느 도매처가 있는지 모른다 */
      seller={resolveSeller(query)}
      sort={resolveSort(query, WISHLIST_SORTS)}
    />
  );
}
