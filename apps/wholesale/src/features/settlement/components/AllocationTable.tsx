"use client";

import { Input, Table } from "@ondo/ui";
import { FulfillmentBadge, SettlementBadge } from "./StatusBadge";
import { orderReceivable, settlementStatus } from "../derive";
import type { SettlementOrder } from "../types";
import { formatNumber } from "@/shared/lib/format";

/**
 * 입금 1건을 여러 주문에 나눠 붙이는 표(`payment_allocation`, 입금 1 : 주문 N).
 *
 * `배분` 열만 입력이고 나머지는 읽기 전용이다 — 나머지 4열은 이미 다른 곳에서
 * 계산된 값이라 여기서 고치면 화면끼리 숫자가 갈린다.
 *
 * 값은 이 컴포넌트가 들고 있지 않는다. 입금액이 바뀌면 자동 배분이 다시 계산돼야 하고
 * 그 계산은 폼 전체(입금액)를 아는 쪽에서만 할 수 있기 때문이다.
 */
export function AllocationTable({
  targets,
  values,
  disabled,
  onChange,
}: {
  /** 미수가 남은 주문만, FIFO 순으로 정렬된 목록 (`derive.allocationTargets`) */
  targets: readonly SettlementOrder[];
  values: Record<string, number>;
  /** 입금액을 아직 안 적었으면 배분할 돈이 없다 → 입력칸을 전부 잠근다 */
  disabled: boolean;
  onChange: (orderId: string, raw: string) => void;
}) {
  if (targets.length === 0) {
    return (
      <p className="text-muted-foreground py-8 text-center text-sm">
        배분할 미수 주문이 없습니다
      </p>
    );
  }

  return (
    <Table>
      <Table.Head>
        <Table.Row>
          <Table.Th align="left">주문번호</Table.Th>
          <Table.Th align="center">주문 상태</Table.Th>
          <Table.Th align="center">정산 상태</Table.Th>
          <Table.Th>미수</Table.Th>
          <Table.Th>배분</Table.Th>
        </Table.Row>
      </Table.Head>
      <Table.Body>
        {targets.map((order) => {
          const receivable = orderReceivable(order);
          const value = values[order.id] ?? 0;
          return (
            <Table.Row key={order.id}>
              <Table.Td align="left">{order.orderNo}</Table.Td>
              <Table.Td align="center">
                <FulfillmentBadge status={order.fulfillmentStatus} />
              </Table.Td>
              <Table.Td align="center">
                <SettlementBadge status={settlementStatus(order)} />
              </Table.Td>
              <Table.Td>{formatNumber(receivable)}</Table.Td>
              <Table.Td>
                <Input
                  size="sm"
                  numeric
                  inputMode="numeric"
                  className="w-25"
                  aria-label={`${order.orderNo} 배분액`}
                  disabled={disabled}
                  value={value === 0 ? "" : formatNumber(value)}
                  onChange={(e) => onChange(order.id, e.target.value)}
                />
              </Table.Td>
            </Table.Row>
          );
        })}
      </Table.Body>
    </Table>
  );
}
