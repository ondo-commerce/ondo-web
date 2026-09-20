import { SUMMARY_EMPTY_SUB, SUMMARY_LABEL } from "../constants";
import { formatDate, qtyLabel } from "../derive";
import type { BackorderSummary as Summary } from "../types";

/**
 * 요약 3카드(`_base.css` `.stats` / `.stat`).
 *
 * **값을 여기서 세지 않는다.** 받는 것은 `derive.ts`의 `summarize`가 이미 계산한
 * 한 덩어리이고, 그 계산은 **표에 실제로 서는 목록**을 먹는다 — 도매처 칩을 걸면
 * 카드도 같이 줄어드는 이유가 이것이다(shipments F8: 목록 0건인데 칩은 20/20/30).
 *
 * `packages/ui`로 올리지 않는다. 사용처가 지금 이 화면 하나뿐이다(Rule of Two).
 * 주문 상세·정산에서 두 번째 자리가 생기는 PR에서 `shared/`로 올린다.
 */
export function BackorderSummary({ summary }: { summary: Summary }) {
  const cards = [
    {
      key: "waiting",
      label: SUMMARY_LABEL.waiting,
      value: `${summary.waitingCount}건`,
      /* 총 장수는 0건이어도 `0장`이 맞는 말이다 — 지어낸 값이 아니라 실제 합이다 */
      sub: `총 ${qtyLabel(summary.totalQty)}`,
    },
    {
      key: "scheduled",
      label: SUMMARY_LABEL.scheduled,
      value: `${summary.scheduledCount}건`,
      /* 0건인데 날짜가 남아 있으면 **없는 약속**이 화면에 선다.
         도매처를 좁히면 실제로 이 상태가 만들어진다(라비앙만 보면 확정이 0건이다) */
      sub:
        summary.earliestEta === null
          ? SUMMARY_EMPTY_SUB.scheduled
          : `${formatDate(summary.earliestEta)} 예정`,
    },
    {
      key: "delayed",
      label: SUMMARY_LABEL.delayed,
      value: `${summary.delayedCount}건`,
      sub:
        summary.delayedCount === 0
          ? SUMMARY_EMPTY_SUB.delayed
          : "예상일이 지났어요",
    },
  ];

  return (
    /* 3열이 좁아지면 1열로 접는다(`_base.css` `@media (max-width:60rem)`).
       열을 눌러 두면 `2026.09.03 예정`이 두 줄로 접혀 날짜가 잘려 읽힌다
       (도매 backorders F3 · settlements F6) */
    <div className="grid grid-cols-3 gap-2 tablet:grid-cols-1">
      {cards.map((card) => (
        <div
          key={card.key}
          className="border-border rounded-control border px-4 py-3.5"
        >
          {/* 카드 라벨은 헤딩이 아니다 — 화면의 헤딩은 패널 머리 h2 하나뿐이고
              그 아래에 h3 없이 h4가 끼면 순서가 깨진다(retail-market F10) */}
          <p className="text-muted-foreground text-body">{card.label}</p>
          {/* 숫자 두 줄은 다른 숫자로 읽힌다. 좁은 폭에서 접히느니 잘리지 않게
              한 줄로 못박는다 — 카드가 1열로 접히는 것이 접힘의 유일한 답이다 */}
          <p className="mt-1.5 text-xl font-medium tabular-nums whitespace-nowrap">
            {card.value}
          </p>
          <p className="text-muted-foreground mt-1 text-xs whitespace-nowrap">
            {card.sub}
          </p>
        </div>
      ))}
    </div>
  );
}
