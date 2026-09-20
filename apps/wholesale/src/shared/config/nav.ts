import {
  Boxes,
  ClipboardList,
  LayoutDashboard,
  PackageX,
  Receipt,
  Shirt,
  Truck,
  type LucideIcon,
} from "lucide-react";

/**
 * 좌측 사이드바 7항목. **항목과 순서가 고정**이다 (모든 화면 동일).
 * 업무 흐름 순서(주문→미송→출고)가 먼저 오고, 마스터성 탭(상품·재고)이 뒤, 정산이 마지막이다.
 *
 * URL 명사는 feature-spec/glossary.md의 영문 코드에서 뽑았다.
 * URL의 원본은 이 파일 하나다 — Figma에도, 다른 문서에도 적지 않는다.
 */
export const NAV_ITEMS: readonly {
  href: string;
  label: string;
  icon: LucideIcon;
}[] = [
  { href: "/dashboard", label: "대시보드", icon: LayoutDashboard },
  { href: "/orders", label: "주문", icon: ClipboardList },
  { href: "/backorders", label: "미송", icon: PackageX },
  { href: "/shipments", label: "출고", icon: Truck },
  { href: "/products", label: "상품", icon: Shirt },
  { href: "/inventory", label: "재고", icon: Boxes },
  { href: "/settlements", label: "정산", icon: Receipt },
];

export type NavItem = (typeof NAV_ITEMS)[number];
