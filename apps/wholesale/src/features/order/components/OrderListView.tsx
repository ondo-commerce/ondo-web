"use client";

import { Panel, SearchInput } from "@ondo/ui";
import { useState } from "react";
import { OrderFilterChips } from "./OrderFilterChips";
import { OrderTable } from "./OrderTable";
import { STATUS_FILTER_ALL } from "../constants";
import { matchesQuery } from "../derive";
import type { Order, OrderStatus } from "../types";
import { ListDetailLayout } from "@/shared/components/ListDetailLayout";

/**
 * 주문 관리 — 좌 목록 + 우 주문 카드.
 *
 * 다른 탭과 같은 2단 배치다(ListDetailLayout). 다른 점은 하나뿐 —
 * **아무 행도 펼치지 않았을 때 우측에 안내 패널을 그리지 않는다**(`emptyDetail={null}`).
 * 목록 폭은 펼치든 안 펼치든 그대로다(01-pm.md §1.0 실측).
 *
 * 상태 필터와 검색은 함께 걸린다. 필터 칩의 건수만은 전체 목록 기준으로 고정이다 —
 * 지금 안 보이는 게 몇 건인지 읽혀야 하기 때문이다.
 *
 * 선택 상태는 URL에 두지 않는다 (docs/12-routing 규칙 3-A).
 *
 * 데이터는 전부 더미라 로딩·에러 상태가 없다. 서버가 붙으면 목록을 받는 자리(orders prop)에서
 * 세 상태를 갈라야 한다.
 */
export function OrderListView({ orders }: { orders: readonly Order[] }) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    OrderStatus | typeof STATUS_FILTER_ALL
  >(STATUS_FILTER_ALL);

  const keyword = query.trim();
  const visibleOrders = orders.filter(
    (order) =>
      (statusFilter === STATUS_FILTER_ALL || order.status === statusFilter) &&
      matchesQuery(order, keyword),
  );

  return (
    <ListDetailLayout
      list={
        <Panel className="flex-1">
          <Panel.Title>주문 관리</Panel.Title>
          <div className="mb-4 shrink-0">
            <SearchInput
              placeholder="주문번호·거래처·품명 검색"
              aria-label="주문번호·거래처·품명 검색"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>

          <OrderFilterChips
            orders={orders}
            value={statusFilter}
            onChange={setStatusFilter}
          />

          {/* 검색줄·칩 줄은 남고 행만 흐른다 — 화면 전체 스크롤이 없다 */}
          <Panel.Body>
            {visibleOrders.length === 0 ? (
              <p className="text-muted-foreground py-12 text-center text-sm">
                검색 결과가 없습니다
              </p>
            ) : (
              <OrderTable orders={visibleOrders} />
            )}
          </Panel.Body>
        </Panel>
      }
      /* 아무것도 안 펼쳤을 때 우측은 빈 자리로 둔다 — 흰 패널을 그리지 않는다 */
      emptyDetail={null}
    />
  );
}
