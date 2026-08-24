"use client";

import { Chip, Input, Table } from "@ondo/ui";
import { useState, type ReactNode } from "react";
import { AllocatedCheck } from "./AllocatedCheck";
import { OrderLineFilterBar } from "./OrderLineFilterBar";
import { QtyDelta } from "./QtyDelta";
import { LINE_FILTER_ALL } from "../constants";
import {
  allocatedAfter,
  assignableAfter,
  assignableQty,
  backorderAfter,
  isEditablePhase,
  isLineAllocated,
  isLineOutOfStock,
  shipQty,
  unallocatedAfter,
  unallocatedQty,
} from "../derive";
import type { Order, OrderLine } from "../types";
import { formatNumber } from "@/shared/lib/format";

/**
 * 펼침 영역의 주문 라인 표.
 *
 * 숫자는 전부 `derive.ts`의 순수 함수가 만든다 — 이 파일에 계산식이 없다.
 * 같은 공식이 확인 다이얼로그·포장 회차 생성에서도 쓰이는데 JSX 안에 흩어 놓으면
 * 화면끼리 숫자가 갈린다.
 *
 * `이번 출고` 칸은 3상태다(Figma 실측):
 *   미할당 0    → 완료 ✓ (잠김)
 *   가용재고 0  → 비활성 회색 입력칸
 *   그 외       → 흰 입력칸
 * 취소·출고 완료 국면은 애초에 입력을 받지 않는다(derive.isEditablePhase).
 */
export function OrderLineTable({
  order,
  inputs,
  onInputChange,
  footer,
}: {
  order: Order;
  /** 라인 id → 입력 문자열. 빈칸과 0을 구분하려고 문자열 그대로 들고 있는다 */
  inputs: Readonly<Record<string, string>>;
  onInputChange: (lineId: string, raw: string) => void;
  /** 표 하단 우측에 붙는 액션(포장 준비). 없는 국면에서는 넘기지 않는다 */
  footer?: ReactNode;
}) {
  const [color, setColor] = useState(LINE_FILTER_ALL);
  const [size, setSize] = useState(LINE_FILTER_ALL);

  const colorNames = [...new Set(order.lines.map((l) => l.color))];
  const sizeNames = [...new Set(order.lines.map((l) => l.size))];

  const lines = order.lines.filter(
    (l) =>
      (color === LINE_FILTER_ALL || l.color === color) &&
      (size === LINE_FILTER_ALL || l.size === size),
  );

  const editable = isEditablePhase(order.status);

  /** `이번 출고` 칸 — 3상태 중 하나 */
  const shipCell = (line: OrderLine) => {
    if (isLineAllocated(line)) return <AllocatedCheck />;
    if (!editable) return <span className="text-muted-foreground">-</span>;

    const blocked = isLineOutOfStock(line);
    return (
      <Input
        size="sm"
        numeric
        inputMode="numeric"
        className="w-20"
        aria-label={`${line.productName} ${line.color} ${line.size} 이번 출고`}
        disabled={blocked}
        value={inputs[line.id] ?? ""}
        onChange={(e) => onInputChange(line.id, e.target.value)}
      />
    );
  };

  return (
    <div>
      <OrderLineFilterBar
        colors={colorNames}
        sizes={sizeNames}
        color={color}
        size={size}
        onColorChange={setColor}
        onSizeChange={setSize}
      />

      {lines.length === 0 ? (
        <p className="text-muted-foreground py-8 text-center text-sm">
          조건에 맞는 라인이 없습니다
        </p>
      ) : (
        <Table>
          <Table.Head>
            <Table.Row>
              {/* 첫 열은 상품명+단가라 붙일 이름이 없다 */}
              <Table.Th align="left" />
              <Table.Th align="left">SKU</Table.Th>
              <Table.Th align="left">색상</Table.Th>
              <Table.Th align="center">사이즈</Table.Th>
              <Table.Th>주문수량</Table.Th>
              <Table.Th>출고진행</Table.Th>
              <Table.Th>미할당</Table.Th>
              <Table.Th>가용재고(미송)</Table.Th>
              <Table.Th align="center">이번 출고</Table.Th>
            </Table.Row>
          </Table.Head>
          <Table.Body>
            {lines.map((line) => {
              const n = shipQty(inputs, line);
              const unallocated = unallocatedQty(line);
              return (
                <Table.Row key={line.id}>
                  <Table.Td align="left">
                    <span className="block">{line.productName}</span>
                    <span className="text-muted-foreground block text-xs">
                      ₩{formatNumber(line.unitPrice)}
                    </span>
                  </Table.Td>
                  <Table.Td align="left">
                    <Chip tone="sub" shape="square" className="text-body">
                      {line.skuId}
                    </Chip>
                  </Table.Td>
                  <Table.Td align="left">{line.color}</Table.Td>
                  <Table.Td align="center">{line.size}</Table.Td>
                  <Table.Td>{formatNumber(line.qty)}</Table.Td>
                  <Table.Td>
                    <QtyDelta
                      before={line.allocatedQty}
                      after={allocatedAfter(line, n)}
                    />
                  </Table.Td>
                  <Table.Td>
                    {/* 다 나간 라인의 0은 회색이다 — 더 볼 것이 없다는 뜻이다 */}
                    <QtyDelta
                      before={unallocated}
                      after={unallocatedAfter(line, n)}
                      muted={unallocated === 0}
                    />
                  </Table.Td>
                  <Table.Td>
                    <QtyDelta
                      before={assignableQty(line)}
                      after={assignableAfter(line, n)}
                    />
                    <span className="text-muted-foreground ml-1">
                      (
                      {line.backorderQty === 0 ? (
                        "-"
                      ) : (
                        <QtyDelta
                          before={line.backorderQty}
                          after={backorderAfter(line, n)}
                        />
                      )}
                      )
                    </span>
                  </Table.Td>
                  <Table.Td align="center">{shipCell(line)}</Table.Td>
                </Table.Row>
              );
            })}
          </Table.Body>
        </Table>
      )}

      {footer ? <div className="mt-3 flex justify-end">{footer}</div> : null}
    </div>
  );
}
