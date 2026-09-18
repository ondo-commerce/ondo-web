import { Panel } from "@ondo/ui";
import { StatCards, type StatCard } from "@/shared/components/StatCards";
import { PAID_WINDOW_LABEL, SETTLEMENT_SUB } from "../constants";
import {
  formatWon,
  overdueSummaryText,
  receivablePartnerCount,
  totalOverdue,
  totalPaidLast7Days,
  totalReceivable,
} from "../derive";
import type { LedgerEntry, PartnerSettlement } from "../types";
import { BalanceCards } from "./BalanceCards";
import { BalanceTable } from "./BalanceTable";
import { EmptyPartners } from "./EmptyPartners";
import { LedgerPanel } from "./LedgerPanel";

/**
 * 정산 · 미수 — 패널 3개가 위에서 아래로 흐른다(소매는 문서형 세로 스크롤).
 *
 * 값은 `GET /settlements`(도매처별 줄)와 `GET /settlements/{id}/ledger`(고른 도매처
 * 원장)다. **화면의 모든 숫자가 `rows` 하나에서 나온다.** 요약 카드 · 표 본문 ·
 * 표 합계가 각자 세면 한 곳만 안 따라오는 화면이 된다 — 앞 회차 도매 `settlements`가
 * "필터를 걸면 잔액 열이 금액 열과 어긋난다"로 그걸 겪었다.
 *
 * 기다림은 `(shop)/loading.tsx`, 실패는 `(shop)/error.tsx`가 그린다 — 서버
 * 컴포넌트가 던진 것을 받는 자리가 거기다(`features/order`와 같다). 빈 상태만
 * 여기서 그린다: 거래처 0곳(`EmptyPartners`)과 원장 0줄(`LedgerPanel`).
 */
export function SettlementView({
  rows,
  current,
  entries,
}: {
  /** 거래한 도매처 전부. 미수 잔액 내림차순(`toPartnerSettlements`) */
  rows: readonly PartnerSettlement[];
  /** 주소(`?wholesaler=`)로 고른 도매처. 정리는 page가 `resolvePartnerId`로 한다. 거래처가 0곳이면 null */
  current: PartnerSettlement | null;
  /** `current`의 원장만. 다른 도매처 줄이 섞이면 잔액 열이 통째로 틀린다 */
  entries: readonly LedgerEntry[];
}) {
  return (
    /* 주문 내역·미송과 같은 폭. 화면 끝까지 흐르면 1440px에서 표 열 사이가 비어
       한 줄로 읽히지 않고, 화면을 오갈 때 본문이 좌우로 뛴다(#217 R2) */
    <div className="mx-auto max-w-wrap">
      <Panel>
        <Panel.Title sub={SETTLEMENT_SUB}>정산 · 미수</Panel.Title>
        {/* 거래처가 0곳이어도 카드 3장은 `0원`으로 남는다 — 요약이 통째로
            사라지면 사장이 화면이 덜 그려진 것으로 읽는다 */}
        <StatCards cards={summaryCards(rows)} />
      </Panel>

      <div className="mt-2">
        <Panel>
          <Panel.Title>도매처별 미수</Panel.Title>
          {rows.length === 0 ? (
            <EmptyPartners />
          ) : (
            <>
              {/* 좁은 폭에서는 표를 세로 카드로 갈아끼운다 — 390px에서 `마지막 입금`이
                  잘리고 `원장 보기`가 화면 밖이었다(F3). 값은 둘 다 `rows` 하나에서 나온다 */}
              <div className="tablet:block hidden">
                <BalanceCards rows={rows} />
              </div>
              <div className="tablet:hidden">
                <BalanceTable rows={rows} />
              </div>
            </>
          )}
        </Panel>
      </div>

      {current ? (
        <div className="mt-2">
          <LedgerPanel partner={current} entries={entries} partners={rows} />
        </div>
      ) : null}
    </div>
  );
}

/**
 * 요약 3카드의 값.
 *
 * 세 값 모두 아래 표와 **같은 함수**를 부른다 — `총 미수`는 표 `tfoot`과 글자
 * 그대로 같고, `도매처 N곳`은 잔액이 양수인 줄 수(선수금은 빠진다)다.
 *
 * `이번 주 보낸 입금`의 보조 줄은 창의 정의다. fixtures 시절엔 창 안의 마지막
 * 입금(`2026.08.28 계좌 이체`)을 적었는데, 그 값은 도매처 전부의 원장을 받아야
 * 나온다 — 카드 한 줄을 위해 요청 N개를 더 보내지 않는다.
 */
function summaryCards(rows: readonly PartnerSettlement[]): StatCard[] {
  const overdue = totalOverdue(rows);

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
      value: formatWon(totalPaidLast7Days(rows)),
      sub: PAID_WINDOW_LABEL,
    },
  ];
}
