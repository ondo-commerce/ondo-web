"use client";

import { Button } from "@ondo/ui";
import { ChevronLeft, ChevronRight, RotateCcw } from "lucide-react";
import Link from "next/link";
import { FilterDropdown, type FilterOption } from "./FilterDropdown";
import { ProductGrid } from "./ProductGrid";
import { FILTER_ALL, FILTER_ALL_LABEL, PRICE_BANDS } from "../constants";
import { catalogPageNumbers, catalogHref, isFilterEmpty } from "../derive";
import type {
  CatalogFilter,
  CatalogOptions,
  CatalogPaging,
  CatalogProduct,
} from "../types";

/** 홈과 도매처 판매 페이지의 필터 및 상품 목록. 필터와 페이지는 주소에서 읽는다. */
export function CatalogSection({
  basePath,
  products,
  filter,
  options,
  paging,
  showPriceFilter = true,
  favorites,
  onToggleFavorite,
  noun = "상품",
}: {
  basePath: string;
  /** 서버가 이미 걸러 준 카드들 */
  products: readonly CatalogProduct[];
  filter: CatalogFilter;
  /** 드롭다운에 세울 선택지. `GET /categories` · `GET /filter-options` */
  options: CatalogOptions;
  paging: CatalogPaging;
  /** 도매처 홈에는 가격대 필터가 없다 — 한 도매처 안이라 가격 폭이 좁다 */
  showPriceFilter?: boolean;
  favorites: ReadonlySet<string>;
  onToggleFavorite: (productId: string) => void;
  noun?: string;
}) {
  const href = (patch: Partial<CatalogFilter>) =>
    catalogHref(basePath, filter, patch);

  const allOption = (key: keyof CatalogFilter): FilterOption => ({
    value: FILTER_ALL,
    label: FILTER_ALL_LABEL,
    href: href({ [key]: FILTER_ALL }),
  });

  const categoryOptions: FilterOption[] = [
    allOption("category"),
    ...options.categories.map((c) => ({
      value: String(c.id),
      label: c.name,
      href: href({ category: String(c.id) }),
    })),
  ];

  const colorOptions: FilterOption[] = [
    allOption("color"),
    ...options.colors.map((c) => ({
      value: String(c.id),
      label: c.name,
      href: href({ color: String(c.id) }),
      hex: c.hex,
    })),
  ];

  const sizeOptions: FilterOption[] = [
    allOption("size"),
    ...options.sizes.map((s) => ({
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

  const selected = (opts: FilterOption[], value: string) =>
    value === FILTER_ALL
      ? undefined
      : opts.find((o) => o.value === value)?.label;

  const clean = isFilterEmpty(filter);
  const resetHref = href({
    category: FILTER_ALL,
    color: FILTER_ALL,
    size: FILTER_ALL,
    price: FILTER_ALL,
  });

  return (
    <>
      {/* 좁은 화면에서는 조건과 건수를 자연스럽게 다음 줄로 보낸다. */}
      <div
        id="catalog-results"
        className="scroll-mt-32 flex flex-wrap items-center gap-3 phone:gap-2"
      >
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

        {/* 아무것도 안 걸렸을 때도 자리를 지킨다 — 사라지면 필터를 걸 때마다
            툴바가 옆으로 밀린다. 다만 그때는 **진짜 못 누르는 버튼**으로 둔다:
            `aria-disabled`만 걸면 보조기술에는 못 누른다고 말해 놓고 실제로는
            포커스도 되고 눌리면 이동한다 */}
        {clean ? (
          <Button variant="ghost" size="sm" disabled>
            <RotateCcw aria-hidden className="size-3.5" />
            초기화
          </Button>
        ) : (
          <Button asChild variant="ghost" size="sm">
            <Link href={resetHref}>
              <RotateCcw aria-hidden className="size-3.5" />
              초기화
            </Link>
          </Button>
        )}

        <div className="ml-auto">
          <ResultCount
            noun={noun}
            visible={products.length}
            total={paging.total}
          />
        </div>
      </div>

      {products.length === 0 ? (
        <CatalogEmpty resetHref={resetHref} filtered={!clean} />
      ) : (
        <>
          <ProductGrid
            products={products}
            favorites={favorites}
            onToggleFavorite={onToggleFavorite}
          />

          <CatalogPagination
            paging={paging}
            hrefFor={(page) =>
              `${catalogHref(basePath, filter, {}, page)}#catalog-results`
            }
          />
        </>
      )}
    </>
  );
}

function CatalogPagination({
  paging,
  hrefFor,
}: {
  paging: CatalogPaging;
  hrefFor: (page: number) => string;
}) {
  const { page, totalPages } = paging;
  if (totalPages < 2) return null;

  const controlClass =
    "min-w-8 px-2 tabular-nums focus-visible:outline-2 focus-visible:outline-ring";
  return (
    <nav
      aria-label="상품 목록 페이지"
      className="mt-3 flex flex-wrap items-center justify-end gap-2 phone:justify-center"
    >
      <Button
        asChild={page > 1}
        disabled={page === 1}
        aria-label="이전 페이지"
        variant="line"
        size="sm"
        className={controlClass}
      >
        {page > 1 ? (
          <Link href={hrefFor(page - 1)} prefetch={false}>
            <ChevronLeft aria-hidden className="size-4" />
          </Link>
        ) : (
          <ChevronLeft aria-hidden className="size-4" />
        )}
      </Button>
      {catalogPageNumbers(paging).map((number) => (
        <Button
          key={number}
          asChild
          variant="line"
          size="sm"
          className={
            number === page
              ? `${controlClass} bg-secondary text-foreground`
              : controlClass
          }
        >
          <Link
            href={hrefFor(number)}
            prefetch={false}
            aria-label={`${number}페이지`}
            aria-current={number === page ? "page" : undefined}
          >
            {number}
          </Link>
        </Button>
      ))}
      <Button
        asChild={page < totalPages}
        disabled={page === totalPages}
        aria-label="다음 페이지"
        variant="line"
        size="sm"
        className={controlClass}
      >
        {page < totalPages ? (
          <Link href={hrefFor(page + 1)} prefetch={false}>
            <ChevronRight aria-hidden className="size-4" />
          </Link>
        ) : (
          <ChevronRight aria-hidden className="size-4" />
        )}
      </Button>
    </nav>
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
    <p className="text-muted-foreground text-xs tabular-nums">
      {noun} <span className="text-foreground font-medium">{visible}</span>개
      {visible < total ? <span> · 전체 {total}개</span> : null}
    </p>
  );
}

/** 조건을 해제하면 목록이 달라지는 경우만 초기화 링크를 제공한다. */
export function CatalogEmpty({
  resetHref,
  filtered,
}: {
  resetHref: string;
  filtered: boolean;
}) {
  return (
    <div className="py-8 text-center">
      <p className="text-muted-foreground text-sm">
        {filtered ? "조건에 맞는 상품이 없어요." : "아직 올라온 상품이 없어요."}
      </p>
      {filtered && (
        <Button asChild variant="line" size="sm" className="mt-3">
          <Link href={resetHref}>초기화</Link>
        </Button>
      )}
    </div>
  );
}
