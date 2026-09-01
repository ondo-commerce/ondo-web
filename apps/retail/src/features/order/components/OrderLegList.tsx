import { OrderStatusBadge } from "./OrderStatusBadge";
import { legBackorderNote } from "../constants";
import {
  comboSheetsLabel,
  formatWon,
  legBackorder,
  legStatus,
  legTotals,
} from "../derive";
import type { OrderRecord } from "../types";

/**
 * 펼친 줄의 도매처별 요약. **표와 카드가 같은 이 컴포넌트를 쓴다.**
 *
 * 960px 위에서는 표의 확장행 안에, 아래에서는 카드 안에 들어간다(F1). 두 벌로
 * 만들면 폭에 따라 같은 도매처가 다른 상태로 뜬다 — `retail-backorder`가
 * `EtaCell`을 표와 카드에 같이 넘긴 것과 같은 이유다.
 *
 * 배지는 `legStatus` 하나에서 나오고, 그 함수는 **그 도매처의 라인까지 본다**.
 * 장끼 유무만 보던 때는 `출고 완료` 배지 아래에 `재고 소진 · 미송` 라인이
 * 있었다(F5). 미송이 남았으면 배지가 `부분 출고`가 되고, 몇 장이 남았는지
 * 그 자리에서 같이 말한다 — 사장이 상세까지 들어가야 알던 사실이다.
 */
export function OrderLegList({ order }: { order: OrderRecord }) {
  return (
    <ul className="grid gap-2">
      {order.legs.map((leg) => {
        const legSum = legTotals(order, leg.wholesalerId);
        const backorder = legBackorder(order, leg.wholesalerId);

        return (
          <li
            key={leg.wholesalerId}
            className="text-body flex flex-wrap items-center gap-x-3 gap-y-1"
          >
            <span className="font-medium">{leg.wholesalerName}</span>
            <span className="text-muted-foreground tabular-nums">
              {leg.orderNo}
            </span>
            <span className="text-muted-foreground">
              {comboSheetsLabel(legSum)}
            </span>
            <span className="tabular-nums">{formatWon(legSum.amount)}</span>
            {backorder.sheets > 0 ? (
              <span className="text-secondary-foreground tabular-nums">
                {legBackorderNote(backorder.sheets)}
              </span>
            ) : null}
            <span className="ml-auto phone:ml-0">
              <OrderStatusBadge status={legStatus(order, leg)} />
            </span>
          </li>
        );
      })}
    </ul>
  );
}
