"use client";

import { Segmented, Select } from "@ondo/ui";
import { useState } from "react";
import { ReceivableLedgerTable } from "./ReceivableLedgerTable";
import { SettlementStatusTable } from "./SettlementStatusTable";
import { FILTER_ALL, LEDGER_LABEL, SETTLEMENT_LABEL } from "../constants";
import { ledgerBalance, ledgerRows, settlementStatus } from "../derive";
import type {
  LedgerEntry,
  LedgerEntryType,
  SettlementOrder,
  SettlementStatus,
} from "../types";

/** 세그먼트 2택. 같은 자리의 표만 바뀐다 — 다른 페이지로 이동하지 않는다 */
type Segment = "status" | "ledger";

/** 필터 값 = 각 축의 값 + `전체` */
type StatusFilter = SettlementStatus | typeof FILTER_ALL;
type LedgerFilter = LedgerEntryType | typeof FILTER_ALL;

const STATUS_OPTIONS: readonly SettlementStatus[] = [
  "unpaid",
  "partial",
  "settled",
];
const LEDGER_OPTIONS: readonly LedgerEntryType[] = ["payment", "charge"];

/**
 * 거래처를 펼쳤을 때 나오는 영역. 세그먼트가 두 얼굴(정산 상태 / 미수원장)을 갖는다.
 *
 * 세그먼트와 필터 상태는 **이 컴포넌트 안에만 둔다.** 거래처를 바꾸면 호출부가
 * key로 이 컴포넌트를 새로 만들어 필터가 자동으로 풀린다 — A거래처에 걸어 둔
 * `미결제` 필터가 B거래처 표에 남아 "주문이 없다"로 보이는 상황을 막는다.
 */
export function SettlementSegmentView({
  orders,
  ledger,
}: {
  orders: readonly SettlementOrder[];
  ledger: readonly LedgerEntry[];
}) {
  const [segment, setSegment] = useState<Segment>("status");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(FILTER_ALL);
  const [ledgerFilter, setLedgerFilter] = useState<LedgerFilter>(FILTER_ALL);

  const visibleOrders =
    statusFilter === FILTER_ALL
      ? orders
      : orders.filter((o) => settlementStatus(o) === statusFilter);

  /* 잔액을 먼저 누적하고 그 다음에 거른다. 순서가 바뀌면 잔액이 거짓이 된다 */
  const rows = ledgerRows(ledger);
  const visibleRows =
    ledgerFilter === FILTER_ALL
      ? rows
      : rows.filter((row) => row.entryType === ledgerFilter);

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

        {/* 필터는 세그먼트마다 다른 축을 거른다. 자리는 같고 라벨과 옵션만 바뀐다 */}
        {segment === "status" ? (
          <Select
            value={statusFilter}
            onValueChange={(value) => setStatusFilter(value as StatusFilter)}
          >
            {/* 닫힌 트리거에는 고른 값이 보인다. 무엇으로 걸러져 있는지가 표 밖에서 읽혀야 한다 */}
            <Select.Trigger aria-label="정산 상태 필터">
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
        ) : (
          <Select
            value={ledgerFilter}
            onValueChange={(value) => setLedgerFilter(value as LedgerFilter)}
          >
            <Select.Trigger aria-label="원장 구분 필터">
              {ledgerFilter === FILTER_ALL
                ? "구분"
                : LEDGER_LABEL[ledgerFilter]}
            </Select.Trigger>
            <Select.Content>
              <Select.Item value={FILTER_ALL}>{FILTER_ALL}</Select.Item>
              {LEDGER_OPTIONS.map((type) => (
                <Select.Item key={type} value={type}>
                  {LEDGER_LABEL[type]}
                </Select.Item>
              ))}
            </Select.Content>
          </Select>
        )}
      </div>

      {segment === "status" ? (
        <SettlementStatusTable orders={visibleOrders} />
      ) : (
        <ReceivableLedgerTable
          rows={visibleRows}
          currentBalance={ledgerBalance(ledger)}
        />
      )}
    </div>
  );
}
