import { AccountMenu, ErpGuard } from "@/features/account";
import { AppShell } from "@/shared/components/AppShell";
import type { ReactNode } from "react";

/**
 * route group `(erp)` — URL에 나타나지 않는다. 레이아웃 도구일 뿐이고 그 자체가
 * 인증 보호 수단은 아니다. 실제 판정은 `ErpGuard`가 한다.
 *
 * 계정 드롭다운을 셸에 **끼워 넣는다.** 셸은 `shared/`에 있고 메뉴는
 * `features/account`에 있는데 `shared → features` 참조가 금지라(ESLint),
 * 둘을 아는 유일한 자리인 여기서 조립한다 — import 방향이 한 방향으로 남는다.
 */
export default function ErpLayout({ children }: { children: ReactNode }) {
  return (
    <ErpGuard>
      <AppShell accountMenu={<AccountMenu />}>{children}</AppShell>
    </ErpGuard>
  );
}
