"use client";

import { Button, Notice, Panel, Table } from "@ondo/ui";
import { Info } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { OrderCards } from "./OrderCards";
import { OrderLegList } from "./OrderLegList";
import { OrderListToolbar } from "./OrderListToolbar";
import { OrderStatusBadge } from "./OrderStatusBadge";
import { ReorderDialog } from "./ReorderDialog";
import { LIST_HEADERS, ORDERS_TEXT } from "../constants";
import {
  formatSheets,
  formatWon,
  isOrderFilterEmpty,
  filterOrders,
  orderStatus,
  orderTotals,
  orderWholesalers,
  ordersHref,
  shipmentProgress,
  sortOrders,
  wholesalerLabel,
  withCancel,
} from "../derive";
import { useCanceledOrders } from "../store";
import type { OrderFilter, OrderLine, OrderRecord, OrderSort } from "../types";

/** 표 열 수 = 펼침 열(1) + 목록 열(7). 확장행 `colSpan`이 이 값과 어긋나면 열이 밀린다 */
const COLUMN_COUNT = 8;

/**
 * 주문 내역 한 장.
 *
 * **필터 3축·정렬·펼침이 전부 주소에 있다.** 화면 안 `useState`로 두면 상세를
 * 한 번 열어 보고 뒤로 왔을 때 좁혀 둔 조건과 펼침이 통째로 사라진다 —
 * 지난 주문을 훑다가 하나 열어 보는 것이 이 화면의 기본 동선이라 매번 겪는다.
 * 서버가 첫 HTML에 이미 반영해서 그리므로 하이드레이션을 기다릴 필요도 없다.
 *
 * **표에 뜨는 행과 툴바의 `주문 N건`이 같은 배열에서 나온다.** 원본은
 * `주문 12건`인데 표가 5행이었다 — 결과 수는 파생값이지 상수가 아니다.
 */
export function OrderListView({
  orders,
  filter,
  sort,
  open,
  onReorder,
}: {
  /** 지난 주문 전부. 좁히는 것은 이 화면이 한다 */
  orders: readonly OrderRecord[];
  filter: OrderFilter;
  sort: OrderSort;
  open: string | null;
  /** 다시 담을 줄. 장바구니를 만지는 것은 조립부의 몫이다(가정 A10) */
  onReorder: (lines: readonly OrderLine[]) => void;
}) {
  const router = useRouter();
  const [reordering, setReordering] = useState<OrderRecord | null>(null);
  /* 모달을 닫은 뒤 포커스를 돌려 놓을 자리. 표와 카드에 같은 버튼이 한 벌씩
     있어서 어느 쪽을 눌렀는지는 눌린 요소만이 안다(F4) */
  const reorderTrigger = useRef<HTMLElement | null>(null);
  const canceledOrders = useCanceledOrders();

  /* 상세에서 취소한 주문이 목록에서도 `취소됨`으로 서야 한다 — 두 화면이 같은
     주문을 두고 다른 배지를 보이면 어느 쪽을 믿어야 할지 알 수 없다.
     좁히기·정렬 전에 겹쳐야 `상태: 취소됨` 필터에도 걸린다 */
  const effective = orders.map((order) =>
    withCancel(order, canceledOrders.has(order.orderId)),
  );
  const visible = sortOrders(filterOrders(effective, filter), sort);
  const current = { filter, sort, open };

  /* 펼침도 주소에 싣는다. `replace`가 아니라 `push`면 뒤로 가기가 펼침 하나마다
     걸려서 목록을 빠져나갈 수 없다. 표와 카드가 이 하나를 같이 쓴다 */
  const toggleOpen = (orderId: string) =>
    router.replace(
      ordersHref(current, { open: open === orderId ? null : orderId }),
      { scroll: false },
    );

  const openReorder = (order: OrderRecord, trigger: HTMLElement) => {
    reorderTrigger.current = trigger;
    setReordering(order);
  };

  return (
    <div className="mx-auto max-w-wrap">
      <Panel>
        <Panel.Title sub={ORDERS_TEXT.sub}>{ORDERS_TEXT.title}</Panel.Title>

        <OrderListToolbar
          filter={filter}
          sort={sort}
          open={open}
          wholesalers={orderWholesalers(effective)}
          resultCount={visible.length}
          canReset={!isOrderFilterEmpty(filter)}
        />

        {visible.length === 0 ? (
          /* 빈 표만 남기지 않는다 — 왜 비었는지와 다음 행동을 같이 준다 */
          <div className="py-16 text-center">
            <h3 className="text-base font-medium">
              {orders.length === 0
                ? ORDERS_TEXT.noOrders.title
                : ORDERS_TEXT.empty.title}
            </h3>
            <p className="text-muted-foreground text-body mt-1.5">
              {orders.length === 0
                ? ORDERS_TEXT.noOrders.description
                : ORDERS_TEXT.empty.description}
            </p>
            {orders.length === 0 ? null : (
              <Button asChild variant="line" className="mt-3.5">
                <Link href="/orders">{ORDERS_TEXT.reset}</Link>
              </Button>
            )}
          </div>
        ) : (
          <>
            {/* 960px 아래에서는 표를 세로 카드로 갈아끼운다 — 표를 그대로 두면
                페이지 전체가 옆으로 밀려 패널이 화면에서 사라졌다(F1). 값·라벨·
                펼침은 두 벌이 같은 곳에서 읽는다 */}
            <div className="hidden tablet:block">
              <OrderCards
                orders={visible}
                open={open}
                onToggle={toggleOpen}
                onReorder={openReorder}
              />
            </div>

            <div className="tablet:hidden">
              <Table>
                <caption className="sr-only">
                  지난 주문 목록. 통합 주문번호를 누르면 주문 상세로 갑니다
                </caption>
                <Table.Head>
                  <Table.Row>
                    {/* `relative`가 붙은 이유가 폭이다. `sr-only`는 절대 위치인데
                        `Table.Th`에 위치 기준이 없으면 이 span의 컨테이닝 블록이
                        표의 가로 스크롤 상자를 **건너뛰고** 바깥으로 잡힌다. 그러면
                        표는 자기 상자 안에서 스크롤하는데도 페이지 전체가 옆으로
                        밀린다(390px에서 문서 폭 640px · F1). 기준을 th로 못박아
                        스크롤 상자 안에 가둔다 */}
                    <Table.Th align="center" className="relative w-8">
                      <span className="sr-only">{LIST_HEADERS.expand}</span>
                    </Table.Th>
                    <Table.Th align="left">{LIST_HEADERS.ordered}</Table.Th>
                    <Table.Th align="left">{LIST_HEADERS.wholesaler}</Table.Th>
                    <Table.Th>{LIST_HEADERS.sheets}</Table.Th>
                    <Table.Th>{LIST_HEADERS.amount}</Table.Th>
                    <Table.Th align="center">{LIST_HEADERS.status}</Table.Th>
                    {/* 열 이름이 무엇을 세는지 말한다 — `3건 중 2건`의 `건`은
                        도매처 건이다(F8) */}
                    <Table.Th align="center">{LIST_HEADERS.shipment}</Table.Th>
                    <Table.Th align="center" className="relative">
                      <span className="sr-only">{LIST_HEADERS.reorder}</span>
                    </Table.Th>
                  </Table.Row>
                </Table.Head>

                <Table.Body>
                  {visible.map((order) => {
                    const totals = orderTotals(order);
                    const status = orderStatus(order);
                    const progress = shipmentProgress(order);
                    const seller = wholesalerLabel(order);
                    const expanded = open === order.orderId;

                    return (
                      <Table.ExpandableRow
                        key={order.orderId}
                        open={expanded}
                        onToggle={() => toggleOpen(order.orderId)}
                        colSpan={COLUMN_COUNT}
                        label={order.orderId}
                        detailId={`order-detail-${order.orderId}`}
                        detail={<OrderLegList order={order} />}
                      >
                        <Table.Td align="left">
                          <div>{order.orderedAt.slice(0, 10)}</div>
                          {/* 상세로 가는 링크는 **한 행에 이것 하나**다. 행 전체를
                              링크로 감싸면 같은 목적지가 한 줄에 둘이 된다 */}
                          <Link
                            href={`/orders/${order.orderId}`}
                            onClick={(event) => event.stopPropagation()}
                            className="text-muted-foreground hover:text-foreground text-body tabular-nums underline-offset-4 hover:underline"
                          >
                            {order.orderId}
                          </Link>
                        </Table.Td>

                        <Table.Td align="left">
                          {seller.head}{" "}
                          {seller.rest ? (
                            <span className="text-muted-foreground">
                              {seller.rest}
                            </span>
                          ) : null}
                        </Table.Td>

                        <Table.Td>{formatSheets(totals.sheets)}</Table.Td>
                        <Table.Td>{formatWon(totals.amount)}</Table.Td>

                        <Table.Td align="center">
                          <OrderStatusBadge status={status} />
                        </Table.Td>

                        <Table.Td
                          align="center"
                          tone={progress.planned === 0 ? "muted" : "default"}
                        >
                          {progress.planned === 0
                            ? "—"
                            : `${progress.planned}건 중 ${progress.done}건`}
                        </Table.Td>

                        <Table.Td align="center">
                          <Button
                            variant="line"
                            size="sm"
                            onClick={(event) => {
                              event.stopPropagation();
                              openReorder(order, event.currentTarget);
                            }}
                          >
                            {ORDERS_TEXT.reorder}
                          </Button>
                        </Table.Td>
                      </Table.ExpandableRow>
                    );
                  })}
                </Table.Body>
              </Table>
            </div>
          </>
        )}

        <Notice className="mt-6">
          <span className="flex items-start gap-2">
            <Info aria-hidden className="mt-0.5 size-4 shrink-0" />
            {ORDERS_TEXT.rule}
          </span>
        </Notice>
      </Panel>

      {reordering ? (
        <ReorderDialog
          order={reordering}
          open
          onOpenChange={(next) => {
            if (!next) setReordering(null);
          }}
          onCloseFocus={() => reorderTrigger.current?.focus()}
          onAdd={onReorder}
        />
      ) : null}
    </div>
  );
}
