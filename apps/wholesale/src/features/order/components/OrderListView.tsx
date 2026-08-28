"use client";

import { Panel, SearchInput } from "@ondo/ui";
import { useState } from "react";
import { OrderActionBar } from "./OrderActionBar";
import { OrderStatusFilter } from "./OrderStatusFilter";
import { OrderSettlementFilter } from "./OrderSettlementFilter";
import { OrderLineTable } from "./OrderLineTable";
import { OrderSummaryCard } from "./OrderSummaryCard";
import { OrderTable } from "./OrderTable";
import { PackingQueueCard } from "./PackingQueueCard";
import {
  STATUS_FILTER_ALL,
  type OrderFilterValue,
  type SettlementFilterValue,
} from "../constants";
import {
  addPackingBatch,
  cancelOrder,
  clampShipInput,
  confirmOrder,
  isEditablePhase,
  matchesQuery,
  removePackingBatch,
} from "../derive";
import type { Order } from "../types";
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
  const [statusFilter, setStatusFilter] =
    useState<OrderFilterValue>(STATUS_FILTER_ALL);
  /** 정산 상태 필터. 이행 축(statusFilter)과 독립이라 둘이 함께 걸린다 */
  const [settlementFilter, setSettlementFilter] =
    useState<SettlementFilterValue>(STATUS_FILTER_ALL);
  /** 펼친 주문. 한 번에 하나만 펼친다 — 우측 카드가 한 장뿐이기 때문이다 */
  const [openOrderId, setOpenOrderId] = useState<string | null>(null);
  /**
   * `이번 출고` 입력값(라인 id → 문자열).
   *
   * 여기 두는 이유가 바뀌었다 — 원래는 우측 카드의 `주문 확정`이 읽어야 해서였는데,
   * 확정이 펼침 하단(`OrderActionBar`)으로 내려와 지금은 읽는 쪽이 전부 펼침 안에 있다.
   * 그래도 남긴 건 **필터·검색을 바꿀 때 입력을 비워야 하기 때문**이다(아래 change* 참고).
   * 그 리셋까지 아래로 내리면 펼침 영역이 바깥 필터 변화를 알아야 해서 더 얽힌다.
   */
  const [shipInputs, setShipInputs] = useState<Record<string, string>>({});

  const keyword = query.trim();
  const visibleOrders = orders.filter(
    (order) =>
      (statusFilter === STATUS_FILTER_ALL || order.status === statusFilter) &&
      (settlementFilter === STATUS_FILTER_ALL ||
        order.settlementStatus === settlementFilter) &&
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
  const changeStatusFilter = (next: OrderFilterValue) => {
    setStatusFilter(next);
    setOpenOrderId(null);
    setShipInputs({});
  };

  const changeSettlementFilter = (next: SettlementFilterValue) => {
    setSettlementFilter(next);
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
          {/* 툴바 두 줄 — 첫 줄은 검색(과 주 액션), 둘째 줄은 필터.
              한 줄로 두면 검색창 340px + 세그먼트들이 좌측 패널 폭을 넘겨서 제멋대로 접힌다.
              검색은 폭이 고정이고 필터는 칸 수·글자 길이에 따라 변하니, 변하는 쪽만 아래 줄에
              모아 두면 검색창 자리가 탭을 옮겨도 흔들리지 않는다.
              첫 줄의 `mr-auto`는 오른쪽에 주 액션이 붙는 탭(상품·정산)과 규칙을 맞추려는 것이다.
              패널 제목을 두지 않는다. 상단 네비게이션이 이미 어느 탭인지 보여주고 있어서,
              탭 이름을 패널에 한 번 더 쓰면 같은 말이 두 번 나오고 세로만 먹는다 */}
          <div className="mb-3 flex shrink-0 items-center gap-3">
            <SearchInput
              className="mr-auto"
              placeholder="주문번호·거래처·품명 검색"
              aria-label="주문번호·거래처·품명 검색"
              value={query}
              onChange={(e) => changeQuery(e.target.value)}
            />
          </div>

          <div className="mb-4 flex shrink-0 flex-wrap items-center gap-3">
            <OrderStatusFilter
              orders={orders}
              value={statusFilter}
              onChange={changeStatusFilter}
            />
            <OrderSettlementFilter
              value={settlementFilter}
              onChange={changeSettlementFilter}
            />
          </div>

          {/* 검색줄·칩 줄은 남고 행만 흐른다 — 화면 전체 스크롤이 없다.

              이 표만 `Panel.Body`를 쓰지 않는다. 머리글을 sticky로 고정하려면 표 자신이
              세로 스크롤을 받아야 하는데(Table의 stickyHead 주석 참고), Panel.Body가 밖에서
              또 스크롤을 받으면 막대가 두 개 생긴다. 빈 목록일 때는 흐를 것이 없어서
              그대로 Panel.Body를 쓴다 */}
          {visibleOrders.length === 0 ? (
            <Panel.Body>
              <p className="text-muted-foreground py-12 text-center text-sm">
                검색 결과가 없습니다
              </p>
            </Panel.Body>
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
                  /* `이번 출고` 입력을 먹는 액션은 전부 입력 옆에 둔다.
                       어느 버튼이 뜨는지는 국면이 정한다(OrderActionBar).
                       취소·출고 완료는 입력 자체가 없는 국면이라 액션 줄도 없다 */
                  footer={
                    isEditablePhase(order.status) ? (
                      <OrderActionBar
                        order={order}
                        inputs={shipInputs}
                        onConfirm={() =>
                          replaceOrder(confirmOrder(order, shipInputs))
                        }
                        onCancel={() => replaceOrder(cancelOrder(order))}
                        onPack={() =>
                          replaceOrder(addPackingBatch(order, shipInputs))
                        }
                      />
                    ) : undefined
                  }
                />
              )}
            />
          )}
        </Panel>
      }
      detail={
        openOrder ? (
          <>
            <OrderSummaryCard order={openOrder} />
            {/* 회차가 하나도 없으면 카드째 사라진다 */}
            {openOrder.batches.length > 0 ? (
              <PackingQueueCard
                order={openOrder}
                onRemoveBatch={(batchId) =>
                  replaceOrder(removePackingBatch(openOrder, batchId))
                }
              />
            ) : null}
          </>
        ) : undefined
      }
      /* 아무것도 안 펼쳤을 때 우측은 빈 자리로 둔다 — 흰 패널을 그리지 않는다 */
      emptyDetail={null}
    />
  );
}
