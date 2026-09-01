import { Panel } from "@ondo/ui";
import { StatCards, type StatCard } from "@/shared/components/StatCards";
import { SETTLEMENT_SUB } from "../constants";
import {
  findSettlement,
  formatDate,
  formatWon,
  ledgerOf,
  methodLabel,
  overdueSummaryText,
  partnerSettlements,
  receivablePartnerCount,
  resolvePartnerId,
  thisWeekPaid,
  totalOverdue,
  totalReceivable,
} from "../derive";
import type { PartnerSettlement } from "../types";
import { BalanceTable } from "./BalanceTable";
import { EmptyPartners } from "./EmptyPartners";
import { LedgerPanel } from "./LedgerPanel";

/**
 * 정산 · 미수 — 패널 3개가 위에서 아래로 흐른다(소매는 문서형 세로 스크롤).
 *
 * **화면의 모든 숫자가 원장 하나에서 나온다.** 요약 카드 · 표 본문 · 표 합계가
 * 각자 세면 한 곳만 안 따라오는 화면이 된다 — 앞 회차 도매 `settlements`가
 * "필터를 걸면 잔액 열이 금액 열과 어긋난다"로 그걸 겪었다.
 *
 * 데이터는 정적 더미(`fixtures.ts`)라 **로딩·에러 상태가 없다.** 없는 상태를
 * 지어내지 않는다. 빈 상태는 실제로 갈 수 있는 길이라 만든다.
 */
export function SettlementView({
  /** 주소의 `?wholesaler=` 원본값. 정리는 `resolvePartnerId`가 한다 */
  wholesalerParam,
}: {
  wholesalerParam: string | null;
}) {
  const rows = partnerSettlements();
  const currentId = resolvePartnerId(wholesalerParam, rows);
  const current = findSettlement(currentId, rows);

  return (
    <>
      <Panel>
        <Panel.Title sub={SETTLEMENT_SUB}>정산 · 미수</Panel.Title>
        {/* 거래처가 0곳이어도 카드 3장은 `0원`으로 남는다 — 요약이 통째로
            사라지면 사장이 화면이 덜 그려진 것으로 읽는다 */}
        <StatCards cards={summaryCards(rows)} />
      </Panel>

      <div className="mt-2">
        <Panel>
          <Panel.Title>도매처별 미수</Panel.Title>
          {rows.length === 0 ? <EmptyPartners /> : <BalanceTable rows={rows} />}
        </Panel>
      </div>

      {current ? (
        <div className="mt-2">
          <LedgerPanel
            partner={current}
            entries={ledgerOf(current.wholesalerId)}
            partners={rows}
          />
        </div>
      ) : null}
    </>
  );
}

/**
 * 요약 3카드의 값.
 *
 * 세 값 모두 아래 표와 **같은 함수**를 부른다 — `총 미수`는 표 `tfoot`과 글자
 * 그대로 같고, `도매처 3곳`은 잔액이 양수인 줄 수(라비앙 선수금은 빠진다)다.
 */
function summaryCards(rows: readonly PartnerSettlement[]): StatCard[] {
  const overdue = totalOverdue(rows);
  const weekly = thisWeekPaid();

  return [
    {
      label: "총 미수",
      value: formatWon(totalReceivable(rows)),
      sub: `도매처 ${receivablePartnerCount(rows)}곳`,
    },
    {
      label: "연체",
      value: formatWon(overdue.amount),
      sub: overdueSummaryText(overdue),
    },
    {
      label: "이번 주 보낸 입금",
      value: formatWon(weekly.amount),
      sub:
        weekly.latest && weekly.latest.method
          ? `${formatDate(weekly.latest.date)} ${methodLabel(weekly.latest.method)}`
          : null,
    },
  ];
}
