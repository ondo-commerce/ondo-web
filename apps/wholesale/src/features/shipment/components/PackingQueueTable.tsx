"use client";

import { Button, Checkbox, Table } from "@ondo/ui";
import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { PickupMethodBadge } from "./PickupMethodBadge";
import { PickupMethodFilter } from "./PickupMethodFilter";
import { FILTER_ALL, type PickupFilterValue } from "../constants";
import {
  filterByPickupMethod,
  formatDateTime,
  sortReadyItems,
} from "../derive";
import type { PackingItem } from "../types";
import { formatNumber } from "@/shared/lib/format";

/**
 * 소매처 행을 펼쳤을 때 나오는 포장 대기 표.
 *
 * 수령방식 필터는 **이 표가 들고 있는다**(재고 탭 InventoryStockTable과 같은 방식) —
 * 소매처마다 대기 줄의 구성이 달라서 다른 행을 펼치면 필터도 새로 시작하는 게 맞다.
 *
 * 헤더 체크박스가 켜는 대상은 **필터가 걸러 내고 남은 보이는 줄**뿐이다.
 * 안 보이는 줄까지 켜면 우측 패널에 화면에 없는 품목이 나타난다.
 */
export function PackingQueueTable({
  items,
  selectedIds,
  onToggle,
  onToggleVisible,
  onRestrictTo,
}: {
  /** 그 소매처의 대기 줄 전부. 정렬·필터는 여기서 한다 */
  items: readonly PackingItem[];
  selectedIds: readonly string[];
  onToggle: (itemId: string) => void;
  /** 헤더 체크박스. 보이는 줄 id를 통째로 넘긴다 */
  onToggleVisible: (itemIds: string[], checked: boolean) => void;
  /** 필터를 바꿨을 때 살아남을 선택. 화면에서 사라진 줄의 체크를 같이 거둔다 */
  onRestrictTo: (itemIds: string[]) => void;
}) {
  const [pickup, setPickup] = useState<PickupFilterValue>(FILTER_ALL);

  const rowsFor = (value: PickupFilterValue) =>
    sortReadyItems(
      value === FILTER_ALL ? items : filterByPickupMethod(items, value),
    );

  const visible = rowsFor(pickup);
  const allChecked =
    visible.length > 0 && visible.every((i) => selectedIds.includes(i.id));

  /*
   * 필터를 바꾸면 안 보이게 된 줄의 체크를 거둔다. 남겨 두면 우측 패널이
   * 표에 없는 품목을 세고 있어서, 왜 합계가 그 숫자인지 화면에서 설명되지 않는다.
   * 보이는 줄의 체크는 그대로 둔다 — 골라 둔 것을 필터 한 번에 날리지 않는다.
   */
  const changePickup = (next: PickupFilterValue) => {
    setPickup(next);
    onRestrictTo(rowsFor(next).map((i) => i.id));
  };

  return (
    <div>
      <PickupMethodFilter value={pickup} onChange={changePickup} />

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
                    onToggleVisible(
                      visible.map((i) => i.id),
                      checked === true,
                    )
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
            {visible.map((item) => (
              <Table.Row key={item.id} selected={selectedIds.includes(item.id)}>
                <Table.Td align="center">
                  <Checkbox
                    aria-label={`${item.productName} 선택`}
                    checked={selectedIds.includes(item.id)}
                    onCheckedChange={() => onToggle(item.id)}
                  />
                </Table.Td>
                <Table.Td align="left" tone="muted">
                  {item.skuCode}
                </Table.Td>
                <Table.Td align="left">{item.productName}</Table.Td>
                <Table.Td align="center">
                  <PickupMethodBadge method={item.pickupMethod} />
                </Table.Td>
                <Table.Td align="left" tone="muted">
                  {formatDateTime(item.orderedAt)}
                </Table.Td>
                <Table.Td align="left">
                  {/*
                   * 주문 상세 라우트 규약이 아직 없어서 목록으로 보낸다.
                   * onClick + router.push가 아니라 실제 <a>로 두는 이유는
                   * 새 탭 열기를 죽이지 않기 위해서다(Button.asChild 주석).
                   */}
                  <Button variant="link" size="sm" asChild>
                    <Link href="/orders">
                      {item.orderCode}
                      <ArrowUpRight aria-hidden className="size-3.5" />
                    </Link>
                  </Button>
                </Table.Td>
                <Table.Td>{formatNumber(item.qty)}</Table.Td>
              </Table.Row>
            ))}
          </Table.Body>
        </Table>
      )}
    </div>
  );
}
