import Link from "next/link";
import { ORDERS_TEXT, ORDER_PATH, backorderNote } from "../constants";
import type { OrderSummary } from "../types";

/**
 * 펼친 줄. **표와 카드가 같은 이 컴포넌트를 쓴다.**
 *
 * 요약 응답(`OrderSummaryResponse`)에는 도매처별 건·상태·금액이 없다 — 상호
 * 목록(`wholesalerNames`)과 미송 장수뿐이다(`04-wire.md` §3). fixtures 시절
 * 여기 서던 도매처별 배지·소계는 상세로 안내한다. 없는 값을 지어내지 않는다.
 */
export function OrderLegList({ order }: { order: OrderSummary }) {
  return (
    <div className="text-body flex flex-wrap items-center gap-x-3 gap-y-1">
      <ul className="flex flex-wrap gap-x-3 gap-y-1">
        {order.wholesalerNames.map((name) => (
          <li key={name} className="font-medium">
            {name}
          </li>
        ))}
      </ul>
      {order.backorderQty > 0 ? (
        <span className="text-secondary-foreground tabular-nums">
          {backorderNote(order.backorderQty)}
        </span>
      ) : null}
      <Link
        href={ORDER_PATH.order(order.orderId)}
        className="text-muted-foreground hover:text-foreground ml-auto underline-offset-4 hover:underline phone:ml-0"
      >
        {ORDERS_TEXT.legDetail}
      </Link>
    </div>
  );
}
