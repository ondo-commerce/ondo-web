"use client";

import { Panel, SearchInput } from "@ondo/ui";
import { useState } from "react";
import { OrderFilterChips } from "./OrderFilterChips";
import { OrderLineTable } from "./OrderLineTable";
import { OrderSummaryCard } from "./OrderSummaryCard";
import { OrderTable } from "./OrderTable";
import { STATUS_FILTER_ALL } from "../constants";
import {
  cancelOrder,
  clampShipInput,
  confirmOrder,
  matchesQuery,
} from "../derive";
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
export function OrderListView({
  orders: initialOrders,
}: {
  orders: readonly Order[];
}) {
  /*
   * 확정·취소·포장은 서버가 없어서 로컬 상태로 반영한다(재고 탭 입고와 같은 방식).
   * **새로고침하면 더미 초기값으로 돌아가는 게 정상이다.**
   */
  const [orders, setOrders] = useState(initialOrders);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    OrderStatus | typeof STATUS_FILTER_ALL
  >(STATUS_FILTER_ALL);
  /** 펼친 주문. 한 번에 하나만 펼친다 — 우측 카드가 한 장뿐이기 때문이다 */
  const [openOrderId, setOpenOrderId] = useState<string | null>(null);
  /**
   * `이번 출고` 입력값(라인 id → 문자열).
   * 라인 표가 아니라 여기에 둔다 — 우측 카드의 `주문 확정`과 표 하단의 `포장 준비`가
   * 같은 입력을 읽어야 해서, 표 안에 가둬 두면 카드에서 볼 수 없다.
   */
  const [shipInputs, setShipInputs] = useState<Record<string, string>>({});

  const keyword = query.trim();
  const visibleOrders = orders.filter(
    (order) =>
      (statusFilter === STATUS_FILTER_ALL || order.status === statusFilter) &&
      matchesQuery(order, keyword),
  );

  const openOrder = visibleOrders.find((o) => o.id === openOrderId) ?? null;

  /* 다른 주문을 펼치면 앞 주문의 입력값을 버린다 — 라인 id가 달라 섞이진 않지만,
     화면에서 사라진 값이 뒤에 남아 있으면 확정 때 무엇이 반영될지 읽히지 않는다 */
  const toggleOrder = (orderId: string) => {
    setOpenOrderId((prev) => (prev === orderId ? null : orderId));
    setShipInputs({});
  };

  /* 필터·검색을 바꾸면 펼침을 푼다. 안 그러면 목록에서 사라진 주문의 카드가 우측에 남는다 */
  const changeStatusFilter = (next: OrderStatus | typeof STATUS_FILTER_ALL) => {
    setStatusFilter(next);
    setOpenOrderId(null);
    setShipInputs({});
  };

  const changeQuery = (next: string) => {
    setQuery(next);
    setOpenOrderId(null);
    setShipInputs({});
  };

  /**
   * 숫자가 아닌 문자는 애초에 들어가지 않고, `min(미할당, 가용재고)`를 넘기면 잘린다.
   * 넘겨서 받아 두면 확정 순간에 항등식이 깨진 주문이 만들어진다.
   */
  const changeShipInput = (lineId: string, raw: string) => {
    const line = openOrder?.lines.find((l) => l.id === lineId);
    const next = line ? clampShipInput(line, raw) : "";
    setShipInputs((prev) => ({ ...prev, [lineId]: next }));
  };

  /** 확정·취소는 주문 하나만 갈아 끼운다. 입력값은 반영이 끝났으니 비운다 */
  const replaceOrder = (next: Order) => {
    setOrders((prev) => prev.map((o) => (o.id === next.id ? next : o)));
    setShipInputs({});
  };

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
              onChange={(e) => changeQuery(e.target.value)}
            />
          </div>

          <OrderFilterChips
            orders={orders}
            value={statusFilter}
            onChange={changeStatusFilter}
          />

          {/* 검색줄·칩 줄은 남고 행만 흐른다 — 화면 전체 스크롤이 없다 */}
          <Panel.Body>
            {visibleOrders.length === 0 ? (
              <p className="text-muted-foreground py-12 text-center text-sm">
                검색 결과가 없습니다
              </p>
            ) : (
              <OrderTable
                orders={visibleOrders}
                openOrderId={openOrder?.id ?? null}
                onToggle={toggleOrder}
                renderDetail={(order) => (
                  <OrderLineTable
                    order={order}
                    inputs={shipInputs}
                    onInputChange={changeShipInput}
                  />
                )}
              />
            )}
          </Panel.Body>
        </Panel>
      }
      detail={
        openOrder ? (
          <OrderSummaryCard
            order={openOrder}
            inputs={shipInputs}
            onConfirm={() => replaceOrder(confirmOrder(openOrder, shipInputs))}
            onCancel={() => replaceOrder(cancelOrder(openOrder))}
          />
        ) : undefined
      }
      /* 아무것도 안 펼쳤을 때 우측은 빈 자리로 둔다 — 흰 패널을 그리지 않는다 */
      emptyDetail={null}
    />
  );
}
