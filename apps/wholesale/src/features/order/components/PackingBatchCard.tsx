"use client";

import { Button, Table } from "@ondo/ui";
import type { PackingBatchView } from "../types";
import { formatNumber } from "@/shared/lib/format";

/**
 * 포장 대기 회차 한 장(= 포장 하나).
 *
 * 줄 표기는 SKU 코드가 아니라 `상품명 (색상 - 사이즈)`다(Figma 실측) —
 * 포장하는 사람이 손에 든 옷과 대조하는 표라 코드보다 이름이 빨리 읽힌다.
 *
 * `삭제`는 서버가 배분을 통째로 되돌린다(출고진행이 줄고 미송이 되살아난다).
 * 확인 다이얼로그를 두지 않았다 — 다시 입력해 만들면 그만이다.
 * 활성 조건은 서버 `isCancellable` 그대로 — 출고에 묶인 포장은 여기서 못 지운다.
 */
export function PackingBatchCard({
  batch,
  disabled,
  onRemove,
}: {
  batch: PackingBatchView;
  /** 요청이 나가는 동안 잠근다 */
  disabled?: boolean;
  onRemove: () => void;
}) {
  return (
    <section className="border-border rounded-control border p-3">
      <header className="mb-2 flex items-center justify-between gap-2">
        <h4 className="text-sm font-medium">포장 대기 #{batch.no}</h4>
        <Button
          variant="line"
          size="sm"
          disabled={disabled || !batch.isCancellable}
          onClick={onRemove}
        >
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
            <Table.Row key={line.id}>
              <Table.Td align="left">{line.label}</Table.Td>
              <Table.Td>{formatNumber(line.qty)}</Table.Td>
            </Table.Row>
          ))}
        </Table.Body>
      </Table>
    </section>
  );
}
