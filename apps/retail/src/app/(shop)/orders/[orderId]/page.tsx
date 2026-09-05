import type { Metadata } from "next";
import { isApiError } from "@ondo/api";
import { OrderDetailClient } from "./OrderDetailClient";
import {
  ORDER_API_PATH,
  OrderNotFound,
  resolveOrderId,
  toOrderDetail,
  type OrderDetailWire,
  type OrderRecord,
} from "@/features/order";
import { RETAIL_ERROR_CODE } from "@/shared/api/errorCodes";
import { serverApi } from "@/shared/api/server";

type PageProps = { params: Promise<{ orderId: string }> };

/**
 * 주소의 `orderId`로 `GET /orders/{orderId}`. 없는 주문(404)은 null이다 —
 * 숫자가 아닌 주소(`/orders/nope-123`)는 서버를 부르지 않고 바로 null.
 * 그 밖의 실패(5xx·연결 실패)는 그대로 던져 `error.tsx`가 받는다.
 */
async function fetchOrder(rawId: string): Promise<OrderRecord | null> {
  const orderId = resolveOrderId(rawId);
  if (orderId === null) return null;

  const api = await serverApi();
  try {
    return toOrderDetail(
      await api.fetch<OrderDetailWire>(ORDER_API_PATH.order(orderId)),
    );
  } catch (error) {
    if (
      isApiError(error) &&
      error.code === RETAIL_ERROR_CODE.RESOURCE_NOT_FOUND
    ) {
      return null;
    }
    throw error;
  }
}

/** 탭 제목에 주문번호를 넣는다 — 주문을 여럿 벌려 놓고 비교하는 화면이다 */
export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const order = await fetchOrder((await params).orderId);

  return { title: order ? `주문 ${order.orderNo}` : "주문 상세" };
}

/**
 * 주문 상세.
 *
 * 없는 주문번호일 때 `notFound()`로 404를 띄우지 않는다 — 주문 내역에서 온
 * 사장에게 필요한 것은 "없다"는 사실과 **목록으로 돌아갈 길**이지 404 화면이
 * 아니다(S8-8).
 *
 * `generateMetadata`와 본문이 같은 요청을 두 번 보낸다. Next가 같은 렌더 안의
 * 같은 `fetch`를 합쳐 주지만 `cache: "no-store"`(세션 응답)라 합쳐지지 않는다 —
 * 껍데기 응답이라 지금은 값이 같고, 비용이 느껴지면 그때 한 번으로 줄인다.
 */
export default async function Page({ params }: PageProps) {
  const order = await fetchOrder((await params).orderId);
  if (!order) return <OrderNotFound />;

  return <OrderDetailClient order={order} />;
}
