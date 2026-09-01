"use client";

import { Button } from "@ondo/ui";
import { DETAIL_TEXT } from "../constants";
import { formatWon, shipmentAmount, shipmentSummary } from "../derive";
import { PAST_RECEIVER_NAME } from "../fixtures";
import type { OrderRecord, Shipment } from "../types";

/**
 * 출고 기록 — 장끼 한 장이 한 줄이다.
 *
 * **장끼는 출고할 때 시스템이 자동 발행하고 고칠 수 없다**(RT-54). 번호 형식은
 * `JG-YYYYMMDD-NNN`(§4 통일) — 원본 09 화면의 `ST-002` 같은 더미 문자열을
 * 쓰지 않는다.
 *
 * 0건일 때 빈 상자만 남기지 않는다. 아직 아무것도 안 나갔다는 것 자체가
 * 사장이 알아야 할 사실이다.
 */
export function ShipmentRecords({
  order,
  onOpenStatement,
}: {
  order: OrderRecord;
  onOpenStatement: (shipment: Shipment) => void;
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

        return (
          <li
            key={shipment.statementNo}
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
                {shipmentSummary(shipment, leg, PAST_RECEIVER_NAME)}
              </p>
            </div>

            <div className="flex items-center gap-3">
              <span className="font-medium tabular-nums">
                {formatWon(shipmentAmount(shipment))}
              </span>
              <Button
                variant="line"
                size="sm"
                onClick={() => onOpenStatement(shipment)}
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
