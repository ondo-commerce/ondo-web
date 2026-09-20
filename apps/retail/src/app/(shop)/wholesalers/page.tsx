import type { Metadata } from "next";
import {
  PartnersView,
  SETTLEMENT_API_PATH,
  toPartnerSettlements,
  type PartnerSettlementWire,
} from "@/features/settlement";
import { serverApi } from "@/shared/api/server";

export const metadata: Metadata = { title: "거래처 관리" };

/** 세션 쿠키로 목록을 받는 화면이라 정적으로 굳힐 수 없다 */
export const dynamic = "force-dynamic";

/**
 * 거래처 관리. **정산과 같은 응답**(`GET /api/retail/settlements`)으로 그린다 —
 * 거래처 목록 전용 path는 없다(`/api/retail/wholesalers` 404 · #240).
 *
 * 좁힐 축이 없는 화면이라 주소에 실을 상태도 없다 — 이 표에서 나가는 링크
 * (`/wholesalers/[id]`)가 상태를 든다.
 * 401은 `(shop)` 레이아웃의 `requireSession`이 먼저 걸러 여기까지 안 온다. 그 밖의
 * 실패는 그대로 던져 `(shop)/error.tsx`가 받는다.
 */
export default async function Page() {
  const api = await serverApi();
  const rows = toPartnerSettlements(
    await api.fetch<PartnerSettlementWire[]>(SETTLEMENT_API_PATH.list),
  );

  return <PartnersView rows={rows} />;
}
