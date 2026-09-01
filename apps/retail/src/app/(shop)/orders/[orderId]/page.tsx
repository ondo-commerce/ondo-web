import type { Metadata } from "next";
import { OrderDetailClient } from "./OrderDetailClient";
import { OrderNotFound, findOrder } from "@/features/order";

type PageProps = { params: Promise<{ orderId: string }> };

/** 탭 제목에 주문번호를 넣는다 — 주문을 여럿 벌려 놓고 비교하는 화면이다 */
export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const order = findOrder((await params).orderId);

  return { title: order ? `주문 ${order.orderId}` : "주문 상세" };
}

/**
 * 주문 상세.
 *
 * 없는 주문번호일 때 `notFound()`로 404를 띄우지 않는다 — 주문 내역에서 온
 * 사장에게 필요한 것은 "없다"는 사실과 **목록으로 돌아갈 길**이지 404 화면이
 * 아니다(S8-8).
 */
export default async function Page({ params }: PageProps) {
  const order = findOrder((await params).orderId);
  if (!order) return <OrderNotFound />;

  return <OrderDetailClient order={order} />;
}
