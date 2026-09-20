import type { Metadata } from "next";
import {
  ORDER_API_PATH,
  ORDERS_PAGE_SIZE,
  OrderListView,
  periodFrom,
  resolveOpen,
  resolveOrderFilter,
  resolveOrderSort,
  resolvePage,
  toOrderPage,
  toOrderSummary,
  type OrderSummaryWire,
} from "@/features/order";
import { serverApi } from "@/shared/api/server";

export const metadata: Metadata = { title: "주문 내역" };

/**
 * 주문 내역. **필터 3축·정렬·펼침·페이지를 서버가 주소에서 읽어 첫 HTML에 반영한다** —
 * 좁혀 둔 조건이 든 링크로 바로 들어와도 하이드레이션을 기다리지 않는다.
 *
 * 서버가 아는 파라미터는 `from`·`to`·`page`·`size`뿐이다. 기간은 `from`으로
 * 서버가 거르고, 도매처·상태는 받은 장 안에서 화면이 건다(`04-wire.md` §3).
 * 401은 `(shop)` 레이아웃의 `requireSession`이 먼저 걸러 여기까지 안 온다.
 */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const page = resolvePage(params);
  /* 기간은 먼저 읽어야 요청에 실린다. 도매처 축은 응답을 받아야 허용 목록을 안다 */
  const period = resolveOrderFilter(params, []).period;

  const api = await serverApi();
  const result = await api.fetchPage<OrderSummaryWire>(ORDER_API_PATH.orders, {
    searchParams: {
      from: periodFrom(period, new Date()),
      page: page - 1,
      size: ORDERS_PAGE_SIZE,
    },
  });

  const orders = result.items.map(toOrderSummary);
  const wholesalerNames = [
    ...new Set(orders.flatMap((order) => order.wholesalerNames)),
  ];

  return (
    <OrderListView
      orders={orders}
      location={{
        filter: resolveOrderFilter(params, wholesalerNames),
        sort: resolveOrderSort(params),
        open: resolveOpen(params),
        page,
      }}
      paging={toOrderPage(result.meta)}
    />
  );
}
