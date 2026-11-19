"use client";

import { Button, KeyValue, Panel } from "@ondo/ui";
import { ChevronRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { CatalogSection } from "./CatalogSection";
import { TRADE_STATS_UNAVAILABLE, WHOLESALER_HOME_AXES } from "../constants";
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
  inquiryAction,
  inquiryNotice,
}: {
  wholesaler: Wholesaler;
  /**
   * 머리의 `문의하기`(loop-05a)와 실패 한 줄 자리. 거래 이력과 상관없이 선다(Q2) — 첫 주문 전에
   * 재고를 묻는 사장에게 거래 이력이 있을 리 없다. 채팅은 다른 feature라 `app/`이 끼운다
   */
  inquiryAction?: ReactNode;
  inquiryNotice?: ReactNode;
  /**
   * 거래 지표. 원본은 `features/settlement`의 `GET /settlements`이고 `app/`이 이
   * 도매처 줄을 찾아 넘긴다(F1). **거래한 적 없는 것(`null`)과 아직 알 수 없는 것
   * (`unavailable`)이 다르다** — 뒤쪽을 0으로 그리면 미수가 있는 도매처가 깨끗해
   * 보인다(#183).
   */
  tradeStats: TradeStatsSlot;
  /** 이 도매처가 마켓에 올린 상품 — 도매처 id와 선택 조건에 맞는 현재 페이지 */
  products: readonly CatalogProduct[];
  filter: CatalogFilter;
  options: CatalogOptions;
  paging: CatalogPaging;
}) {
  const { favorites, toggleFavorite } = useFavorites();
  /* 거래 이력이 **확인된** 도매처만. 알 수 없는 상태를 이력 있음으로 읽지 않는다 */
  const traded = tradeStats.status === "ready" ? tradeStats.stats : null;

  const paidAt = traded?.lastPaidAt?.slice(0, 10).replaceAll("-", ".");

  return (
    <>
      <Panel>
        <nav
          aria-label="위치"
          className="text-muted-foreground text-body mb-3 flex items-center gap-1"
        >
          <Link href="/" className="hover:text-foreground">
            홈
          </Link>
          <ChevronRight aria-hidden className="text-border-strong size-3.5" />
          <span className="text-foreground">{wholesaler.name}</span>
        </nav>

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
          <div className="ml-auto flex flex-wrap items-center gap-2 phone:ml-0">
            {traded ? (
              <Button asChild variant="line" size="sm">
                <Link href="/wholesalers">거래처에서 보기</Link>
              </Button>
            ) : null}
            {inquiryAction}
          </div>
        </div>
        {inquiryNotice}

        <div className="flex flex-wrap gap-x-6 gap-y-3">
          <KeyValue amounts>
            <KeyValue.Row term="미결제 잔액">
              {tradeStats.status === "unavailable"
                ? TRADE_STATS_UNAVAILABLE.value
                : formatUnpaid(traded?.balance ?? 0)}
            </KeyValue.Row>
          </KeyValue>
          {tradeStats.status === "ready" && (
            <KeyValue>
              <KeyValue.Row term="마지막 입금">
                <span className="tabular-nums">{paidAt ?? "—"}</span>
              </KeyValue.Row>
            </KeyValue>
          )}
        </div>
        {tradeStats.status === "unavailable" && (
          <p className="text-body text-destructive-strong mt-2" role="status">
            미결제 잔액을 {TRADE_STATS_UNAVAILABLE.sub}.
          </p>
        )}
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
