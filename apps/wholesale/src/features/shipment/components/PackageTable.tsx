"use client";

import { Table } from "@ondo/ui";
import { PickupMethodBadge } from "./PickupMethodBadge";
import { sortOutboundRows } from "../derive";
import type { OutboundRowView } from "../types";
import { formatNumber } from "@/shared/lib/format";

/**
 * `출고 대기` 단계의 표. **체크박스가 없다** — 여기서 고르는 것은 여러 줄을 묶는
 * 일이 아니라 이미 묶인 것 하나를 여는 일이라, 선택이 항상 한 행이다.
 *
 * 수령방식 필터도 없다. 포장이 끝난 뒤에는 수령 방식이 묶음을 가르는 축이 아니다.
 */
export function PackageTable({
  rows,
  selectedId,
  onSelect,
}: {
  rows: readonly OutboundRowView[];
  selectedId: number | null;
  onSelect: (outboundId: number) => void;
}) {
  /* 포장 일시 최신순(판정 D8) */
  const sorted = sortOutboundRows(rows, (row) => row.createdAtIso);

  return (
    <Table>
      <Table.Head>
        <Table.Row>
          <Table.Th align="left">포장번호</Table.Th>
          <Table.Th align="left">상품 요약</Table.Th>
          <Table.Th align="center">수령 방식</Table.Th>
          <Table.Th align="left">포장 일시</Table.Th>
          <Table.Th>수량</Table.Th>
        </Table.Row>
      </Table.Head>
      <Table.Body>
        {sorted.map((row) => (
          <Table.Row
            key={row.id}
            selected={selectedId === row.id}
            tabIndex={0}
            aria-label={`${row.label} 포장 상세`}
            className="cursor-pointer"
            onClick={() => onSelect(row.id)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSelect(row.id);
              }
            }}
          >
            <Table.Td align="left">{row.label}</Table.Td>
            <Table.Td align="left">{row.summary}</Table.Td>
            <Table.Td align="center">
              <PickupMethodBadge receiveBy={row.receiveBy} />
            </Table.Td>
            <Table.Td align="left" tone="muted">
              {row.createdAt}
            </Table.Td>
            <Table.Td>{formatNumber(row.totalQty)}</Table.Td>
          </Table.Row>
        ))}
      </Table.Body>
    </Table>
  );
}
