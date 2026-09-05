"use client";

import { Button, Panel } from "@ondo/ui";
import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { StatCards, type StatCard } from "@/shared/components/StatCards";
import { ongoingCount, type TradeStats } from "@/shared/tradeStats";
import { CatalogSection } from "./CatalogSection";
import { formatUnpaid } from "../derive";
import { useFavorites } from "../useFavorites";
import type {
  CatalogFilter,
  CatalogOptions,
  CatalogPaging,
  CatalogProduct,
  Wholesaler,
} from "../types";

/**
 * 도매처 홈 — 머리 + 통계 + `전체 상품`.
 *
 * **카테고리 바가 붙지 않는다.** 이 화면은 `(browse)` 그룹 밖이다 — 한 도매처
 * 안에서 대분류를 훑을 일이 없고, 그 자리는 브레드크럼과 아래 필터가 받는다.
 *
 * fixtures 시절의 `신상`(최근 7일)이 없다 — 목록 응답에 게시일이 없다. 머리의
 * 위치·영업시간, 통계의 `누적 주문`도 스펙에 없어 자리를 비웠다(`04-wire.md` §3).
 *
 * 찜 상태는 화면 밖 세션 저장소(`useFavorites`)가 갖는다 — 상품 상세를 갔다
 * 오면 켠 하트가 도로 꺼지지 않게.
 */
export function WholesalerHomeView({
  wholesaler,
  tradeStats,
  products,
  filter,
  options,
  paging,
}: {
  wholesaler: Wholesaler;
  /**
   * 거래 지표. **거래한 적 없는 도매처는 null**이다 — 0과 다르다.
   * 원본은 `features/settlement`의 거래 원장이고 `app/`이 합쳐서 넘긴다(F1).
   */
  tradeStats: TradeStats | null;
  /** 이 도매처가 마켓에 올린 상품 — 서버가 준 첫 장에서 도매처 id로 거른 것 */
  products: readonly CatalogProduct[];
  filter: CatalogFilter;
  options: CatalogOptions;
  paging: CatalogPaging;
}) {
  const { favorites, toggleFavorite } = useFavorites();

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
          </div>
          {/* 거래한 적 없는 도매처에서는 이 버튼을 감춘다. `/wholesalers`는 거래
              이력이 있는 곳만 서는 목록이라(§3-0 A), 누르면 방금 보던 도매처가
              없는 표로 떨어진다 — 사장이 목록을 뒤지다 만다(F9) */}
          {tradeStats ? (
            <div className="ml-auto phone:ml-0">
              <Button asChild variant="line" size="sm">
                <Link href="/wholesalers">거래처에서 보기</Link>
              </Button>
            </div>
          ) : null}
        </div>

        <StatCards cards={statCardsOf(tradeStats)} />
      </Panel>

      <div className="mt-2">
        <Panel>
          <Panel.Title>전체 상품</Panel.Title>
          {/* 가격대 필터가 없다 — 한 도매처 안이라 가격 폭이 좁아 축이 안 나뉜다 */}
          <CatalogSection
            basePath={`/wholesalers/${wholesaler.id}`}
            products={products}
            filter={filter}
            options={options}
            paging={paging}
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
 * 통계 2칸이 쓸 값. fixtures 시절의 `누적 주문`은 스펙에 없어 뺐다.
 *
 * 나머지 둘은 `features/settlement`의 거래 원장에서 온 값이라, 거래처 관리 표와
 * 글자 그대로 같은 말을 한다. 예전에는 여기서 따로 적어서 무드온이 두 화면에서
 * 다르게 읽혔다(F1 · #128).
 *
 * `tradeStats`가 null이면 **거래한 적 없는 도매처**다. 0건·0원으로 세우되 그건
 * 계산 결과가 아니라 "거래가 없다"는 뜻이다(#122 AC19).
 */
function statCardsOf(tradeStats: TradeStats | null): StatCard[] {
  return [
    {
      label: "진행 중",
      /* 합을 따로 들고 있지 않다 — `확정 대기 + 미송`을 여기서 더한다 */
      value: `${tradeStats ? ongoingCount(tradeStats) : 0}건`,
      sub: `확정 대기 ${tradeStats?.pendingCount ?? 0} · 미송 ${tradeStats?.backorderCount ?? 0}`,
    },
    {
      label: "미결제 잔액",
      value: formatUnpaid(tradeStats?.balance ?? 0),
      /* 소매는 금액을 보기만 하고 입금 등록 권한이 없다(RT-63).
         입금한 적이 없으면 `—`다 — 없는 날짜를 지어내지 않는다 */
      sub: `마지막 입금 ${tradeStats?.lastPaidAt ? tradeStats.lastPaidAt.replaceAll("-", ".") : "—"}`,
    },
  ];
}
