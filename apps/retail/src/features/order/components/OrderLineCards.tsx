"use client";

import { IconButton } from "@ondo/ui";
import { Heart } from "lucide-react";
import { LineStatusBadge } from "./OrderStatusBadge";
import { DETAIL_TEXT, LINE_HEADERS } from "../constants";
import {
  formatSheets,
  formatWon,
  lineStatusNote,
  orderLineAmount,
  orderTotals,
} from "../derive";
import type { OrderRecord } from "../types";

/**
 * 좁은 폭(≤960px)의 주문 상품. 표 대신 세로 카드다.
 *
 * **390px에서 표가 페이지 전체를 옆으로 밀어서 `단가 · 소계 · 상태 · 찜`이 첫
 * 화면에 없었다**(F1). 접는 경계와 방식은 목록·미송·정산과 같다.
 *
 * 값은 표와 **같은 함수**에서 나오고(`derive.ts`) 라벨도 표 머리글과 같은
 * 상수를 읽는다. 합계는 여기서 다시 더하지 않고 `orderTotals` 하나를 부른다 —
 * 원본이 요약 517,000원 / 행 합 618,000원으로 갈려 있던 자리다.
 */
export function OrderLineCards({
  order,
  favorites,
  onToggleFavorite,
}: {
  order: OrderRecord;
  favorites: ReadonlySet<string>;
  onToggleFavorite: (productId: string) => void;
}) {
  const totals = orderTotals(order);

  return (
    <div>
      <ul
        aria-label={DETAIL_TEXT.lineSection}
        className="divide-border divide-y"
      >
        {order.lines.map((line) => {
          const leg = order.legs.find(
            (it) => it.wholesalerId === line.wholesalerId,
          );
          const note = lineStatusNote(line, leg);
          const favorited = favorites.has(line.productId);

          return (
            <li key={line.lineId} className="py-3.5 first:pt-0">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium">{line.productName}</p>
                  <p className="text-muted-foreground text-body mt-0.5">
                    {line.colorLabel} · {line.size} ·{" "}
                    {leg?.wholesalerName ?? ""}
                  </p>
                </div>
                <IconButton
                  variant="ghost"
                  aria-pressed={favorited}
                  aria-label={`${line.productName} ${favorited ? "찜 해제" : "찜하기"}`}
                  onClick={() => onToggleFavorite(line.productId)}
                >
                  <Heart
                    aria-hidden
                    fill={favorited ? "currentColor" : "none"}
                    className={favorited ? "text-foreground" : undefined}
                  />
                </IconButton>
              </div>

              <dl className="text-body mt-2 grid grid-cols-[4.5rem_1fr] items-baseline gap-x-3 gap-y-1.5">
                <dt className="text-muted-foreground">{LINE_HEADERS.qty}</dt>
                <dd className="tabular-nums">{formatSheets(line.qty)}</dd>

                <dt className="text-muted-foreground">{LINE_HEADERS.price}</dt>
                <dd className="tabular-nums">{formatWon(line.price)}</dd>

                <dt className="text-muted-foreground">
                  {LINE_HEADERS.subtotal}
                </dt>
                <dd className="font-medium tabular-nums">
                  {formatWon(orderLineAmount(line))}
                </dd>

                <dt className="text-muted-foreground">{LINE_HEADERS.status}</dt>
                <dd>
                  <LineStatusBadge status={line.status} />
                  {note ? (
                    <span className="text-muted-foreground mt-1 block text-xs">
                      {note}
                    </span>
                  ) : null}
                </dd>
              </dl>
            </li>
          );
        })}
      </ul>

      {/* 표 `<tfoot>` 자리. 윗선만 한 단계 진하다 */}
      <div className="border-border mt-3 border-t pt-3 font-medium">
        <div className="flex items-baseline justify-between gap-3">
          <span>{DETAIL_TEXT.total}</span>
          <span className="tabular-nums">{formatWon(totals.amount)}</span>
        </div>
        <div className="text-muted-foreground text-body mt-1.5 flex items-baseline justify-between gap-3 font-normal">
          <span>{LINE_HEADERS.qty}</span>
          <span className="tabular-nums">{formatSheets(totals.sheets)}</span>
        </div>
      </div>
    </div>
  );
}
