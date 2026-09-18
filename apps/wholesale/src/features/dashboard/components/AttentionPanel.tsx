"use client";

import { cn, Panel } from "@ondo/ui";
import Link from "next/link";
import { useAttentionQuery } from "../api/queries";
import { ATTENTION_TEXT, TAB_HREF } from "../constants";
import type { AttentionSkuView } from "../types";
import { formatNumber } from "@/shared/lib/format";

/**
 * 주의 — 입고일 지난 미송 상위 3 · 입고일 안 적은 미송 상위 2.
 *
 * 이 SKU들은 소매처가 "언제 들어오느냐"고 묻는 대상이다. 입고일을 안 적으면 소매 화면에
 * "입고일 안내 예정"으로만 보이므로 며칠째 비어 있는지를 같이 보인다.
 * 두 묶음 다 미송 탭으로 간다 — 미송 탭의 펼침·필터는 화면 state라 SKU를 URL로 못 연다.
 */
export function AttentionPanel({ now }: { now: string }) {
  const { data } = useAttentionQuery(now);

  return (
    <Panel.Body className="flex flex-col gap-6">
      <AttentionSection
        title={ATTENTION_TEXT.overdueTitle}
        count={data.overdueCount}
        items={data.overdue}
        emptyText={ATTENTION_TEXT.overdueEmpty}
        emphasized
      />
      <AttentionSection
        title={ATTENTION_TEXT.noDateTitle}
        count={data.noDateCount}
        items={data.noDate}
        emptyText={ATTENTION_TEXT.noDateEmpty}
      />
    </Panel.Body>
  );
}

function AttentionSection({
  title,
  count,
  items,
  emptyText,
  emphasized = false,
}: {
  title: string;
  count: number;
  items: readonly AttentionSkuView[];
  emptyText: string;
  /** 경과 표기를 빨간 글자로. 입고일이 **지난** 것만 — 안 적은 것은 늦은 게 아니라 비어 있는 것이다 */
  emphasized?: boolean;
}) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-medium">
          {title}{" "}
          <span className="text-muted-foreground font-normal tabular-nums">
            {formatNumber(count)} SKU
          </span>
        </h3>
        <Link
          href={TAB_HREF.backorders}
          className="text-primary shrink-0 text-sm hover:underline"
        >
          {ATTENTION_TEXT.link}
        </Link>
      </div>
      {items.length === 0 ? (
        <p className="text-muted-foreground text-sm">{emptyText}</p>
      ) : (
        <ul className="flex flex-col">
          {items.map((item) => (
            <li
              key={item.variantId}
              className="border-border flex items-center gap-2 border-b py-2 text-sm last:border-b-0"
            >
              <span className="min-w-0 flex-1 truncate">
                {item.productName}
              </span>
              <span className="bg-secondary text-muted-foreground shrink-0 rounded-full px-2 py-0.5 text-xs whitespace-nowrap">
                {item.optionLabel}
              </span>
              <span
                className={cn(
                  "shrink-0 tabular-nums",
                  emphasized ? "text-destructive-strong" : "text-foreground",
                )}
              >
                {item.agingLabel} · {formatNumber(item.qty)}장
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
