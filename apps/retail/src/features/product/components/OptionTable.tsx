"use client";

import { Badge, ColorDot, cn } from "@ondo/ui";
import { BulkQtyPopover } from "./BulkQtyPopover";
import { QtyStepper } from "@/shared/components/QtyStepper";
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
 * **표 하나에 `<tbody>`를 색상 수만큼 둔다.** 그룹마다 `<table>`을 끊으면 열
 * 이름이 첫 표에만 남아서, 둘째·셋째 그룹의 `13,000원`이 판매가인지 소계인지
 * 보조기술에서 구분되지 않는다. 눈에는 `table-fixed` 덕에 열이 맞아 보이지만
 * 읽히기로는 머리 없는 표 두 개다. 대신 열 이름 줄이 첫 색상 머리보다 **위로**
 * 올라간다 — 확정 와이어프레임과 다른 유일한 지점이고, 열 이름이 세 그룹 전부를
 * 덮는다는 사실과도 맞는다.
 *
 * 열 폭이 비율(42/18/20/20%)이 아니라 rem 고정인 이유: 수량 스테퍼는 폭이
 * 줄지 않는데 20%는 390px에서 68px까지 줄어 옆 `소계` 칸을 42px 덮었다.
 * 값을 넣는 칸 셋에 필요한 만큼을 먼저 떼고 **남는 폭을 `사이즈`가 갖는다.**
 * 스테퍼도 셀 폭을 따라 줄게 고쳤으니(`QtyStepper`) 어느 폭에서도 겹치지 않는다.
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

      <table className="w-full table-fixed border-collapse">
        {/* 표가 무엇을 담고 있는지 표 안에서 읽힌다. 밖의 h2는 목록을 훑을 때
            표와 따로 읽혀서, 표 안에 들어온 뒤에는 남지 않는다 */}
        <caption className="sr-only">
          게시 옵션 — 색상별 사이즈·판매가·수량·소계
        </caption>

        {/* 값을 넣는 칸 셋만 폭을 못 박고 나머지를 `사이즈`가 받는다.
            phone(≤40rem)에서 한 단 좁히는 것은 390px에서 소계가 두 줄로
            접히지 않을 최소치다 */}
        <colgroup>
          <col />
          <col className="w-22 phone:w-19" />
          <col className="w-27.5 phone:w-25" />
          <col className="w-24 phone:w-21" />
        </colgroup>

        <thead>
          <tr className="text-muted-foreground text-body">
            <th
              scope="col"
              className="px-3 py-2 text-left font-normal phone:px-1.5"
            >
              사이즈
            </th>
            <th
              scope="col"
              className="px-3 py-2 text-right font-normal phone:px-1.5"
            >
              판매가
            </th>
            <th
              scope="col"
              className="px-3 py-2 text-center font-normal phone:px-1.5"
            >
              수량
            </th>
            <th
              scope="col"
              className="px-3 py-2 text-right font-normal phone:px-1.5"
            >
              소계
            </th>
          </tr>
        </thead>

        {product.colorGroups.map((group, groupIndex) => (
          <tbody key={group.color}>
            <tr>
              {/* 색상 머리는 표 밖의 상자가 아니라 표의 한 줄이다 — 밖에 두면
                  같은 표를 그룹 수만큼 끊어야 한다 */}
              <td colSpan={4} className={cn("p-0", groupIndex > 0 && "pt-3")}>
                <div className="bg-secondary text-body flex items-center gap-2 rounded-md px-3 py-2.5 font-medium">
                  <ColorDot
                    color={colorHex(group.color)}
                    className="size-3.5"
                  />
                  {group.displayName}
                  <BulkQtyPopover
                    colorLabel={group.displayName}
                    rowCount={group.rows.length}
                    onApply={(value) => onBulkApply(group, value)}
                    disabled={disabled}
                  />
                </div>
              </td>
            </tr>

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
                  <td className="px-3 py-2.5 text-left phone:px-1.5">
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

                  <td className="px-3 py-2.5 text-right tabular-nums phone:px-1.5">
                    {formatWon(row.price)}
                  </td>

                  <td className="px-3 py-2.5 text-center phone:px-1.5">
                    <QtyStepper
                      label={label}
                      value={raw}
                      disabled={disabled}
                      onChange={(next) => onChangeQty(row.skuId, next)}
                    />
                  </td>

                  <td className="px-3 py-2.5 text-right tabular-nums phone:px-1.5">
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
        ))}
      </table>

      <p className="text-muted-foreground mt-2.5 text-xs">{QTY_FOOTNOTE}</p>

      {bulkNotice ? (
        <p className="text-secondary-foreground mt-1.5 text-xs">{bulkNotice}</p>
      ) : null}
    </section>
  );
}
