"use client";

import { Panel } from "@ondo/ui";
import { CatalogSection } from "./CatalogSection";
import { LIST_SORTS } from "../constants";
import { useFavorites } from "../useFavorites";
import type { CatalogFilter, CatalogProduct, CatalogSort } from "../types";

/**
 * 쇼핑몰 홈. 패널 한 장 안에 툴바 → 구분선 → 카드 격자 → `상품 더 보기`가 든다.
 *
 * **1180px 중앙 정렬(`.wrap`)을 쓰지 않는다** — 확정 와이어프레임의 홈은 패널이
 * 화면 폭을 꽉 쓴다. 중앙 정렬은 검색 결과와 상품 상세 둘뿐이다.
 *
 * 필터·정렬은 주소가 원본이라 이 컴포넌트가 기억하지 않는다. 찜만 화면 상태다.
 */
export function HomeView({
  products,
  filter,
  sort,
}: {
  products: readonly CatalogProduct[];
  filter: CatalogFilter;
  sort: CatalogSort;
}) {
  const { favorites, toggleFavorite } = useFavorites(products);

  return (
    <Panel>
      {/* 패널 제목을 두지 않는다 — 카테고리 줄이 이미 어느 목록인지 말하고 있어서
          "쇼핑몰 홈"을 한 번 더 쓰면 첫 화면의 세로만 먹는다 (도매 목록 탭과 같은 규칙) */}
      <CatalogSection
        basePath="/"
        products={products}
        filter={filter}
        sort={sort}
        sorts={LIST_SORTS}
        defaultSort="latest"
        favorites={favorites}
        onToggleFavorite={toggleFavorite}
      />
    </Panel>
  );
}
