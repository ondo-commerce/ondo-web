import { Button } from "@ondo/ui";
import Link from "next/link";
import { CARD_LABEL, PREPAID_EXCLUDED, TOTAL_LABEL } from "../constants";
import {
  formatBalance,
  formatDate,
  formatWon,
  hasPrepaid,
  totalOverdue,
  totalReceivable,
} from "../derive";
import type { PartnerSettlement } from "../types";

/**
 * 좁은 폭(≤960px)의 도매처별 미수 — **표 대신 세로로 쌓는다.**
 *
 * 왜 표를 버리는가: 390px에서 이 표는 상자 안에서 가로로 흐르는데(clientWidth 325 /
 * scrollWidth 453) 첫 화면에 남는 것이 도매처·미수 잔액뿐이고 `마지막 입금`이
 * `2026.08`에서 잘리며 `원장 보기`는 아예 화면 밖이다. 게다가 `scroll-slim`이
 * `scrollbar-color: transparent`라 **밀 수 있다는 신호조차 없다** — 휴대폰에는
 * hover가 없어서 막대가 뜰 기회 자체가 없다.
 *
 * `retail-backorder` 회차가 `/backorders`에서 같은 결함을 같은 방식으로 닫았다
 * (`BackorderCards`). 경계도 그대로 `tablet`(≤960px)이다 — 요약 3카드가 이미 같은
 * 지점에서 1열로 접히므로 화면이 한 지점에서 통째로 쌓임 모드가 된다.
 *
 * **값을 다시 세지 않는다.** 합계는 표·요약 카드와 같은 함수에서 나온다 —
 * 폭에 따라 다른 수를 말하는 화면을 만들지 않는다.
 */
export function BalanceCards({ rows }: { rows: readonly PartnerSettlement[] }) {
  return (
    <div>
      {/* 줄 사이 구분선은 `border`(gray-200)다. 확정 와이어프레임은 표 행 사이에
          한 단계 옅은 `--border-soft`(gray-100)를 쓰지만 그 슬롯이 `theme.css`에
          없고 `packages/ui`는 읽기 전용이라, 이번 회차에서 토큰을 새로 파지 않는다
          (02-fe.md §6에 부채로 남긴다) */}
      <ul aria-label="도매처별 미수" className="divide-border divide-y">
        {rows.map((row) => (
          <li key={row.wholesalerId} className="py-3.5 first:pt-0">
            <div className="flex items-baseline justify-between gap-3">
              <span className="font-medium">{row.name}</span>
              {/* 이 화면에 온 사장이 알고 싶은 값이라 제일 위에 크게 둔다 */}
              <span className="font-medium tabular-nums">
                {formatBalance(row.balance)}
              </span>
            </div>

            {/* 표 머리글이 하던 일(이 숫자가 무엇인지)을 좁은 폭에서는 이 라벨이 한다 */}
            <dl className="text-body mt-2 grid grid-cols-[4.5rem_1fr] items-baseline gap-x-3 gap-y-1.5">
              <dt className="text-muted-foreground">{CARD_LABEL.overdue}</dt>
              <dd className="tabular-nums">
                {row.overdue.count === 0 ? (
                  <span className="text-muted-foreground">—</span>
                ) : (
                  <>
                    <span className="text-destructive-strong">
                      {formatWon(row.overdue.amount)}
                    </span>{" "}
                    <span className="text-muted-foreground">
                      D+{row.overdue.maxDays}
                    </span>
                  </>
                )}
              </dd>

              <dt className="text-muted-foreground">{CARD_LABEL.lastPaid}</dt>
              <dd className="tabular-nums">
                {row.lastPaidAt ? formatDate(row.lastPaidAt) : "—"}
              </dd>
            </dl>

            <Button asChild variant="line" size="sm" className="mt-3">
              <Link href={`/settlements?wholesaler=${row.wholesalerId}`}>
                원장 보기
                <span className="sr-only"> ({row.name})</span>
              </Link>
            </Button>
          </li>
        ))}
      </ul>

      {/* 표의 tfoot 자리. 위 여백과 굵은 글자가 합계를 목록에서 떼어 놓는다 */}
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
          <span className="text-muted-foreground">{CARD_LABEL.overdue}</span>
          <span className="text-destructive-strong font-medium tabular-nums">
            {formatWon(totalOverdue(rows).amount)}
          </span>
        </div>
      </div>
    </div>
  );
}
