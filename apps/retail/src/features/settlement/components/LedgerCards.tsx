import { CARD_LABEL } from "../constants";
import {
  formatBalance,
  formatBasis,
  formatDate,
  formatDelta,
  methodLabel,
} from "../derive";
import type { LedgerRow } from "../types";

/**
 * 좁은 폭(≤960px)의 거래 원장 — **표 대신 세로로 쌓는다.**
 *
 * 왜 표를 버리는가: 390px에서 6열 표는 582px를 요구하고 상자 안에서 가로로 흐른다
 * (clientWidth 325 / scrollWidth 582 — 257px가 가려진다). 첫 화면에 `일자 · 구분 ·
 * 근거`까지만 서고 **`증감`과 `잔액`이 화면 밖**인데, 시장에서 이 화면을 여는
 * 사장이 알고 싶은 것이 정확히 `얼마 남았나 = 잔액`이다. 500px에서도 `잔액`은
 * 밖이다. 게다가 `scroll-slim`은 hover에서만 막대를 띄우므로 휴대폰에서는 밀 수
 * 있다는 신호조차 없다(F3).
 *
 * 경계·형식은 `retail-backorder`의 `BackorderCards`와 같다 — 두 화면이 같은 규칙으로
 * 접혀야 사장이 폭마다 다른 화면을 배우지 않는다.
 *
 * **잔액을 다시 누적하지 않는다.** 표와 같은 `runningBalance` 결과를 받는다.
 */
export function LedgerCards({
  rows,
  partnerName,
}: {
  rows: readonly LedgerRow[];
  /** 목록 이름에 쓴다 — 보조기술에서 어느 도매처 원장인지가 여기서 읽힌다 */
  partnerName: string;
}) {
  return (
    <ul
      aria-label={`거래 원장 ${partnerName}`}
      className="divide-border divide-y"
    >
      {rows.map(({ entry, balance }) => (
        <li key={entry.id} className="py-3.5 first:pt-0">
          <div className="flex items-baseline justify-between gap-3">
            <span className="font-medium">
              {entry.kind === "SHIPMENT" ? "출고" : "입금"}
            </span>
            <span className="text-muted-foreground text-body tabular-nums">
              {formatDate(entry.date)}
            </span>
          </div>
          <p className="text-muted-foreground text-body mt-0.5">
            {formatBasis(entry)}
          </p>

          <dl className="text-body mt-2 grid grid-cols-[4.5rem_1fr] items-baseline gap-x-3 gap-y-1.5">
            <dt className="text-muted-foreground">{CARD_LABEL.method}</dt>
            <dd className={entry.method ? undefined : "text-muted-foreground"}>
              {entry.method ? methodLabel(entry.method) : "—"}
            </dd>

            <dt className="text-muted-foreground">{CARD_LABEL.delta}</dt>
            <dd className="tabular-nums">{formatDelta(entry.delta)}</dd>

            {/* 맨 윗줄 잔액이 곧 이 도매처의 미수 잔액이다 — 표에서 화면 밖으로
                밀려나 있던 바로 그 값이라 굵게 세운다 */}
            <dt className="text-muted-foreground">
              {CARD_LABEL.ledgerBalance}
            </dt>
            <dd className="font-medium tabular-nums">
              {formatBalance(balance)}
            </dd>
          </dl>
        </li>
      ))}
    </ul>
  );
}
