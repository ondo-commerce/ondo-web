import { BACKORDER_TEXT } from "../constants";
import { backorderStateLine } from "../derive";
import type { BackorderCardView } from "../types";

/**
 * 미송 자동 답 말풍선 안 카드 칸(loop-06 S3-3, 디자인 결정 39 40). 재고 카드(`StockReplyCard`)와 같은 자리 —
 * 별도 상자가 아니라 위 선 1px 아래다(방향안 A, 답 하나 = 말풍선 하나).
 *
 * 줄: 대상(굵게) + 주문 / 남은 미송 N장 / 입고 상태 / 사유(예정, 오늘만). 날짜와 수량, 상태 낱말만 굵게, 색 없음.
 * 담기 버튼은 없다 — 입고 전 미송은 담을 물건이 아니다. 미정, 지남이면 바로 아래 넘김 줄은 서버 HANDOFF가 그린다.
 */
export function BackorderReplyCard({ card }: { card: BackorderCardView }) {
  return (
    <div
      data-ac="S3-3"
      data-backorder-id={card.backorderId}
      className="border-border grid gap-2 border-t pt-2"
    >
      <span className="text-secondary-foreground text-body">
        <b className="text-foreground font-medium">{card.target}</b>
        {card.order === null ? null : `, ${card.order}`}
      </span>
      <div className="text-secondary-foreground text-body grid gap-0.5">
        <span>
          {BACKORDER_TEXT.remaining}
          <b className="text-foreground font-medium tabular-nums">
            {card.qtyLabel}
          </b>
        </span>
        <span data-ac="S3-3" data-state={card.state}>
          {backorderStateLine(card).map((part, i) =>
            part.strong ? (
              <b key={i} className="text-foreground font-medium tabular-nums">
                {part.text}
              </b>
            ) : (
              <span key={i}>{part.text}</span>
            ),
          )}
        </span>
        {card.reason === null ? null : <span>{card.reason}</span>}
      </div>
    </div>
  );
}
