import "server-only";

import { cache } from "react";
import {
  LISTING_PATH,
  toCatalogOptions,
  type CatalogOptions,
  type CategoryWire,
  type FilterOptionsWire,
} from "@/features/catalog";
import { isNotApproved, serverApi } from "@/shared/api/server";

/**
 * 카테고리·필터 선택지 — 고정 마스터(스펙: "자주 안 변한다. 프론트에서 캐시해도 된다").
 *
 * `cache()`로 감싸는 이유: 같은 요청 안에서 `(browse)/layout.tsx`(카테고리 바)와
 * `page.tsx`(필터 드롭다운)가 둘 다 카테고리를 읽는데, Next는 레이아웃이 페이지에
 * props를 못 넘긴다. 두 번 부르는 대신 한 렌더 안에서 한 번만 나가게 한다 —
 * 요청이 끝나면 캐시도 버려지므로 사장 사이에 섞이지 않는다.
 *
 * 승인 전 계정은 403(`ACCOUNT_NOT_APPROVED`)이라 빈 목록으로 그린다 — 셸이
 * 승인 대기 화면으로 튕기는 것은 `(shop)/layout.tsx` 주석과 같은 이유로 피한다.
 * 도매처 홈(`wholesalers/[id]`)도 같은 선택지를 쓴다.
 */
export const getCategories = cache(async (): Promise<CategoryWire[]> => {
  const api = await serverApi();
  try {
    return await api.fetch<CategoryWire[]>(LISTING_PATH.categories);
  } catch (error) {
    if (isNotApproved(error)) return [];
    throw error;
  }
});

export const getFilterOptions = cache(
  async (): Promise<FilterOptionsWire | null> => {
    const api = await serverApi();
    try {
      return await api.fetch<FilterOptionsWire>(LISTING_PATH.filterOptions);
    } catch (error) {
      if (isNotApproved(error)) return null;
      throw error;
    }
  },
);

/** 두 마스터를 한 번에 — 목록 화면이 필터 드롭다운에 세울 값 */
export async function getCatalogOptions(): Promise<CatalogOptions> {
  const [categories, filterOptions] = await Promise.all([
    getCategories(),
    getFilterOptions(),
  ]);
  return toCatalogOptions(categories, filterOptions);
}
