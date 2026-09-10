"use client";

import { Button, Notice, Panel, Table } from "@ondo/ui";
import { Info } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { OrderCards } from "./OrderCards";
import { OrderLegList } from "./OrderLegList";
import { OrderListToolbar } from "./OrderListToolbar";
import { OrderPager } from "./OrderPager";
import { OrderStatusBadge } from "./OrderStatusBadge";
import {
  FIRST_PAGE,
  LIST_HEADERS,
  ORDERS_TEXT,
  ORDER_PATH,
} from "../constants";
import {
  filterOrders,
  formatSheets,
  formatWon,
  isOrderFilterEmpty,
  orderWholesalers,
  ordersEmptyKind,
  ordersHref,
  receivedLabel,
  sortOrders,
  summaryWholesalerLabel,
  type OrdersLocation,
} from "../derive";
import type { OrderPage, OrderSummary } from "../types";

/** 표 열 수 = 펼침 열(1) + 목록 열(6). 확장행 `colSpan`이 이 값과 어긋나면 열이 밀린다 */
const COLUMN_COUNT = 7;

/**
 * 주문 내역 한 장. 값은 `GET /orders` 한 장(`size=100`)이다.
 *
 * **필터 3축·정렬·펼침·페이지가 전부 주소에 있다.** 화면 안 `useState`로 두면
 * 상세를 한 번 열어 보고 뒤로 왔을 때 좁혀 둔 조건과 펼침이 통째로 사라진다.
 * 기간은 서버가 거르고(`from`), 도매처·상태는 서버 파라미터가 없어 **받은 장
 * 안에서** 건다(`04-wire.md` §3).
 *
 * **표에 뜨는 행과 툴바의 `주문 N건`이 같은 배열에서 나온다.** 원본은
 * `주문 12건`인데 표가 5행이었다 — 결과 수는 파생값이지 상수가 아니다.
 */
export function OrderListView({
  orders,
  location,
  paging,
}: {
  /** 서버가 준 한 장. 좁히는 것은 이 화면이 한다 */
  orders: readonly OrderSummary[];
  location: OrdersLocation;
  paging: OrderPage;
}) {
  const router = useRouter();
  const { filter, sort, open } = location;

  const visible = sortOrders(filterOrders(orders, filter), sort);
  const empty = ordersEmptyKind({
    received: orders.length,
    visible: visible.length,
    paging,
    filter,
  });
  const emptyCopy =
    empty === "none"
      ? ORDERS_TEXT.noOrders
      : empty === "outOfRange"
        ? ORDERS_TEXT.outOfRange
        : ORDERS_TEXT.empty;

  /* 펼침도 주소에 싣는다. `replace`가 아니라 `push`면 뒤로 가기가 펼침 하나마다
     걸려서 목록을 빠져나갈 수 없다. 표와 카드가 이 하나를 같이 쓴다 */
  const toggleOpen = (orderId: number) =>
    router.replace(
      ordersHref(location, {
        open: open === orderId ? null : orderId,
        page: location.page,
      }),
      { scroll: false },
    );

  return (
    <div className="mx-auto max-w-wrap">
      <Panel>
        <Panel.Title sub={ORDERS_TEXT.sub}>{ORDERS_TEXT.title}</Panel.Title>

        <OrderListToolbar
          location={location}
          wholesalers={orderWholesalers(orders)}
          resultCount={visible.length}
          canReset={!isOrderFilterEmpty(filter)}
        />

        {empty !== null ? (
          /* 빈 표만 남기지 않는다 — 왜 비었는지와 다음 행동을 같이 준다. 범위 밖
             장은 페이저가 안 서서(`totalPages: 1`) 여기 링크가 유일한 돌아갈 길이다 */
          <div className="py-16 text-center">
            <h3 className="text-base font-medium">{emptyCopy.title}</h3>
            <p className="text-muted-foreground text-body mt-1.5">
              {emptyCopy.description}
            </p>
            {empty === "none" ? null : empty === "outOfRange" ? (
              /* 조건은 그대로 두고 장만 첫 장으로 — 좁혀 둔 조건까지 버리지 않는다 */
              <Button asChild variant="line" className="mt-3.5">
                <Link
                  href={ordersHref(location, { page: FIRST_PAGE, open: null })}
                >
                  {ORDERS_TEXT.outOfRange.action}
                </Link>
              </Button>
            ) : (
              <Button asChild variant="line" className="mt-3.5">
                <Link href={ORDER_PATH.orders}>{ORDERS_TEXT.reset}</Link>
              </Button>
            )}
          </div>
        ) : (
          <>
            {/* 960px 아래에서는 표를 세로 카드로 갈아끼운다 — 표를 그대로 두면
                페이지 전체가 옆으로 밀려 패널이 화면에서 사라졌다(F1). 값·라벨·
                펼침은 두 벌이 같은 곳에서 읽는다 */}
            <div className="hidden tablet:block">
              <OrderCards orders={visible} open={open} onToggle={toggleOpen} />
            </div>

            <div className="tablet:hidden">
              <Table>
                <caption className="sr-only">
                  지난 주문 목록. 통합 주문번호를 누르면 주문 상세로 갑니다
                </caption>
                <Table.Head>
                  <Table.Row>
                    <Table.Th align="center" className="w-8">
                      <span className="sr-only">{LIST_HEADERS.expand}</span>
                    </Table.Th>
                    <Table.Th align="left">{LIST_HEADERS.ordered}</Table.Th>
                    <Table.Th align="left">{LIST_HEADERS.wholesaler}</Table.Th>
                    <Table.Th>{LIST_HEADERS.sheets}</Table.Th>
                    <Table.Th>{LIST_HEADERS.amount}</Table.Th>
                    <Table.Th align="center">{LIST_HEADERS.status}</Table.Th>
                    {/* 열 이름이 무엇을 세는지 말한다 — `3장 / 12장`은 장수다(F8) */}
                    <Table.Th align="center">{LIST_HEADERS.shipment}</Table.Th>
                  </Table.Row>
                </Table.Head>

                <Table.Body>
                  {visible.map((order) => {
                    const seller = summaryWholesalerLabel(order);
                    const expanded = open === order.orderId;

                    return (
                      <Table.ExpandableRow
                        key={order.orderId}
                        open={expanded}
                        onToggle={() => toggleOpen(order.orderId)}
                        colSpan={COLUMN_COUNT}
                        label={order.orderNo}
                        detailId={`order-detail-${order.orderId}`}
                        detail={<OrderLegList order={order} />}
                      >
                        <Table.Td align="left">
                          <div>{order.orderedAt.slice(0, 10)}</div>
                          {/* 상세로 가는 링크는 **한 행에 이것 하나**다. 행 전체를
                              링크로 감싸면 같은 목적지가 한 줄에 둘이 된다 */}
                          <Link
                            href={ORDER_PATH.order(order.orderId)}
                            onClick={(event) => event.stopPropagation()}
                            className="text-muted-foreground hover:text-foreground text-body tabular-nums underline-offset-4 hover:underline"
                          >
                            {order.orderNo}
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

                        <Table.Td>{formatSheets(order.totalQty)}</Table.Td>
                        <Table.Td>{formatWon(order.totalAmount)}</Table.Td>

                        <Table.Td align="center">
                          <OrderStatusBadge status={order.status} />
                        </Table.Td>

                        <Table.Td
                          align="center"
                          tone={order.totalQty === 0 ? "muted" : "default"}
                        >
                          {order.totalQty === 0 ? "—" : receivedLabel(order)}
                        </Table.Td>
                      </Table.ExpandableRow>
                    );
                  })}
                </Table.Body>
              </Table>
            </div>

            <OrderPager location={location} paging={paging} />
          </>
        )}

        <Notice className="mt-6">
          <span className="flex items-start gap-2">
            <Info aria-hidden className="mt-0.5 size-4 shrink-0" />
            {ORDERS_TEXT.rule}
          </span>
        </Notice>
      </Panel>
    </div>
  );
}
