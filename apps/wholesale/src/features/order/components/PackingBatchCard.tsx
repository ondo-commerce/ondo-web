"use client";

import { Button, Table } from "@ondo/ui";
import type { PackingBatch } from "../types";
import { formatNumber } from "@/shared/lib/format";

/**
 * 포장 대기 회차 한 장.
 *
 * 줄 표기는 SKU 코드가 아니라 `상품명 (색상 - 사이즈)`다(Figma 실측) —
 * 포장하는 사람이 손에 든 옷과 대조하는 표라 코드보다 이름이 빨리 읽힌다.
 *
 * `삭제`는 이 회차의 `포장 준비`를 정확히 되돌린다. 되돌릴 값이 회차 안에 다 있어서
 * 확인 다이얼로그를 두지 않았다 — 다시 입력해 만들면 그만이다.
 */
export function PackingBatchCard({
  batch,
  onRemove,
}: {
  batch: PackingBatch;
  onRemove: () => void;
}) {
  return (
    <section className="border-border rounded-control border p-3">
      <header className="mb-2 flex items-center justify-between gap-2">
        <h4 className="text-sm font-medium">포장 대기 #{batch.no}</h4>
        <Button variant="line" size="sm" onClick={onRemove}>
          삭제
        </Button>
      </header>

      <Table>
        <Table.Head>
          <Table.Row>
            <Table.Th align="left">SKU</Table.Th>
            <Table.Th>포장 대기 수</Table.Th>
          </Table.Row>
        </Table.Head>
        <Table.Body>
          {batch.lines.map((line) => (
            <Table.Row key={line.lineId}>
              <Table.Td align="left">{line.label}</Table.Td>
              <Table.Td>{formatNumber(line.qty)}</Table.Td>
            </Table.Row>
          ))}
        </Table.Body>
      </Table>
    </section>
  );
}
