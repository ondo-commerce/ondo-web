import { BACKORDER_SKUS, BackorderListView } from "@/features/backorder";

export const metadata = { title: "미송 배분 · 온도 ERP" };

export default function BackordersPage() {
  return <BackorderListView skus={BACKORDER_SKUS} />;
}
