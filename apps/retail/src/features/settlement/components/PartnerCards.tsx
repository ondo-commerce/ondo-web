import { Button } from "@ondo/ui";
import { Phone } from "lucide-react";
import Link from "next/link";
import { ongoingCount } from "@/shared/tradeStats";
import {
  CARD_LABEL,
  PREPAID_EXCLUDED,
  SHEET_UNIT,
  TOTAL_LABEL,
} from "../constants";
import {
  formatBalance,
  formatDate,
  formatWon,
  hasPrepaid,
  totalBackorderSheets,
  totalReceivable,
} from "../derive";
import type { PartnerListRow } from "../types";
import { BackorderBadge } from "./BackorderBadge";
import { CopyIconButton } from "./CopyButton";

/**
 * 좁은 폭(≤960px)의 거래처 목록 — **표 대신 세로로 쌓는다.**
 *
 * 8열은 소매에서 가장 넓은 표다. 390px에서는 상자 안에서 가로로 흐르면서 미수 잔액도
 * 연락처도 `도매처 홈`도 전부 화면 밖으로 나가고, 밀 수 있다는 신호는 없다(F3).
 * 정산 화면의 두 표와 **같은 지점(≤960px)에서 같은 모양으로** 접는다 — 폭마다 다른
 * 규칙을 만들면 사장이 화면을 두 번 배운다.
 *
 * 값은 표와 같은 함수에서 나온다. 미송 배지도 같은 컴포넌트를 쓴다 — `지연` 판정이
 * 폭마다 갈리면 안 된다.
 */
export function PartnerCards({ rows }: { rows: readonly PartnerListRow[] }) {
  return (
    <div>
      <ul aria-label="거래처" className="divide-border divide-y">
        {rows.map((row) => (
          <li key={row.wholesalerId} className="py-3.5 first:pt-0">
            <div className="flex items-baseline justify-between gap-3">
              <span className="font-medium">{row.name}</span>
              <span className="font-medium tabular-nums">
                {formatBalance(row.balance)}
              </span>
            </div>
            <p className="text-muted-foreground text-body mt-0.5">
              {row.location}
            </p>

            <dl className="text-body mt-2 grid grid-cols-[4.5rem_1fr] items-baseline gap-x-3 gap-y-1.5">
              <dt className="text-muted-foreground">
                {CARD_LABEL.lastOrdered}
              </dt>
              <dd className="tabular-nums">{formatDate(row.lastOrderedAt)}</dd>

              <dt className="text-muted-foreground">{CARD_LABEL.ongoing}</dt>
              <dd className="tabular-nums">{ongoingCount(row)}건</dd>

              <dt className="text-muted-foreground">{CARD_LABEL.backorder}</dt>
              <dd>
                {row.backorderSheets === 0 ? (
                  <span className="text-muted-foreground">—</span>
                ) : (
                  <BackorderBadge row={row} />
                )}
              </dd>
            </dl>

            {/* 전화·계좌 복사·도매처 홈. 시장에서 한 손으로 누르는 자리라 좁은
                폭에서 손가락 크기(44px)가 되는 것은 표와 같다 */}
            <div className="mt-3 flex items-center gap-2">
              <Button
                asChild
                variant="line"
                size="sm"
                className="size-8 px-0 phone:size-11 [&_svg]:size-4.5"
              >
                <a href={`tel:${row.phone}`} aria-label={`${row.name} 전화`}>
                  <Phone aria-hidden />
                </a>
              </Button>
              <CopyIconButton
                text={`${row.bank.bankName} ${row.bank.accountNo}`}
                label={`${row.name} 계좌 복사`}
              />
              <Button asChild variant="line" size="sm" className="ml-auto">
                <Link href={`/wholesalers/${row.wholesalerId}`}>
                  도매처 홈<span className="sr-only"> ({row.name})</span>
                </Link>
              </Button>
            </div>
          </li>
        ))}
      </ul>

      {/* 표의 tfoot 자리. 미송 장수와 미수 합계 둘 다 표와 같은 함수에서 나온다 */}
      <div className="border-border mt-3 border-t pt-3">
        <div className="flex items-baseline justify-between gap-3 font-medium">
          <span>
            {TOTAL_LABEL}
            {hasPrepaid(rows) ? (
              <span className="text-muted-foreground ml-1.5 text-xs font-normal">
                {PREPAID_EXCLUDED}
              </span>
            ) : null}
          </span>
          <span className="tabular-nums">
            {formatWon(totalReceivable(rows))}
          </span>
        </div>
        <div className="text-body mt-1.5 flex items-baseline justify-between gap-3">
          <span className="text-muted-foreground">{CARD_LABEL.backorder}</span>
          <span className="font-medium tabular-nums">
            {totalBackorderSheets(rows)}
            {SHEET_UNIT}
          </span>
        </div>
      </div>
    </div>
  );
}
