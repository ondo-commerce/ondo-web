"use client";

import { Badge, ColorDot } from "@ondo/ui";
import { BulkQtyPopover } from "./BulkQtyPopover";
import { QtyStepper } from "./QtyStepper";
import {
  QTY_FOOTNOTE,
  QTY_ISSUE_TEXT,
  SOLD_OUT_BADGE,
  colorHex,
} from "../constants";
import {
  formatWon,
  optionSummaryText,
  parseQty,
  rowSubtotal,
  type QtyIssue,
} from "../derive";
import type { ColorGroup, ProductDetail } from "../types";

/**
 * 게시 옵션 표 — 색상 그룹 머리 + 그 아래 사이즈 행.
 *
 * 그룹마다 표를 끊는데도 열이 안 어긋나는 것은 `table-fixed` + `<colgroup>`의
 * 고정 비율(42/18/20/20%) 덕이다. 비율은 확정 와이어프레임 `.opt .tbl` 실측값이고
 * 레이아웃 기하라 인라인 style로 적는다 — Tailwind 분수에 42%가 없다.
 *
 * **수량 칸만 입력이다.** 판매가·소계는 도매처가 정한 값이라 화면에서 못 고친다.
 */
export function OptionTable({
  product,
  drafts,
  issues,
  onChangeQty,
  onBulkApply,
  bulkNotice,
  disabled,
}: {
  product: ProductDetail;
  /** skuId → 칸에 있는 글자 그대로 */
  drafts: Readonly<Record<string, string>>;
  /** skuId → 걸린 이유. 값을 되돌린 뒤에도 남아야 해서 따로 들고 있다 */
  issues: Readonly<Record<string, QtyIssue | null>>;
  onChangeQty: (skuId: string, next: string) => void;
  onBulkApply: (group: ColorGroup, value: string) => void;
  /** 일괄 입력 직후의 결과 신호. 어느 그룹에 몇 장이 들어갔는지 */
  bulkNotice: string | null;
  /** 게시 내림·시즌 종료면 수량을 넣을 수 없다 */
  disabled: boolean;
}) {
  return (
    <section className="mt-6">
      <h2 className="text-muted-foreground text-body mb-2.5">
        게시 옵션{" "}
        <span className="text-muted-foreground">
          {optionSummaryText(product)}
        </span>
      </h2>

      {/* 일괄 입력의 결과를 한 곳에서 알린다. 표 안에 흩어 놓으면 방금 무엇이
          바뀌었는지 찾아 헤매게 되고, 스크린리더는 아무것도 못 듣는다 */}
      <p aria-live="polite" className="sr-only">
        {bulkNotice ?? ""}
      </p>

      {product.colorGroups.map((group) => (
        <div key={group.color}>
          <div className="bg-secondary text-body mt-3 flex items-center gap-2 rounded-md px-3 py-2.5 font-medium first:mt-0">
            <ColorDot color={colorHex(group.color)} className="size-3.5" />
            {group.displayName}
            <BulkQtyPopover
              colorLabel={group.displayName}
              rowCount={group.rows.length}
              onApply={(value) => onBulkApply(group, value)}
              disabled={disabled}
            />
          </div>

          <table className="w-full table-fixed border-collapse">
            <colgroup>
              <col style={{ width: "42%" }} />
              <col style={{ width: "18%" }} />
              <col style={{ width: "20%" }} />
              <col style={{ width: "20%" }} />
            </colgroup>

            {/* 머리글은 첫 그룹에만 둔다 — 그룹마다 반복하면 표가 아니라
                작은 표 여러 개로 읽힌다 (원본도 첫 표에만 thead가 있다) */}
            {group === product.colorGroups[0] ? (
              <thead>
                <tr className="text-muted-foreground text-body">
                  <th className="px-3 py-2 text-left font-normal">사이즈</th>
                  <th className="px-3 py-2 text-right font-normal">판매가</th>
                  <th className="px-3 py-2 text-center font-normal">수량</th>
                  <th className="px-3 py-2 text-right font-normal">소계</th>
                </tr>
              </thead>
            ) : null}

            <tbody>
              {group.rows.map((row) => {
                const raw = drafts[row.skuId] ?? "";
                const { qty } = parseQty(raw);
                const issue = issues[row.skuId] ?? null;
                const label = `${group.displayName} ${row.size} 수량`;

                return (
                  <tr
                    key={row.skuId}
                    className="border-border border-b last:border-b-0"
                  >
                    <td className="px-3 py-2.5 text-left">
                      <span className="flex flex-wrap items-center gap-1.5">
                        {row.size}
                        {/* 재고 수치는 주지 않는다(게이트 Q1). 살 수 있는지
                            없는지만 말한다 — 미송으로는 주문이 된다 */}
                        {row.soldOut ? <Badge>{SOLD_OUT_BADGE}</Badge> : null}
                      </span>
                      {issue ? (
                        /* 값만 되돌리고 말을 안 하면 "고장난 칸"이 된다 */
                        <span className="text-destructive mt-1 block text-xs">
                          {QTY_ISSUE_TEXT[issue]}
                        </span>
                      ) : null}
                    </td>

                    <td className="px-3 py-2.5 text-right tabular-nums">
                      {formatWon(row.price)}
                    </td>

                    <td className="px-3 py-2.5 text-center">
                      <QtyStepper
                        label={label}
                        value={raw}
                        disabled={disabled}
                        onChange={(next) => onChangeQty(row.skuId, next)}
                      />
                    </td>

                    <td className="px-3 py-2.5 text-right tabular-nums">
                      {qty > 0 ? (
                        formatWon(rowSubtotal(row, qty))
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ))}

      <p className="text-muted-foreground mt-2.5 text-xs">{QTY_FOOTNOTE}</p>

      {bulkNotice ? (
        <p className="text-secondary-foreground mt-1.5 text-xs">{bulkNotice}</p>
      ) : null}
    </section>
  );
}
