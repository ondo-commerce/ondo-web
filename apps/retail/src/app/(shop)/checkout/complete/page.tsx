import type { Metadata } from "next";
import { isApiError } from "@ondo/api";
import {
  ORDER_API_PATH,
  OrderCompleteView,
  resolveOrderId,
  toOrderDetail,
  type OrderDetailWire,
  type OrderRecord,
} from "@/features/order";
import { RETAIL_ERROR_CODE } from "@/shared/api/errorCodes";
import { serverApi } from "@/shared/api/server";

export const metadata: Metadata = { title: "주문 완료" };

/**
 * 주문 완료. 접수 응답 자체는 주소로 옮길 수 없어(안 된 도매처의 사유가 자유
 * 문장이다) **`?orderId=`로 `GET /orders/{id}`를 다시 읽어** 그린다 — 새로고침해도
 * 같은 화면이다. 안 된 도매처는 `CheckoutView`가 세션에 남긴 것을 뷰가 읽는다.
 *
 * `orderId`가 없거나 서버에 없는 주문이면 빈 화면 대신 `방금 접수한 주문이 없어요`.
 */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const orderId = resolveOrderId((await searchParams).orderId);
  if (orderId === null) return <OrderCompleteView order={null} />;

  const api = await serverApi();
  let order: OrderRecord | null;
  try {
    order = toOrderDetail(
      await api.fetch<OrderDetailWire>(ORDER_API_PATH.order(orderId)),
    );
  } catch (error) {
    if (
      isApiError(error) &&
      error.code === RETAIL_ERROR_CODE.RESOURCE_NOT_FOUND
    ) {
      order = null;
    } else {
      throw error;
    }
  }

  return <OrderCompleteView order={order} />;
}
