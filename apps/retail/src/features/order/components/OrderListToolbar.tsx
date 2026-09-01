"use client";

import { cn } from "@ondo/ui";
import { RotateCcw } from "lucide-react";
import Link from "next/link";
import { OrderFilterDropdown, OrderSortDropdown } from "./OrderFilterDropdown";
import {
  DEFAULT_PERIOD,
  FILTER_ALL,
  FILTER_ALL_LABEL,
  ORDERS_TEXT,
  ORDER_SORTS,
  ORDER_STATUS_LABEL,
  PERIODS,
} from "../constants";
import { ordersHref } from "../derive";
import type { OrderFilter, OrderSort, OrderStatus } from "../types";

const STATUS_VALUES = Object.keys(ORDER_STATUS_LABEL) as OrderStatus[];

/**
 * 툴바 — 필터 3축 + 초기화 + 결과 수 + 정렬.
 *
 * **`주문 N건`은 표에 실제로 보이는 행 수다.** 원본은 `주문 12건`인데 표가
 * 5행이었다(§6에 없던 새 결함). 결과 수는 파생값이지 상수가 아니고, 필터를
 * 걸면 같이 줄어야 한다 — 이 화면에는 일괄 동작이 없어서 "가려진 것이 세어지지
 * 않는다"를 증명하는 자리가 이 카운터 하나다.
 *
 * `초기화`는 조건이 하나도 안 걸렸을 때 **진짜로 못 누른다.** 링크를 회색으로만
 * 칠해 두면 눌려서 같은 화면으로 다시 이동한다(직전 회차 F11).
 */
export function OrderListToolbar({
  filter,
  sort,
  open,
  wholesalers,
  resultCount,
  canReset,
}: {
  filter: OrderFilter;
  sort: OrderSort;
  open: string | null;
  wholesalers: readonly { id: string; name: string }[];
  resultCount: number;
  canReset: boolean;
}) {
  const current = { filter, sort, open };

  const periodLabel =
    PERIODS.find((p) => p.value === filter.period)?.label ?? "";
  const wholesalerLabel =
    wholesalers.find((w) => w.id === filter.wholesaler)?.name ??
    FILTER_ALL_LABEL.wholesaler;
  const statusLabel =
    filter.status === FILTER_ALL
      ? FILTER_ALL_LABEL.status
      : ORDER_STATUS_LABEL[filter.status as OrderStatus];
  const sortLabel =
    ORDER_SORTS.find((s) => s.value === sort)?.label ?? ORDER_SORTS[0]?.label;

  return (
    <div className="flex flex-wrap items-center gap-2 pb-3">
      <OrderFilterDropdown
        label={periodLabel}
        value={filter.period}
        active={filter.period !== DEFAULT_PERIOD}
        options={PERIODS.map((period) => ({
          value: period.value,
          label: period.label,
          /* 축을 바꾸면 펼침을 접는다 — 좁힌 목록에 없는 행이 펼쳐진 채로
             주소에 남으면 뒤로 왔을 때 아무것도 안 열린다 */
          href: ordersHref(current, { period: period.value, open: null }),
        }))}
      />

      <OrderFilterDropdown
        label={wholesalerLabel}
        value={filter.wholesaler}
        active={filter.wholesaler !== FILTER_ALL}
        options={[
          {
            value: FILTER_ALL,
            label: FILTER_ALL_LABEL.wholesaler,
            href: ordersHref(current, { wholesaler: FILTER_ALL, open: null }),
          },
          ...wholesalers.map((w) => ({
            value: w.id,
            label: w.name,
            href: ordersHref(current, { wholesaler: w.id, open: null }),
          })),
        ]}
      />

      <OrderFilterDropdown
        label={statusLabel}
        value={filter.status}
        active={filter.status !== FILTER_ALL}
        options={[
          {
            value: FILTER_ALL,
            label: FILTER_ALL_LABEL.status,
            href: ordersHref(current, { status: FILTER_ALL, open: null }),
          },
          ...STATUS_VALUES.map((status) => ({
            value: status,
            label: ORDER_STATUS_LABEL[status],
            href: ordersHref(current, { status, open: null }),
          })),
        ]}
      />

      {canReset ? (
        <Link
          href="/orders"
          className="text-muted-foreground hover:bg-secondary hover:text-foreground text-body flex h-8 items-center gap-1.5 rounded-control px-2"
        >
          <RotateCcw aria-hidden className="size-3.5" />
          {ORDERS_TEXT.reset}
        </Link>
      ) : (
        /* 누를 것이 없을 때는 링크가 아니라 글자다. `aria-disabled`만 걸고
           `<a>`로 두면 눌려서 같은 화면으로 다시 이동한다 */
        <span
          aria-disabled="true"
          className={cn(
            "text-border-strong text-body flex h-8 items-center gap-1.5 rounded-control px-2",
          )}
        >
          <RotateCcw aria-hidden className="size-3.5" />
          {ORDERS_TEXT.reset}
        </span>
      )}

      <div className="ml-auto flex items-center gap-3 phone:ml-0 phone:w-full phone:justify-between">
        <span className="text-muted-foreground text-body">
          주문 <b className="text-foreground font-medium">{resultCount}</b>건
        </span>
        <OrderSortDropdown
          value={sort}
          selectedLabel={sortLabel ?? ""}
          options={ORDER_SORTS.map((option) => ({
            value: option.value,
            label: option.label,
            href: ordersHref(current, { sort: option.value }),
          }))}
        />
      </div>
    </div>
  );
}
