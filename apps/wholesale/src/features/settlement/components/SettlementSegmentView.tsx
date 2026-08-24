"use client";

import { Segmented, Select } from "@ondo/ui";
import { useState } from "react";
import { SettlementStatusTable } from "./SettlementStatusTable";
import { FILTER_ALL, SETTLEMENT_LABEL } from "../constants";
import { settlementStatus } from "../derive";
import type { SettlementOrder, SettlementStatus } from "../types";

/** 세그먼트 2택. 같은 자리의 표만 바뀐다 — 다른 페이지로 이동하지 않는다 */
type Segment = "status" | "ledger";

/** 필터 값 = 상태 3종 + `전체` */
type StatusFilter = SettlementStatus | typeof FILTER_ALL;

const STATUS_OPTIONS: readonly SettlementStatus[] = [
  "unpaid",
  "partial",
  "settled",
];

/**
 * 거래처를 펼쳤을 때 나오는 영역. 세그먼트가 두 얼굴(정산 상태 / 미수원장)을 갖는다.
 *
 * 세그먼트와 필터 상태는 **이 컴포넌트 안에만 둔다.** 거래처를 바꾸면 호출부가
 * key로 이 컴포넌트를 새로 만들어 필터가 자동으로 풀린다 — A거래처에 걸어 둔
 * `미결제` 필터가 B거래처 표에 남아 "주문이 없다"로 보이는 상황을 막는다.
 */
export function SettlementSegmentView({
  orders,
}: {
  orders: readonly SettlementOrder[];
}) {
  const [segment, setSegment] = useState<Segment>("status");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(FILTER_ALL);

  const visibleOrders =
    statusFilter === FILTER_ALL
      ? orders
      : orders.filter((o) => settlementStatus(o) === statusFilter);

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <Segmented
          value={segment}
          onValueChange={(value) => setSegment(value as Segment)}
          aria-label="정산 보기 전환"
        >
          <Segmented.Item value="status">정산 상태</Segmented.Item>
          <Segmented.Item value="ledger">미수원장</Segmented.Item>
        </Segmented>

        {segment === "status" ? (
          <Select
            value={statusFilter}
            onValueChange={(value) => setStatusFilter(value as StatusFilter)}
          >
            {/* 닫힌 트리거에는 고른 값이 보인다. 무엇으로 걸러져 있는지가 표 밖에서 읽혀야 한다 */}
            <Select.Trigger aria-label="정산 상태 필터" className="w-25">
              {statusFilter === FILTER_ALL
                ? "정산 상태"
                : SETTLEMENT_LABEL[statusFilter]}
            </Select.Trigger>
            <Select.Content>
              <Select.Item value={FILTER_ALL}>{FILTER_ALL}</Select.Item>
              {STATUS_OPTIONS.map((status) => (
                <Select.Item key={status} value={status}>
                  {SETTLEMENT_LABEL[status]}
                </Select.Item>
              ))}
            </Select.Content>
          </Select>
        ) : null}
      </div>

      {/* 미수원장 표는 03번 이슈에서 이 자리에 들어온다 */}
      {segment === "status" ? (
        <SettlementStatusTable orders={visibleOrders} />
      ) : null}
    </div>
  );
}
