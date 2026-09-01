import { Badge, cn } from "@ondo/ui";
import Link from "next/link";
import { DELAYED_LABEL, SHEET_UNIT } from "../constants";
import type { PartnerListRow } from "../types";

/**
 * 미송 배지. 누르면 그 도매처만 걸린 미송 현황이 열린다.
 *
 * **지연은 색만이 아니라 `지연`이라는 글자로도 구분된다.** 테두리는 red-500
 * 그대로 두고 글자만 한 단계 내린다(선은 3:1이면 되고, 테두리까지 내리면 배지가
 * 무거워진다 — 확정 와이어프레임 `_base.css` 대비 보정 2번).
 *
 * 넓은 폭의 표(`PartnerTable`)와 좁은 폭의 카드(`PartnerCards`)가 **같은 것**을
 * 쓴다. 지연 판정이 폭마다 갈리면 같은 도매처가 폭에 따라 다른 말을 한다.
 */
export function BackorderBadge({ row }: { row: PartnerListRow }) {
  return (
    <Link
      href={`/backorders?wholesaler=${row.wholesalerId}`}
      className="inline-flex rounded-button hover:opacity-80"
    >
      <Badge
        className={cn(
          "border",
          row.backorderDelayed
            ? "bg-card border-destructive text-destructive-strong"
            : "bg-card border-input text-muted-foreground",
        )}
      >
        {row.backorderSheets}
        {SHEET_UNIT}
        {row.backorderDelayed ? ` ${DELAYED_LABEL}` : null}
      </Badge>
      <span className="sr-only"> ({row.name} 미송 현황 보기)</span>
    </Link>
  );
}
