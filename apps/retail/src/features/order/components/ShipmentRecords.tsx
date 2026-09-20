"use client";

import { Button } from "@ondo/ui";
import { DETAIL_TEXT, SHIPMENT_PACKED, STATEMENT_TEXT } from "../constants";
import { formatWon, shipmentAmount, shipmentSummary } from "../derive";
import type { OrderRecord, Shipment } from "../types";

/**
 * 출고 기록 — 장끼 한 장이 한 줄이다. 값은 상세 응답의 `outbounds[]`다.
 *
 * **장끼는 출고할 때 시스템이 자동 발행하고 고칠 수 없다**(RT-54). 번호는 서버가
 * 준 `statementNumber` 그대로다. 수령인은 주문의 사입삼촌(`agentName`)이다 —
 * 지난 주문의 수령인을 지어내던 fixtures 더미가 사라진 자리다.
 *
 * 0건일 때 빈 상자만 남기지 않는다. 아직 아무것도 안 나갔다는 것 자체가
 * 사장이 알아야 할 사실이다.
 */
export function ShipmentRecords({
  order,
  onOpenStatement,
}: {
  order: OrderRecord;
  /**
   * 장끼를 열 때 **누른 버튼도 같이 넘긴다.** 모달을 닫으면 거기로 포커스가
   * 돌아가야 하는데, 줄마다 버튼이 하나씩이라 어느 것을 눌렀는지는 눌린
   * 요소만이 안다(F4).
   */
  onOpenStatement: (shipment: Shipment, trigger: HTMLElement) => void;
}) {
  if (order.shipments.length === 0) {
    return (
      <p className="text-muted-foreground text-body py-6 text-center">
        {DETAIL_TEXT.shipmentEmpty}
      </p>
    );
  }

  return (
    <ul className="flex flex-col">
      {order.shipments.map((shipment) => {
        const leg = order.legs.find(
          (it) => it.wholesalerId === shipment.wholesalerId,
        );
        const amount = shipmentAmount(shipment);

        return (
          <li
            key={shipment.outboundId}
            className="border-border hover:bg-accent flex min-h-13 flex-wrap items-center gap-3 border-b px-3 py-2.5 last:border-b-0"
          >
            <div className="min-w-0 flex-1">
              <p className="font-medium tabular-nums">
                {shipment.statementNo}{" "}
                <span className="text-muted-foreground font-normal">
                  {leg?.wholesalerName ?? ""}
                </span>
              </p>
              <p className="text-muted-foreground text-body">
                {shipmentSummary(
                  shipment,
                  leg,
                  order.agentName,
                  SHIPMENT_PACKED,
                )}
              </p>
            </div>

            <div className="flex items-center gap-3">
              <span className="font-medium tabular-nums">
                {amount === null
                  ? STATEMENT_TEXT.priceUnknown
                  : formatWon(amount)}
              </span>
              <Button
                variant="line"
                size="sm"
                onClick={(event) =>
                  onOpenStatement(shipment, event.currentTarget)
                }
              >
                {DETAIL_TEXT.statement}
              </Button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
