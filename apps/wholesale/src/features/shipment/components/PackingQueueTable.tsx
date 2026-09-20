"use client";

import { Button, Checkbox, Table } from "@ondo/ui";
import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { PickupMethodBadge } from "./PickupMethodBadge";
import { PickupMethodFilter } from "./PickupMethodFilter";
import { FILTER_ALL, type ReceiveByFilterValue } from "../constants";
import { filterByReceiveBy, sortReadyRows } from "../derive";
import type { PackingRowView } from "../types";
import { formatNumber } from "@/shared/lib/format";

/**
 * 소매처 행을 펼쳤을 때 나오는 포장 대기 표.
 *
 * 수령방식 필터는 **이 표가 들고 있는다**(재고 탭 InventoryStockTable과 같은 방식) —
 * 소매처마다 대기 줄의 구성이 달라서 다른 행을 펼치면 필터도 새로 시작하는 게 맞다.
 * 서버 `receiveBy` 파라미터는 안 쓴다 — 받은 목록 안에서 거른다. 재요청 없이 바로 바뀌고,
 * 머리의 건수·총수량(필터와 무관)과도 어긋나지 않는다.
 *
 * 헤더 체크박스가 켜는 대상은 **필터가 걸러 내고 남은 보이는 줄**뿐이다.
 * 안 보이는 줄까지 켜면 우측 패널에 화면에 없는 품목이 나타난다.
 */
export function PackingQueueTable({
  rows,
  selectedIds,
  onToggle,
  onToggleVisible,
  onRestrictTo,
}: {
  /** 그 소매처의 대기 줄 전부. 정렬·필터는 여기서 한다 */
  rows: readonly PackingRowView[];
  selectedIds: ReadonlySet<number>;
  onToggle: (row: PackingRowView) => void;
  /** 헤더 체크박스. 보이는 줄을 통째로 넘긴다 */
  onToggleVisible: (rows: PackingRowView[], checked: boolean) => void;
  /** 필터를 바꿨을 때 살아남을 선택. 화면에서 사라진 줄의 체크를 같이 거둔다 */
  onRestrictTo: (ids: number[]) => void;
}) {
  const [receiveBy, setReceiveBy] = useState<ReceiveByFilterValue>(FILTER_ALL);

  const rowsFor = (value: ReceiveByFilterValue) =>
    sortReadyRows(value === FILTER_ALL ? rows : filterByReceiveBy(rows, value));

  const visible = rowsFor(receiveBy);
  const allChecked =
    visible.length > 0 && visible.every((row) => selectedIds.has(row.id));

  /*
   * 필터를 바꾸면 안 보이게 된 줄의 체크를 거둔다. 남겨 두면 우측 패널이
   * 표에 없는 품목을 세고 있어서, 왜 합계가 그 숫자인지 화면에서 설명되지 않는다.
   * 보이는 줄의 체크는 그대로 둔다 — 골라 둔 것을 필터 한 번에 날리지 않는다.
   */
  const changeReceiveBy = (next: ReceiveByFilterValue) => {
    setReceiveBy(next);
    onRestrictTo(rowsFor(next).map((row) => row.id));
  };

  return (
    <div>
      <PickupMethodFilter value={receiveBy} onChange={changeReceiveBy} />

      {visible.length === 0 ? (
        <p className="text-muted-foreground py-8 text-center text-sm">
          조건에 맞는 품목이 없습니다
        </p>
      ) : (
        <Table>
          <Table.Head>
            <Table.Row>
              <Table.Th align="center" className="w-10">
                <Checkbox
                  aria-label="보이는 줄 전체 선택"
                  checked={allChecked}
                  onCheckedChange={(checked) =>
                    onToggleVisible(visible, checked === true)
                  }
                />
              </Table.Th>
              <Table.Th align="left">SKU</Table.Th>
              <Table.Th align="left">상품명</Table.Th>
              <Table.Th align="center">수령방식</Table.Th>
              <Table.Th align="left">주문 일시</Table.Th>
              <Table.Th align="left">주문코드</Table.Th>
              <Table.Th>수량</Table.Th>
            </Table.Row>
          </Table.Head>
          <Table.Body>
            {visible.map((row) => (
              <Table.Row key={row.id} selected={selectedIds.has(row.id)}>
                <Table.Td align="center">
                  <Checkbox
                    aria-label={`${row.productName} 선택`}
                    checked={selectedIds.has(row.id)}
                    onCheckedChange={() => onToggle(row)}
                  />
                </Table.Td>
                <Table.Td align="left" tone="muted">
                  {row.sku}
                </Table.Td>
                <Table.Td align="left">{row.productName}</Table.Td>
                <Table.Td align="center">
                  <PickupMethodBadge receiveBy={row.receiveBy} />
                </Table.Td>
                <Table.Td align="left" tone="muted">
                  {row.orderedAt}
                </Table.Td>
                <Table.Td align="left">
                  {/*
                   * 주문 상세 라우트 규약이 아직 없어서 목록으로 보낸다.
                   * onClick + router.push가 아니라 실제 <a>로 두는 이유는
                   * 새 탭 열기를 죽이지 않기 위해서다(Button.asChild 주석).
                   */}
                  <Button variant="link" size="sm" asChild>
                    <Link href="/orders">
                      {row.orderNumber}
                      <ArrowUpRight aria-hidden className="size-3.5" />
                    </Link>
                  </Button>
                </Table.Td>
                <Table.Td>{formatNumber(row.qty)}</Table.Td>
              </Table.Row>
            ))}
          </Table.Body>
        </Table>
      )}
    </div>
  );
}
