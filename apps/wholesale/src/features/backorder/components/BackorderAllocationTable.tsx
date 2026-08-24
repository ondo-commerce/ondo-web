"use client";

import { Input, Table } from "@ondo/ui";
import { formatOrderedAt, parseAllocationInput, remainingQty } from "../derive";
import type { AllocationDraft, BackorderLine } from "../types";
import { formatNumber } from "@/shared/lib/format";

/**
 * 펼친 SKU를 기다리는 주문들. **행 순서가 곧 배분 우선순위다**(주문 일시 오래된 순).
 * 정렬 컨트롤은 없다 — 선착순이 기본형이고, 순서를 바꿀 화면이 아직 없다(glossary §4.8).
 *
 * 입력칸은 `배분 수량` 하나뿐이다. 나머지 6열은 주문 스냅샷이라 이 화면에서 고칠 값이 아니다.
 * 주문번호도 평문이다 — 주문 탭이 아직 없다.
 */
export function BackorderAllocationTable({
  lines,
  draft,
  onChange,
}: {
  /** 이미 정렬된 행. 정렬을 컴포넌트 안에서 다시 하지 않는다 — 카운터·요약이 같은 순서를 봐야 한다 */
  lines: BackorderLine[];
  draft: AllocationDraft;
  onChange: (lineId: string, next: number) => void;
}) {
  return (
    <Table>
      <Table.Head>
        <Table.Row>
          <Table.Th align="left">주문번호</Table.Th>
          <Table.Th align="center">주문 일시</Table.Th>
          <Table.Th>미송 경과일</Table.Th>
          <Table.Th align="left">거래처</Table.Th>
          <Table.Th>미송 수량</Table.Th>
          <Table.Th>배분 수량</Table.Th>
          <Table.Th>잔여 미송</Table.Th>
        </Table.Row>
      </Table.Head>
      <Table.Body>
        {lines.map((line) => {
          const allocated = draft[line.id] ?? 0;
          const remaining = remainingQty(line, allocated);
          return (
            <Table.Row key={line.id}>
              <Table.Td align="left">{line.orderNo}</Table.Td>
              <Table.Td align="center">{formatOrderedAt(line)}</Table.Td>
              <Table.Td tone="muted">{line.elapsedDays}일</Table.Td>
              <Table.Td align="left">{line.customer}</Table.Td>
              <Table.Td>{formatNumber(line.qty)}</Table.Td>
              <Table.Td>
                <Input
                  size="sm"
                  numeric
                  inputMode="numeric"
                  className="w-16"
                  aria-label={`${line.orderNo} 배분 수량`}
                  value={String(allocated)}
                  onChange={(e) =>
                    onChange(line.id, parseAllocationInput(e.target.value))
                  }
                />
              </Table.Td>
              {/* 0은 "다 줬다", 1 이상은 "아직 못 준 게 남았다" — 남은 쪽만 빨강이다 */}
              <Table.Td tone={remaining === 0 ? "muted" : "danger"}>
                {formatNumber(remaining)}
              </Table.Td>
            </Table.Row>
          );
        })}
      </Table.Body>
    </Table>
  );
}
