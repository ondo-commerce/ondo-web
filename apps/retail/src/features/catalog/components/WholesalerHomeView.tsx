"use client";

import { Button, Panel } from "@ondo/ui";
import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { CatalogSection } from "./CatalogSection";
import { ProductGrid } from "./ProductGrid";
import { LIST_SORTS } from "../constants";
import { formatWon, newArrivals } from "../derive";
import { useFavorites } from "../useFavorites";
import type {
  CatalogFilter,
  CatalogProduct,
  CatalogSort,
  Wholesaler,
} from "../types";

/**
 * 도매처 홈 — 머리 + 통계 3칸 + `신상` + `전체 상품`.
 *
 * **카테고리 바가 붙지 않는다.** 이 화면은 `(browse)` 그룹 밖이다 — 한 도매처
 * 안에서 8개 대분류를 훑을 일이 없고, 그 자리는 브레드크럼과 아래 필터가 받는다.
 *
 * 찜 상태는 화면 밖 세션 저장소(`useFavorites`)가 갖는다. 같은 상품이 `신상`과
 * `전체 상품` 양쪽에 나올 수 있어서 격자마다 상태를 두면 한쪽 하트만 켜지고,
 * 상품 상세를 갔다 오면 켠 하트가 도로 꺼진다.
 */
export function WholesalerHomeView({
  wholesaler,
  products,
  newArrivalSince,
  filter,
  sort,
}: {
  wholesaler: Wholesaler;
  /** 이 도매처가 마켓에 올린 상품 전부 */
  products: readonly CatalogProduct[];
  newArrivalSince: string;
  filter: CatalogFilter;
  sort: CatalogSort;
}) {
  const { favorites, toggleFavorite } = useFavorites();
  const fresh = newArrivals(products, newArrivalSince);

  return (
    <>
      <nav
        aria-label="위치"
        className="text-muted-foreground text-body flex items-center gap-1.5 px-1 py-3"
      >
        <Link href="/" className="hover:text-foreground">
          홈
        </Link>
        <ChevronRight aria-hidden className="text-border-strong size-3.5" />
        <span className="text-foreground">{wholesaler.name}</span>
      </nav>

      <Panel>
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <span
            aria-hidden
            className="bg-secondary text-secondary-foreground grid size-11 shrink-0 place-items-center rounded-panel"
          >
            {wholesaler.initial}
          </span>
          <div className="min-w-0">
            <h1 className="text-xl font-medium">{wholesaler.name}</h1>
            <p className="text-muted-foreground text-body mt-1.5">
              {wholesaler.location} · 영업시간 {wholesaler.businessHours}
            </p>
          </div>
          <div className="ml-auto phone:ml-0">
            <Button asChild variant="line" size="sm">
              {/* 거래처 관리 화면 본체는 다음 회차다. 지금은 그 목록까지만 보낸다 */}
              <Link href="/wholesalers">거래처에서 보기</Link>
            </Button>
          </div>
        </div>

        <WholesalerStats wholesaler={wholesaler} />
      </Panel>

      {fresh.length > 0 ? (
        <div className="mt-2">
          <Panel>
            <Panel.Title sub="최근 7일 안에 올라온 상품이에요.">
              신상
            </Panel.Title>
            <ProductGrid
              products={fresh}
              favorites={favorites}
              onToggleFavorite={toggleFavorite}
              columns={4}
            />
          </Panel>
        </div>
      ) : null}

      <div className="mt-2">
        <Panel>
          <Panel.Title>전체 상품</Panel.Title>
          {/* 가격대 필터가 없다 — 한 도매처 안이라 가격 폭이 좁아 축이 안 나뉜다 */}
          <CatalogSection
            basePath={`/wholesalers/${wholesaler.id}`}
            products={products}
            filter={filter}
            sort={sort}
            sorts={LIST_SORTS}
            defaultSort="latest"
            showPriceFilter={false}
            favorites={favorites}
            onToggleFavorite={toggleFavorite}
          />
        </Panel>
      </div>
    </>
  );
}

/**
 * 통계 3칸.
 *
 * **숫자는 전부 더미다.** 누적 주문·진행 중·미결제 잔액의 산식이 도매 정산 모델과
 * §3-D·§3-G에서 끊겨 있어(통합 주문 엔티티·입금 배정 규칙 미결정) 계산할 근거가
 * 없다. 자릿수와 관계(진행 중 = 확정 대기 + 미송)만 맞춰 두고 값은 서버가 준다.
 */
function WholesalerStats({ wholesaler }: { wholesaler: Wholesaler }) {
  const { stats } = wholesaler;

  const cards = [
    { key: "누적 주문", value: `${stats.orderCount}건`, sub: null },
    {
      key: "진행 중",
      value: `${stats.ongoingCount}건`,
      sub: `확정 대기 ${stats.pendingCount} · 미송 ${stats.backorderCount}`,
    },
    {
      key: "미결제 잔액",
      value: formatWon(stats.unpaidAmount),
      /* 소매는 금액을 보기만 하고 입금 등록 권한이 없다(RT-63) */
      sub: `마지막 입금 ${stats.lastPaidAt.replaceAll("-", ".")}`,
    },
  ];

  return (
    <dl className="grid grid-cols-3 gap-2 tablet:grid-cols-1">
      {cards.map(({ key, value, sub }) => (
        <div
          key={key}
          className="border-border rounded-control border px-4 py-3.5"
        >
          <dt className="text-muted-foreground text-body">{key}</dt>
          <dd className="m-0">
            <span className="mt-1.5 block text-xl font-medium tabular-nums">
              {value}
            </span>
            {sub ? (
              <span className="text-muted-foreground mt-1 block text-xs tabular-nums">
                {sub}
              </span>
            ) : null}
          </dd>
        </div>
      ))}
    </dl>
  );
}
