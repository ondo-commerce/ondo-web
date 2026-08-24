import { InventoryListView } from "@/features/inventory";
import { PRODUCTS } from "@/features/product";

export const metadata = { title: "재고 관리 · 온도 ERP" };

export default function InventoryPage() {
  return <InventoryListView products={PRODUCTS} />;
}
