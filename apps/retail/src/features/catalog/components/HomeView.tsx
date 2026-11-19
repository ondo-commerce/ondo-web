"use client";

import { Panel } from "@ondo/ui";
import { CatalogSection } from "./CatalogSection";
import { useFavorites } from "../useFavorites";
import type {
  CatalogFilter,
  CatalogOptions,
  CatalogPaging,
  CatalogProduct,
} from "../types";

/** 선택한 조건과 페이지는 주소에, 찜 상태는 세션에 남긴다. */
export function HomeView({
  products,
  filter,
  options,
  paging,
}: {
  products: readonly CatalogProduct[];
  filter: CatalogFilter;
  options: CatalogOptions;
  paging: CatalogPaging;
}) {
  const { favorites, toggleFavorite } = useFavorites();

  return (
    <Panel>
      <h1 className="sr-only">쇼핑몰 홈</h1>
      <CatalogSection
        basePath="/"
        products={products}
        filter={filter}
        options={options}
        paging={paging}
        favorites={favorites}
        onToggleFavorite={toggleFavorite}
      />
    </Panel>
  );
}
