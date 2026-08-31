"use client";

import { Button } from "@ondo/ui";
import { ChevronDown, RotateCcw, SearchX } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import {
  FilterDropdown,
  SortDropdown,
  type FilterOption,
} from "./FilterDropdown";
import { ProductGrid } from "./ProductGrid";
import {
  FILTER_ALL,
  FILTER_ALL_LABEL,
  PAGE_SIZE,
  PRICE_BANDS,
  SORT_LABEL,
} from "../constants";
import {
  availableColors,
  availableSizes,
  catalogHref,
  filterProducts,
  isFilterEmpty,
  sortProducts,
} from "../derive";
import type { CatalogFilter, CatalogProduct, CatalogSort } from "../types";
import { CATEGORIES } from "@/shared/config/nav";

/**
 * 필터 툴바 + 구분선 + 카드 격자 + `상품 더 보기`. 홈과 도매처 홈의 `전체 상품`이
 * 같은 것을 쓴다 — 두 화면에서 필터가 갈리면 같은 상품이 다르게 걸린다.
 *
 * **건수 표기가 화면에 실제로 그려진 카드 수와 같다.** 필터로 가려진 상품도,
 * 아직 `더 보기`로 펼치지 않은 상품도 이 숫자에 남지 않는다 — 도매 5회차에서
 * 네 번 재발한 "가려진 대상이 집계에 남는" 결함을 여기서 끊는다. 아직 안 펼친
 * 나머지가 있으면 `· 전체 N개`를 덧붙여 더 있다는 사실만 따로 말한다.
 */
export function CatalogSection({
  basePath,
  products,
  filter,
  sort,
  sorts,
  defaultSort,
  showPriceFilter = true,
  favorites,
  onToggleFavorite,
  columns = 5,
  noun = "상품",
}: {
  basePath: string;
  /** 이 화면이 다루는 상품 전부. 필터·정렬은 여기서 건다 */
  products: readonly CatalogProduct[];
  filter: CatalogFilter;
  sort: CatalogSort;
  sorts: readonly CatalogSort[];
  defaultSort: CatalogSort;
  /** 도매처 홈에는 가격대 필터가 없다 — 한 도매처 안이라 가격 폭이 좁다 */
  showPriceFilter?: boolean;
  favorites: ReadonlySet<string>;
  onToggleFavorite: (productId: string) => void;
  columns?: 4 | 5;
  noun?: string;
}) {
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const matched = sortProducts(filterProducts(products, filter), sort);
  /* 필터가 좁아져 남은 수가 이미 적으면 slice가 알아서 전부 준다 —
     펼침 상태를 따로 되돌리지 않아도 건수와 카드 수가 어긋나지 않는다 */
  const visible = matched.slice(0, visibleCount);
  const hasMore = visible.length < matched.length;

  const href = (patch: Partial<CatalogFilter> & { sort?: CatalogSort }) =>
    catalogHref(basePath, { filter, sort }, patch, defaultSort);

  const allOption = (key: keyof CatalogFilter): FilterOption => ({
    value: FILTER_ALL,
    label: FILTER_ALL_LABEL,
    href: href({ [key]: FILTER_ALL }),
  });

  const categoryOptions: FilterOption[] = CATEGORIES.map((c) => ({
    /* 셸 카테고리 바가 쓰는 `all`이 곧 `전체`다 — 값을 새로 만들면 카테고리 줄과
       이 필터가 서로 다른 것을 켠다 */
    value: c.slug === "all" ? FILTER_ALL : c.slug,
    label: c.label,
    href: href({ category: c.slug === "all" ? FILTER_ALL : c.slug }),
  }));

  const colorOptions: FilterOption[] = [
    allOption("color"),
    ...availableColors(products).map((c) => ({
      value: c.name,
      label: c.name,
      href: href({ color: c.name }),
      hex: c.hex,
    })),
  ];

  const sizeOptions: FilterOption[] = [
    allOption("size"),
    ...availableSizes(products).map((s) => ({
      value: s,
      label: s,
      href: href({ size: s }),
    })),
  ];

  const priceOptions: FilterOption[] = [
    allOption("price"),
    ...PRICE_BANDS.map((b) => ({
      value: b.value,
      label: b.label,
      href: href({ price: b.value }),
    })),
  ];

  const sortOptions: FilterOption[] = sorts.map((s) => ({
    value: s,
    label: SORT_LABEL[s],
    href: href({ sort: s }),
  }));

  const selected = (options: FilterOption[], value: string) =>
    value === FILTER_ALL
      ? undefined
      : options.find((o) => o.value === value)?.label;

  const clean = isFilterEmpty(filter);
  const resetHref = href({
    category: FILTER_ALL,
    color: FILTER_ALL,
    size: FILTER_ALL,
    price: FILTER_ALL,
  });

  return (
    <>
      {/* flex-wrap: 390px에서 필터 4개가 한 줄에 못 선다. 원본도 ≤40rem에서
          `.toolbar{flex-wrap:wrap}`으로 접고 건수·정렬 묶음을 아래 줄로 내린다 */}
      <div className="flex flex-wrap items-center gap-2 pb-3">
        <FilterDropdown
          label="카테고리"
          options={categoryOptions}
          value={filter.category}
          selectedLabel={selected(categoryOptions, filter.category)}
        />
        <FilterDropdown
          label="컬러"
          options={colorOptions}
          value={filter.color}
          selectedLabel={selected(colorOptions, filter.color)}
        />
        <FilterDropdown
          label="사이즈"
          options={sizeOptions}
          value={filter.size}
          selectedLabel={selected(sizeOptions, filter.size)}
        />
        {showPriceFilter ? (
          <FilterDropdown
            label="가격대"
            options={priceOptions}
            value={filter.price}
            selectedLabel={selected(priceOptions, filter.price)}
          />
        ) : null}

        {/* 아무것도 안 걸렸을 때도 자리를 지킨다 — 눌러도 같은 화면이라 해가 없고,
            사라지면 필터를 걸 때마다 툴바가 옆으로 밀린다 */}
        <Button
          asChild
          variant="ghost"
          className="text-body h-8 gap-1.5 px-2"
          aria-disabled={clean}
        >
          <Link href={resetHref}>
            <RotateCcw aria-hidden className="size-3.5" />
            초기화
          </Link>
        </Button>

        <div className="ml-auto flex items-center gap-3 phone:ml-0 phone:w-full phone:justify-between">
          <ResultCount
            noun={noun}
            visible={visible.length}
            total={matched.length}
          />
          <SortDropdown
            options={sortOptions}
            value={sort}
            selectedLabel={SORT_LABEL[sort]}
          />
        </div>
      </div>

      {matched.length === 0 ? (
        <CatalogEmpty resetHref={resetHref} filtered={!clean} />
      ) : (
        <>
          {/* 패널 안쪽 여백을 지나 좌우 끝까지 긋는다 (`_base.css` `.hr{margin:0 -16px}`) */}
          <div className="bg-border -mx-4 h-px" />

          <ProductGrid
            products={visible}
            favorites={favorites}
            onToggleFavorite={onToggleFavorite}
            columns={columns}
          />

          {hasMore ? (
            <button
              type="button"
              onClick={() => setVisibleCount((n) => n + PAGE_SIZE)}
              className="border-border text-secondary-foreground hover:bg-secondary text-body -mx-4 -mb-4 flex h-10 cursor-pointer items-center justify-center gap-1 rounded-b-panel border-t font-medium"
            >
              {noun} 더 보기
              <ChevronDown aria-hidden className="text-border-strong size-3" />
            </button>
          ) : null}
        </>
      )}
    </>
  );
}

/** 건수 표기. `b`가 아니라 색·굵기로 강조한다 — 굵기만 바꾸는 자리에 의미 태그를 쓰지 않는다 */
export function ResultCount({
  noun,
  visible,
  total,
}: {
  noun: string;
  visible: number;
  total: number;
}) {
  return (
    <p className="text-muted-foreground text-body tabular-nums">
      {noun} <span className="text-foreground font-medium">{visible}</span>개
      {visible < total ? <span> · 전체 {total}개</span> : null}
    </p>
  );
}

/**
 * 결과 0건. 문구는 게이트 Q6 확정본이다.
 *
 * 필터가 걸려 있을 때만 `초기화`를 준다 — 아무 조건도 안 걸었는데 0건이면
 * 초기화해도 그대로라, 눌러도 아무 일이 없는 버튼을 주는 셈이 된다.
 */
export function CatalogEmpty({
  resetHref,
  filtered,
}: {
  resetHref: string;
  filtered: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-1.5 px-5 py-16 text-center">
      <span className="bg-secondary text-border-strong mb-1.5 grid size-11 place-items-center rounded-full">
        <SearchX aria-hidden className="size-5" />
      </span>
      <h3 className="text-base font-medium">
        {filtered ? "조건에 맞는 상품이 없어요." : "아직 올라온 상품이 없어요."}
      </h3>
      <p className="text-muted-foreground text-body">
        {filtered
          ? "필터를 지우면 전체를 볼 수 있어요."
          : "도매처가 상품을 올리면 여기에 보여요."}
      </p>
      {filtered ? (
        <div className="mt-3.5">
          <Button asChild variant="line">
            <Link href={resetHref}>초기화</Link>
          </Button>
        </div>
      ) : null}
    </div>
  );
}
