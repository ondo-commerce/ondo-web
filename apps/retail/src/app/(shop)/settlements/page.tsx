import type { Metadata } from "next";
import {
  SETTLEMENT_API_PATH,
  SettlementView,
  findSettlement,
  resolvePartnerId,
  toLedgerEntry,
  toPartnerSettlements,
  type LedgerEntryWire,
  type PartnerSettlementWire,
} from "@/features/settlement";
import { serverApi } from "@/shared/api/server";

export const metadata: Metadata = { title: "정산 · 미수" };

/**
 * 세션 쿠키로 `GET /api/retail/settlements`를 부르는 화면이라 정적으로 굳힐 수 없고,
 * 주소(`?wholesaler=`)가 곧 상태라 첫 HTML부터 그 상태여야 한다.
 */
export const dynamic = "force-dynamic";

/**
 * 어느 도매처 원장을 보는지가 **주소에 있다**(`?wholesaler=101`).
 *
 * 화면 안 상태로 두면 브라우저 뒤로 가기가 직전 도매처로 돌아오지 않고, 새 탭·
 * 공유 링크도 늘 첫 도매처로 열린다 — `retail-market` 회차가 "펼친 상태가 뒤로
 * 가기에서 사라진다"로 같은 종류를 겪었다.
 *
 * 요청은 둘이고 **순서가 있다.** 목록을 먼저 받아야 주소의 값이 거래 중인 도매처인지
 * 알고, 그 다음에야 원장을 부른다(`resolvePartnerId`) — 목록에 없는 값은 첫 줄로
 * 떨어지므로 숫자가 아닌 id(`abc` → 400)로 서버를 부를 일이 없다.
 * 401은 `(shop)` 레이아웃의 `requireSession`이 먼저 걸러 여기까지 안 온다. 그 밖의
 * 실패는 그대로 던져 `(shop)/error.tsx`가 받는다.
 */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const raw = params.wholesaler;
  const wholesalerParam = Array.isArray(raw) ? (raw[0] ?? null) : (raw ?? null);

  const api = await serverApi();
  const rows = toPartnerSettlements(
    await api.fetch<PartnerSettlementWire[]>(SETTLEMENT_API_PATH.list),
  );
  const current = findSettlement(resolvePartnerId(wholesalerParam, rows), rows);

  /* 거래처가 0곳이면 원장을 부를 도매처가 없다 — 빈 원장을 받으러 가지 않는다 */
  const entries = current
    ? (
        await api.fetch<LedgerEntryWire[]>(
          SETTLEMENT_API_PATH.ledger(current.wholesalerId),
        )
      ).map(toLedgerEntry)
    : [];

  return <SettlementView rows={rows} current={current} entries={entries} />;
}
