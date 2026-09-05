"use client";

import { Panel } from "@ondo/ui";
import { Heart } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { CatalogEmpty, ResultCount } from "./CatalogSection";
import { filterChipClass, SortDropdown } from "./FilterDropdown";
import { ProductGrid } from "./ProductGrid";
import { useFavoriteListings } from "../api/queries";
import {
  FILTER_ALL,
  FILTER_ALL_LABEL,
  SORT_LABEL,
  WISHLIST_SORTS,
} from "../constants";
import {
  availableWholesalers,
  favoriteListingIds,
  filterBySeller,
  sortWishlist,
  wishlistHref,
} from "../derive";
import { useFavorites } from "../useFavorites";
import type { CatalogSort } from "../types";

const DEFAULT_SORT: CatalogSort = "favorited-desc";

/**
 * 찜 목록.
 *
 * **소매에서 유일하게 브라우저가 목록을 받는 화면이다.** 찜 집합이 브라우저
 * 세션에만 있어(서버에 찜 API가 없다) 서버 컴포넌트가 무엇을 받을지 모른다.
 * 그래서 찜한 id마다 `GET /listings/{id}`를 부른다(`api/queries.ts`).
 *
 * 도매처 필터가 **드롭다운이 아니라 즉시 토글 칩**이다(원본 `.fbtn`에 chevron이
 * 없다). 찜한 도매처는 보통 서넛이라 한 번 더 눌러 여는 것이 손해다.
 *
 * **하트를 꺼도 카드가 목록에서 사라지지 않는다**(게이트 Q7). 즉시 제거는
 * 되돌릴 수 없고, 잘못 눌렀을 때 무엇이 사라졌는지조차 남지 않는다. 목록에
 * 남는 기준은 **이 화면에 들어온 순간의 찜 집합**(`pinned`)이고, 나갔다 오면
 * 그때 빠진다 — 게이트 Q7의 후반이 여기서 지켜진다.
 */
export function WishlistView({
  seller,
  sort,
}: {
  seller: string;
  sort: CatalogSort;
}) {
  const { favorites, toggleFavorite } = useFavorites();

  /* 들어온 순간의 찜 집합을 붙잡아 둔다. 여기서 하트를 꺼도 이 집합은 안 바뀌니
     카드가 그 자리에 남고, 다음에 들어올 때 새 집합으로 다시 만들어지면서 빠진다 */
  const [pinned] = useState(favorites);
  const { products, pending, missing } = useFavoriteListings(
    favoriteListingIds(pinned),
  );

  const sellers = availableWholesalers(products);

  const chips = [
    { id: FILTER_ALL, name: FILTER_ALL_LABEL },
    ...sellers.map((w) => ({ id: w.id, name: w.name })),
  ];

  /* 주소에 실려 온 도매처가 지금 목록에 없으면(찜을 다 끄고 북마크를 여는 경우)
     `전체`로 떨어뜨린다 — 안 그러면 0건 화면에서 어느 칩도 켜져 있지 않아
     왜 비었는지 화면이 말하지 않는다 */
  const activeSeller = chips.some((c) => c.id === seller) ? seller : FILTER_ALL;
  const visible = sortWishlist(
    filterBySeller(products, activeSeller),
    [...pinned],
    sort,
  );

  const sortOptions = WISHLIST_SORTS.map((value) => ({
    value,
    label: SORT_LABEL[value],
    href: wishlistHref(activeSeller, value, DEFAULT_SORT),
  }));

  return (
    <Panel>
      <Panel.Title sub="최근 찜한 순으로 보여줘요. 새로고침하면 찜이 비워져요 — 아직 서버에 저장되지 않아요.">
        찜 목록
      </Panel.Title>

      {/* 아직 답이 안 온 동안. 카드 자리를 비워 두면 "찜한 게 없다"로 읽힌다 */}
      {pending ? (
        <p role="status" className="text-muted-foreground text-body py-4">
          찜한 상품을 불러오는 중이에요.
        </p>
      ) : null}

      {/* 게시가 내려간 상품은 상세가 404라 카드로 못 그린다. 조용히 빼면 찜한
          수와 카드 수가 어긋나 보이므로 빠진 수를 말한다 */}
      {missing > 0 ? (
        <p role="status" className="text-muted-foreground text-body pb-3">
          찜한 상품 {missing}개는 지금 게시돼 있지 않아 목록에서 빠졌어요.
        </p>
      ) : null}

      {!pending && pinned.size === 0 ? (
        <EmptyWishlist />
      ) : !pending && products.length === 0 ? null : (
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
