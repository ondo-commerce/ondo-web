"use client";

import { Table } from "@ondo/ui";
import { OrderStatusBadge, SettlementBadge } from "./StatusBadge";
import type { OrderRowView } from "../types";
import { NumericInput } from "@/shared/components/NumericInput";
import { formatNumber } from "@/shared/lib/format";

/**
 * 입금 1건을 여러 주문에 나눠 붙이는 표(`allocations[]`, 입금 1 : 주문 N).
 *
 * `배분` 열만 입력이고 나머지는 읽기 전용이다 — 나머지 4열은 서버값이라
 * 여기서 고치면 화면끼리 숫자가 갈린다.
 *
 * 값은 이 컴포넌트가 들고 있지 않는다. 입금액이 바뀌면 자동 배분이 다시 계산돼야 하고
 * 그 계산은 폼 전체(입금액)를 아는 쪽에서만 할 수 있기 때문이다.
 */
export function AllocationTable({
  targets,
  values,
  issues,
  disabled,
  onChange,
}: {
  /** 미수가 남은 주문만, FIFO 순으로 정렬된 목록 (`derive.allocationTargets`) */
  targets: readonly OrderRowView[];
  values: Readonly<Record<number, number>>;
  /** 상한을 넘긴 행의 이유 한 줄(`derive.allocationIssues`). 있는 행만 빨갛게 + 칸 아래 문구 */
  issues: Readonly<Record<number, string>>;
  /** 입금액을 아직 안 적었으면 배분할 돈이 없다 → 입력칸을 전부 잠근다 */
  disabled: boolean;
  onChange: (orderId: number, raw: string) => void;
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
          const value = values[order.id] ?? 0;
          const issue = issues[order.id];
          return (
            <Table.Row key={order.id}>
              <Table.Td align="left">{order.orderNumber}</Table.Td>
              <Table.Td align="center">
                <OrderStatusBadge
                  status={order.status}
                  label={order.statusLabel}
                />
              </Table.Td>
              <Table.Td align="center">
                <SettlementBadge status={order.settlementStatus} />
              </Table.Td>
              <Table.Td>{formatNumber(order.outstanding)}</Table.Td>
              <Table.Td>
                {/* 상한을 넘겨도 값을 자르지 않는다 — 칸을 빨갛게 하고 얼마까지인지 아래에 적는다.
                    조용히 바꾸면 사장은 왜 다른 숫자가 됐는지 모른다(wire-settlement F4, #207) */}
                <NumericInput
                  size="sm"
                  className="w-25"
                  aria-label={`주문 ${order.orderNumber} 배분액`}
                  aria-invalid={issue !== undefined}
                  disabled={disabled}
                  value={value === 0 ? "" : formatNumber(value)}
                  onChange={(e) => onChange(order.id, e.target.value)}
                />
                {issue !== undefined ? (
                  <p
                    role="alert"
                    className="text-destructive-strong mt-1 text-xs whitespace-nowrap"
                  >
                    {issue}
                  </p>
                ) : null}
              </Table.Td>
            </Table.Row>
          );
        })}
      </Table.Body>
    </Table>
  );
}
