import { ORDERS, OrderListView } from "@/features/order";

export const metadata = { title: "주문 관리 · 온도 ERP" };

export default function OrdersPage() {
  return <OrderListView orders={ORDERS} />;
}
