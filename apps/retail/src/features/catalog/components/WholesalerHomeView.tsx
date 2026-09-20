"use client";

import { Button, Panel } from "@ondo/ui";
import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { StatCards, type StatCard } from "@/shared/components/StatCards";
import { CatalogSection } from "./CatalogSection";
import { TRADE_STATS_PENDING, WHOLESALER_HOME_AXES } from "../constants";
import { formatUnpaid } from "../derive";
import { useFavorites } from "../useFavorites";
import type {
  CatalogFilter,
  CatalogOptions,
  CatalogPaging,
  CatalogProduct,
  TradeStatsSlot,
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
   * 거래 지표. 원본은 `features/settlement`의 `GET /settlements`이고 `app/`이 이
   * 도매처 줄을 찾아 넘긴다(F1). **거래한 적 없는 것(`null`)과 아직 알 수 없는 것
   * (`unavailable`)이 다르다** — 뒤쪽을 0으로 그리면 미수가 있는 도매처가 깨끗해
   * 보인다(#183).
   */
  tradeStats: TradeStatsSlot;
  /** 이 도매처가 마켓에 올린 상품 — 서버가 준 첫 장에서 도매처 id로 거른 것 */
  products: readonly CatalogProduct[];
  filter: CatalogFilter;
  options: CatalogOptions;
  paging: CatalogPaging;
}) {
  const { favorites, toggleFavorite } = useFavorites();
  /* 거래 이력이 **확인된** 도매처만. 알 수 없는 상태를 이력 있음으로 읽지 않는다 */
  const traded = tradeStats.status === "ready" ? tradeStats.stats : null;

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
          {traded ? (
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
          {/* 가격대 필터가 없다 — 한 도매처 안이라 가격 폭이 좁아 축이 안 나뉜다.
              감추는 축은 `page.tsx`가 주소를 읽을 때 쓰는 것과 같은 상수다 —
              드롭다운만 감추면 `?price=`가 주소로 걸린다(#181) */}
          <CatalogSection
            basePath={`/wholesalers/${wholesaler.id}`}
            products={products}
            filter={filter}
            options={options}
            paging={paging}
            showPriceFilter={WHOLESALER_HOME_AXES.price}
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
 * `미결제 잔액`은 `features/settlement`의 `GET /settlements`에서 온 값이라, 거래처
 * 관리 표·정산 표와 글자 그대로 같은 말을 한다. 예전에는 여기서 따로 적어서
 * 무드온이 두 화면에서 다르게 읽혔다(F1 · #128).
 *
 * `진행 중`은 **늘 `준비 중`이다** — 확정 대기·미송 건수를 도매처별로 주는 소매
 * API가 없다(#240). 0건으로 세우면 진행 중인 주문이 있는 도매처가 한가해 보인다.
 * 서버가 주면 이 카드만 실값으로 바꾼다.
 *
 * `stats`가 null이면 **거래한 적 없는 도매처**다. 0원으로 세우되 그건 계산
 * 결과가 아니라 "거래가 없다"는 뜻이다(#122 AC19).
 *
 * `unavailable`이면 숫자를 안 적는다 — 정산 요청이 실패한 것이지 거래가 없는 게
 * 아니다. 0으로 세우면 거래 없음으로 읽힌다(#183).
 */
function statCardsOf(slot: TradeStatsSlot): StatCard[] {
  const ongoing: StatCard = { label: "진행 중", ...TRADE_STATS_PENDING };

  if (slot.status === "unavailable") {
    return [ongoing, { label: "미결제 잔액", ...TRADE_STATS_PENDING }];
  }

  const { stats: tradeStats } = slot;

  return [
    ongoing,
    {
      label: "미결제 잔액",
      value: formatUnpaid(tradeStats?.balance ?? 0),
      /* 소매는 금액을 보기만 하고 입금 등록 권한이 없다(RT-63).
         입금한 적이 없으면 `—`다 — 없는 날짜를 지어내지 않는다 */
      sub: `마지막 입금 ${tradeStats?.lastPaidAt ? tradeStats.lastPaidAt.slice(0, 10).replaceAll("-", ".") : "—"}`,
    },
  ];
}
