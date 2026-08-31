import { CartLineItem } from "./CartLineItem";
import type { CartGroup } from "../derive";
import { comboSheetsLabel, formatWon, totalsOf } from "../derive";

/**
 * 도매처 하나의 상자. **접수가 도매처별로 나뉘기 때문에** 묶는다 — 한 번에
 * 주문해도 확정·출고·미송은 도매처마다 따로 돈다(RT-32).
 *
 * 머리의 `N개 조합 · N장`과 금액은 **선택과 무관하게 이 그룹에 담긴 전부**를
 * 센다(PM 결정). 선택을 풀어도 그 도매처에 무엇이 얼마나 들었는지는 계속
 * 보여야 한다 — 선택 기준으로 세는 것은 하단 요약 하나뿐이다(RT-32).
 */
export function WholesalerGroup({ group }: { group: CartGroup }) {
  const totals = totalsOf(group.lines);

  return (
    <section
      aria-label={`${group.wholesalerName} 담긴 조합`}
      className="border-border mt-3 overflow-hidden rounded-control border first:mt-0"
    >
      <div className="bg-accent border-border flex flex-wrap items-center gap-x-2.5 gap-y-1 border-b px-3.5 py-2.5">
        <h3 className="text-sm font-medium">{group.wholesalerName}</h3>
        <span className="text-muted-foreground text-body min-w-0 truncate">
          {group.wholesalerLocation}
        </span>
        <span className="ml-auto flex items-center gap-3 phone:ml-0 phone:w-full phone:justify-between">
          <span className="text-muted-foreground text-body">
            {comboSheetsLabel(totals)}
          </span>
          <span className="font-medium tabular-nums">
            {formatWon(totals.amount)}
          </span>
        </span>
      </div>

      <ul className="px-3.5">
        {group.lines.map((line) => (
          <CartLineItem key={line.lineId} line={line} />
        ))}
      </ul>
    </section>
  );
}
