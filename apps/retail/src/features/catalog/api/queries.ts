"use client";

import { useQueries } from "@tanstack/react-query";
import { apiFetch } from "@ondo/api";
import { catalogKeys } from "./keys";
import { LISTING_PATH } from "./paths";
import { toCatalogProductFromDetail } from "../derive";
import type { CatalogProduct, ListingDetailWire } from "../types";

/**
 * 찜한 상품들의 카드 값. **찜 목록 화면만 쓴다.**
 *
 * 소매 목록은 Server Component가 받는 것이 원칙(ADR-0003)이지만, 찜 집합은
 * 브라우저 세션에만 있어 서버가 무엇을 받을지 모른다. 스펙에 "여러 id를 한 번에"
 * 부르는 path도 없어(`04-wire.md` §3) 상세를 id마다 따로 부른다.
 *
 * 404(게시가 내려간 상품)는 **조용히 빠진다** — 게시 내림의 정의가 "목록에서
 * 빠진다"이고, 못 불러온 것을 카드로 그릴 값도 없다. 아직 답이 안 온 것은 `pending`
 * 으로 알려 화면이 "불러오는 중"을 말하게 한다.
 */
export function useFavoriteListings(listingIds: readonly number[]): {
  products: CatalogProduct[];
  pending: boolean;
  /** 서버가 못 준 상품 수. 0이 아니면 화면이 그 사실을 한 줄로 말한다 */
  missing: number;
} {
  return useQueries({
    queries: listingIds.map((listingId) => ({
      queryKey: catalogKeys.listing(listingId),
      queryFn: () =>
        apiFetch<ListingDetailWire>(LISTING_PATH.detail(listingId)),
      select: toCatalogProductFromDetail,
    })),
    combine: (results) => ({
      products: results.flatMap((r) => (r.data ? [r.data] : [])),
      pending: results.some((r) => r.isPending),
      missing: results.filter((r) => r.isError).length,
    }),
  });
}
