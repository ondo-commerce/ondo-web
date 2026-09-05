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

/**
 * 쇼핑몰 홈. 패널 한 장 안에 툴바 → 구분선 → 카드 격자 → `상품 더 보기`가 든다.
 *
 * **1180px 중앙 정렬(`.wrap`)을 쓰지 않는다** — 확정 와이어프레임의 홈은 패널이
 * 화면 폭을 꽉 쓴다. 중앙 정렬은 검색 결과와 상품 상세 둘뿐이다.
 *
 * 카드·선택지·건수는 전부 서버에서 받은 값이다(`app/(shop)/(browse)/page.tsx`).
 * 필터·펼침은 주소가 원본이라 이 컴포넌트가 기억하지 않는다. 찜은 화면 밖
 * 세션 저장소(`useFavorites`)가 갖는다 — 상세·검색과 같은 값을 봐야 한다.
 */
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
      {/* 패널 제목을 **눈에는** 두지 않는다 — 카테고리 줄이 이미 어느 목록인지
          말하고 있어서 "쇼핑몰 홈"을 한 번 더 쓰면 첫 화면의 세로만 먹는다
          (도매 목록 탭과 같은 규칙).

          그래도 h1은 있어야 한다. 없으면 첫 헤딩이 카드 h3라, 스크린리더로
          화면을 옮겨 다닐 때 홈만 시작 레벨이 달라 어디에 도착했는지 알 수
          없다. 다른 네 화면(검색·찜·도매처·상세)은 전부 제목이 있다 */}
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
