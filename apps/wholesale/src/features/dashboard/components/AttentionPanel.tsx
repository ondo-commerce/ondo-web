"use client";

import { cn, Panel } from "@ondo/ui";
import { useAttentionQuery } from "../api/queries";
import type { AttentionSkuView } from "../types";
import { formatNumber } from "@/shared/lib/format";

export function AttentionPanel({ now }: { now: string }) {
  const { data } = useAttentionQuery(now);

  return (
    <Panel.Body>
      <dl className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-body tabular-nums">
        <div className="flex items-baseline gap-1">
          <dt className="text-muted-foreground">입고 지연</dt>
          <dd
            className={cn(
              "font-medium",
              data.overdueCount > 0 && "text-destructive-strong",
            )}
          >
            옵션 {formatNumber(data.overdueCount)}개
          </dd>
        </div>
        <div className="flex items-baseline gap-1">
          <dt className="text-muted-foreground">
            <span aria-hidden className="mr-2">
              ·
            </span>
            입고일 미정
          </dt>
          <dd className="font-medium">
            옵션 {formatNumber(data.noDateCount)}개
          </dd>
        </div>
      </dl>

      {data.overdue.length + data.noDate.length === 0 ? (
        <p className="text-muted-foreground py-8 text-center text-sm">
          확인할 미송이 없어요
        </p>
      ) : (
        <table className="mt-3 w-full table-fixed text-left text-sm">
          <caption className="sr-only">
            입고일이 지난 미송과 입고일이 정해지지 않은 미송
          </caption>
          <thead className="text-muted-foreground text-body">
            <tr>
              <th
                scope="col"
                className="border-border w-24 border-b pb-2 font-normal"
              >
                경과
              </th>
              <th
                scope="col"
                className="border-border border-b pb-2 font-normal"
              >
                상품 · 옵션
              </th>
              <th
                scope="col"
                className="border-border w-20 border-b pb-2 text-right font-normal"
              >
                남은 수량
              </th>
            </tr>
          </thead>
          <tbody className="divide-border divide-y">
            {data.overdue.map((item) => (
              <AttentionRow key={item.variantId} item={item} overdue />
            ))}
            {data.noDate.map((item) => (
              <AttentionRow key={item.variantId} item={item} />
            ))}
          </tbody>
        </table>
      )}
      {data.overdueCount > data.overdue.length ||
      data.noDateCount > data.noDate.length ? (
        <p className="text-muted-foreground mt-3 text-xs tabular-nums">
          {formatNumber(data.overdueCount + data.noDateCount)}개 중{" "}
          {formatNumber(data.overdue.length + data.noDate.length)}개 표시
        </p>
      ) : null}
    </Panel.Body>
  );
}

function AttentionRow({
  item,
  overdue = false,
}: {
  item: AttentionSkuView;
  overdue?: boolean;
}) {
  return (
    <tr>
      <td className="py-3 pr-2 align-top">
        <p
          className={cn(
            "text-base tabular-nums",
            overdue ? "text-destructive-strong font-medium" : "text-foreground",
          )}
        >
          {overdue
            ? item.agingLabel.replace(/^D\+(\d+)$/, "$1일 지남")
            : item.agingLabel}
        </p>
        <p className="text-muted-foreground mt-1 text-xs">
          {overdue ? "입고 지연" : "입고일 미정"}
        </p>
      </td>
      <td className="py-3 pr-3 align-top">
        <p className="break-words font-medium">{item.productName}</p>
        <p className="text-muted-foreground mt-1 break-words text-body">
          {item.optionLabel}
        </p>
      </td>
      <td className="py-3 text-right align-top whitespace-nowrap tabular-nums">
        {formatNumber(item.qty)}장
      </td>
    </tr>
  );
}
