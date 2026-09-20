"use client";

import { Badge, Table } from "@ondo/ui";
import { sortOutboundRows } from "../derive";
import type { OutboundRowView } from "../types";
import { formatNumber } from "@/shared/lib/format";

/**
 * `출고 완료` 단계의 표. **`수령 방식` 열이 빠진다** — 이미 넘긴 물건이라
 * 어떻게 넘겼는지는 이 목록에서 고를 기준이 아니고, 필요하면 장끼 카드에 있다.
 *
 * 배지는 **회색**이다(판정 D4). Badge는 파랑·회색 2색뿐이고(§8.0), 이 목록은
 * 이미 `출고 완료` 칩 아래에 있어서 색으로 더 말할 것이 없다.
 * 출고 완료 판정은 `shippedAt != null`이다(응답에 status 필드가 없다 — 스펙 설명).
 */
export function ShippedTable({
  rows,
  selectedId,
  onSelect,
}: {
  rows: readonly OutboundRowView[];
  selectedId: number | null;
  onSelect: (outboundId: number) => void;
}) {
  /* 출고 일시 최신순(판정 D8) */
  const sorted = sortOutboundRows(rows, (row) => row.shippedAtIso ?? "");

  return (
    <Table>
      <Table.Head>
        <Table.Row>
          <Table.Th align="left">상태</Table.Th>
          <Table.Th align="left">포장번호</Table.Th>
          <Table.Th align="left">상품 요약</Table.Th>
          <Table.Th align="left">출고 일시</Table.Th>
          <Table.Th>수량</Table.Th>
        </Table.Row>
      </Table.Head>
      <Table.Body>
        {sorted.map((row) => (
          <Table.Row
            key={row.id}
            selected={selectedId === row.id}
            tabIndex={0}
            aria-label={`${row.label} 장끼`}
            className="cursor-pointer"
            onClick={() => onSelect(row.id)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSelect(row.id);
              }
            }}
          >
            <Table.Td align="left">
              <Badge tone="done">
                {row.shippedAt === null ? "출고 전" : "출고 완료"}
              </Badge>
            </Table.Td>
            <Table.Td align="left">{row.label}</Table.Td>
            <Table.Td align="left">{row.summary}</Table.Td>
            <Table.Td align="left" tone="muted">
              {row.shippedAt ?? "-"}
            </Table.Td>
            <Table.Td>{formatNumber(row.totalQty)}</Table.Td>
          </Table.Row>
        ))}
      </Table.Body>
    </Table>
  );
}
