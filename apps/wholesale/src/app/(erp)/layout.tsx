import { AppShell } from "@/shared/components/AppShell";
import type { ReactNode } from "react";

/**
 * route group `(erp)` — URL에 나타나지 않는다. 레이아웃 도구일 뿐이고 인증 보호 수단이 아니다
 * (보호는 실제 경로 기준 negative matcher로 한다 — docs/12-routing.md 규칙 4).
 */
export default function ErpLayout({ children }: { children: ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
