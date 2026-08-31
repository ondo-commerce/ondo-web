"use client";

import { Panel } from "@ondo/ui";
import { Heart } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { CatalogEmpty, ResultCount } from "./CatalogSection";
import { filterChipClass, SortDropdown } from "./FilterDropdown";
import { ProductGrid } from "./ProductGrid";
import {
  FILTER_ALL,
  FILTER_ALL_LABEL,
  SORT_LABEL,
  WISHLIST_SORTS,
} from "../constants";
import {
  availableWholesalers,
  filterBySeller,
  sortProducts,
  wishlistHref,
} from "../derive";
import { useFavorites } from "../useFavorites";
import type { CatalogProduct, CatalogSort } from "../types";

const DEFAULT_SORT: CatalogSort = "favorited-desc";

/**
 * 찜 목록.
 *
 * 도매처 필터가 **드롭다운이 아니라 즉시 토글 칩**이다(원본 `.fbtn`에 chevron이
 * 없다). 찜한 도매처는 보통 서넛이라 한 번 더 눌러 여는 것이 손해다.
 *
 * **하트를 꺼도 카드가 목록에서 사라지지 않는다**(게이트 Q7). 즉시 제거는
 * 되돌릴 수 없고, 잘못 눌렀을 때 무엇이 사라졌는지조차 남지 않는다. 목록에
 * 남는 기준은 **이 화면에 들어온 순간의 찜 집합**(`pinned`)이고, 나갔다 오면
 * 그때 빠진다 — 게이트 Q7의 후반이 여기서 지켜진다.
 *
 * 기준을 더미의 `favorited` 고정값으로 두면 안 된다. 그러면 사장이 끈 사실이
 * 나갔다 오는 순간 사라지고 하트가 도로 켜져서, 정리가 영영 불가능하다.
 * 대신 목록이 받는 것은 **찜한 것**이 아니라 카탈로그 전부다 — 홈에서 새로
 * 찜한 상품도 다음에 들어올 때 여기 서야 한다.
 */
export function WishlistView({
  products,
  seller,
  sort,
}: {
  /** 카탈로그 전부. 무엇이 목록에 서는지는 이 화면이 찜 집합으로 정한다 */
  products: readonly CatalogProduct[];
  seller: string;
  sort: CatalogSort;
}) {
  const { favorites, toggleFavorite } = useFavorites();

  /* 들어온 순간의 찜 집합을 붙잡아 둔다. 여기서 하트를 꺼도 이 집합은 안 바뀌니
     카드가 그 자리에 남고, 다음에 들어올 때 새 집합으로 다시 만들어지면서 빠진다 */
  const [pinned] = useState(favorites);
  const inList = products.filter((p) => pinned.has(p.id));

  const sellers = availableWholesalers(inList);

  const chips = [
    { id: FILTER_ALL, name: FILTER_ALL_LABEL },
    ...sellers.map((w) => ({ id: w.id, name: w.name })),
  ];

  /* 주소에 실려 온 도매처가 지금 목록에 없으면(찜을 다 끄고 북마크를 여는 경우)
     `전체`로 떨어뜨린다 — 안 그러면 0건 화면에서 어느 칩도 켜져 있지 않아
     왜 비었는지 화면이 말하지 않는다 */
  const activeSeller = chips.some((c) => c.id === seller) ? seller : FILTER_ALL;
  const visible = sortProducts(filterBySeller(inList, activeSeller), sort);

  const sortOptions = WISHLIST_SORTS.map((value) => ({
    value,
    label: SORT_LABEL[value],
    href: wishlistHref(activeSeller, value, DEFAULT_SORT),
  }));

  return (
    <Panel>
      <Panel.Title sub="최근 찜한 순으로 보여줘요. 시즌이 끝난 상품은 잠기지만 목록에는 남아 있어요.">
        찜 목록
      </Panel.Title>

      {inList.length === 0 ? (
        <EmptyWishlist />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2 pb-3">
            {/* 칩 목록을 **찜한 상품에서 만든다** — 고정 목록으로 두면 찜한 게
                하나도 없는 도매처 칩이 나오고, 눌러 보면 0건이다 */}
            {chips.map((chip) => (
              <Link
                key={chip.id}
                href={wishlistHref(chip.id, sort, DEFAULT_SORT)}
                aria-current={chip.id === activeSeller ? "true" : undefined}
                className={filterChipClass(chip.id === activeSeller)}
              >
                {chip.name}
              </Link>
            ))}

            <div className="ml-auto flex items-center gap-3 phone:ml-0 phone:w-full phone:justify-between">
              <ResultCount
                noun="찜한 상품"
                visible={visible.length}
                total={visible.length}
              />
              <SortDropdown
                options={sortOptions}
                value={sort}
                selectedLabel={SORT_LABEL[sort]}
              />
            </div>
          </div>

          {visible.length === 0 ? (
            <CatalogEmpty
              resetHref={wishlistHref(FILTER_ALL, sort, DEFAULT_SORT)}
              filtered
            />
          ) : (
            <>
              <div className="bg-border -mx-4 h-px" />
              <ProductGrid
                products={visible}
                favorites={favorites}
                onToggleFavorite={toggleFavorite}
              />
            </>
          )}
        </>
      )}
    </Panel>
  );
}

/** 찜이 한 건도 없을 때. 문구는 게이트 Q6 확정본이다 */
function EmptyWishlist() {
  return (
    <div className="flex flex-col items-center gap-1.5 px-5 py-16 text-center">
      <span className="bg-secondary text-border-strong mb-1.5 grid size-11 place-items-center rounded-full">
        <Heart aria-hidden className="size-5" />
      </span>
      <h3 className="text-base font-medium">찜한 상품이 없어요.</h3>
      <p className="text-muted-foreground text-body">
        마음에 드는 상품의 하트를 눌러 모아 두세요.
      </p>
    </div>
  );
}
