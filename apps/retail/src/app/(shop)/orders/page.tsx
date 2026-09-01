import type { Metadata } from "next";
import { OrdersClient } from "./OrdersClient";
import {
  ORDERS,
  resolveOpen,
  resolveOrderFilter,
  resolveOrderSort,
} from "@/features/order";
import type { OrderFilter, OrderSort } from "@/features/order";

export const metadata: Metadata = { title: "주문 내역" };

export interface OrderFilterProps {
  filter: OrderFilter;
  sort: OrderSort;
  open: string | null;
}

/**
 * 주문 내역. **필터 3축·정렬·펼침을 서버가 주소에서 읽어 첫 HTML에 반영한다** —
 * 좁혀 둔 조건이 든 링크로 바로 들어와도 하이드레이션을 기다리지 않는다.
 *
 * 화면 자체가 클라이언트인 것은 `다시 주문`이 장바구니를 만지기 때문이다.
 */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const wholesalerIds = [
    ...new Set(ORDERS.flatMap((o) => o.legs.map((leg) => leg.wholesalerId))),
  ];

  return (
    <OrdersClient
      filter={resolveOrderFilter(query, wholesalerIds)}
      sort={resolveOrderSort(query)}
      open={resolveOpen(query)}
    />
  );
}
