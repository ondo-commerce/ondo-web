import { Button } from "@ondo/ui";
import Link from "next/link";
import {
  BANK_MISSING,
  CARD_LABEL,
  PREPAID_EXCLUDED,
  TOTAL_LABEL,
} from "../constants";
import {
  formatBalance,
  formatDate,
  formatWon,
  hasPrepaid,
  totalReceivable,
} from "../derive";
import type { PartnerSettlement } from "../types";
import { CopyIconButton } from "./CopyButton";

/**
 * 좁은 폭(≤960px)의 거래처 목록 — **표 대신 세로로 쌓는다.**
 *
 * 390px에서 표는 상자 안에서 가로로 흐르면서 미수 잔액도 계좌도 화면 밖으로
 * 나가고, 밀 수 있다는 신호는 없다(F3). 정산 화면의 두 표와 **같은 지점(≤960px)에서
 * 같은 모양으로** 접는다 — 폭마다 다른 규칙을 만들면 사장이 화면을 두 번 배운다.
 *
 * 값은 표와 같은 함수에서 나온다. 열 구성이 표와 같은 이유(위치·마지막 주문·진행 중·
 * 미송·전화가 없다)는 `PartnerTable` 주석에 있다(#240).
 */
export function PartnerCards({ rows }: { rows: readonly PartnerSettlement[] }) {
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

            <dl className="text-body mt-2 grid grid-cols-[4.5rem_1fr] items-baseline gap-x-3 gap-y-1.5">
              <dt className="text-muted-foreground">{CARD_LABEL.lastPaid}</dt>
              <dd className="tabular-nums">
                {row.lastPaidAt ? formatDate(row.lastPaidAt) : "—"}
              </dd>

              {/* 계좌 복사. 시장에서 한 손으로 누르는 자리라 좁은 폭에서
                  손가락 크기(44px)가 되는 것은 표와 같다 */}
              <dt className="text-muted-foreground">{CARD_LABEL.bank}</dt>
              <dd className={row.bank ? undefined : "text-muted-foreground"}>
                {row.bank ? (
                  <span className="inline-flex items-center gap-1.5 tabular-nums">
                    {row.bank.bankName} {row.bank.accountNo}
                    <CopyIconButton
                      text={`${row.bank.bankName} ${row.bank.accountNo}`}
                      label={`${row.name} 계좌 복사`}
                    />
                  </span>
                ) : (
                  BANK_MISSING
                )}
              </dd>
            </dl>

            {/* 서버 숫자 id로 간다 — 문자열 더미 id라 404였던 링크(#183)를 되살린 자리 */}
            <Button asChild variant="line" size="sm" className="mt-3">
              <Link href={`/wholesalers/${row.wholesalerId}`}>
                도매처 홈<span className="sr-only"> ({row.name})</span>
              </Link>
            </Button>
          </li>
        ))}
      </ul>

      {/* 표의 tfoot 자리. 합계는 표와 같은 함수에서 나온다 */}
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
      </div>
    </div>
  );
}
