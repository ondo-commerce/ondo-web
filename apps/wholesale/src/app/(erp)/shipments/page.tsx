import {
  PACKAGES,
  PACKING_ITEMS,
  RETAILERS,
  ShipmentListView,
} from "@/features/shipment";

export const metadata = { title: "출고 관리 · 온도 ERP" };

export default function ShipmentsPage() {
  return (
    <ShipmentListView
      retailers={RETAILERS}
      items={PACKING_ITEMS}
      packages={PACKAGES}
    />
  );
}
