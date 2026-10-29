import { Button } from "@ondo/ui";
import Link from "next/link";
import { RECEIVABLE_TEXT } from "../constants";
import type { ReceivableCardView } from "../types";

/**
 * 미수 자동 답 말풍선 안 카드 칸(loop-07 S2, 디자인 결정 41 42 43). 미송 카드(`BackorderReplyCard`)와 같은 자리,
 * 같은 모양이다 — 위 선 1px 아래 줄 목록. 미수와 미송 카드가 다르면 한 방 안에서 두 제품처럼 보인다.
 *
 * 금액과 건수만 굵게, 색 없음. 담기 같은 다른 버튼 없이 `정산 화면에서 보기` 하나만(결정 44).
 * 링크는 `Button asChild variant="line" size="sm"` — 도매처 홈 `거래처에서 보기`와 같은 모양, ≤40rem 44px(결정 43).
 * 줄바꿈만 하고 말줄임은 없다(390 잘림 0, S2-3).
 */
export function ReceivableReplyCard({ card }: { card: ReceivableCardView }) {
  return (
    <div
      data-ac="S2-1 S2-2"
      data-receivable-card=""
      className="border-border grid gap-2 border-t pt-2"
    >
      <div className="text-secondary-foreground text-body grid gap-0.5">
        {card.lines.map((line, i) => (
          <span key={i} data-ac="S2-1 S2-2" data-line="">
            {line.map((part, j) =>
              part.strong ? (
                <b key={j} className="text-foreground font-medium tabular-nums">
                  {part.text}
                </b>
              ) : (
                <span key={j}>{part.text}</span>
              ),
            )}
          </span>
        ))}
      </div>
      <div className="flex">
        <Button asChild variant="line" size="sm" className="phone:h-11">
          <Link href={card.settlementHref} data-ac="S2-3">
            {RECEIVABLE_TEXT.settlementLink}
          </Link>
        </Button>
      </div>
    </div>
  );
}
