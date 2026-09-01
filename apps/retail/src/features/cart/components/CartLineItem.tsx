"use client";

import { Badge, Checkbox, IconButton } from "@ondo/ui";
import { X } from "lucide-react";
import { QtyStepper } from "@/shared/components/QtyStepper";
import { QTY_ISSUE_TEXT, type QtyIssue } from "@/shared/qty";
import { SOLD_OUT_BADGE } from "../constants";
import { formatWon, lineQty, lineSubtotal, optionLabel } from "../derive";
import type { CartLine } from "../types";

/**
 * 담긴 조합 한 줄.
 *
 * **≤40rem에서 값 칸들이 통째로 아랫줄로 내려간다.** 직전 회차에서 수량 칸이
 * 98px 고정인 채로 옆 `소계` 칸 위에 42px 겹쳐 그려졌다(F1). 여기서는 폭을
 * 비율로 나누지 않고 값 칸 각각에 rem을 못 박은 뒤, 390px처럼 한 줄에 못
 * 들어가는 폭에서는 `phone:w-full`로 줄을 바꿔 겹칠 자리를 없앤다.
 *
 * **재고 소진 조합도 수량을 넣을 수 있다**(RT-31). 모자란 수량은 도매처가
 * 주문을 확정할 때 미송으로 넘어간다 — 여기서 막으면 살 수 있는 것을 못 사게
 * 된다. 배지만 붙고 칸은 잠기지 않는다.
 *
 * 썸네일이 빈 회색 상자인 것은 사진 자산이 아직 없어서다 — 없는 이미지를
 * 지어내지 않는다. 값이 아니라 자리라서 `aria-hidden`이다.
 */
export function CartLineItem({
  line,
  issue,
  checked,
  onToggle,
  onChangeQty,
  onRemove,
}: {
  line: CartLine;
  /** 이번에 살 것으로 골랐는가 */
  checked: boolean;
  onToggle: (on: boolean) => void;
  /** 수량이 걸린 이유. 값과 따로 온다 — 500으로 되돌린 뒤에도 남아야 한다 */
  issue: QtyIssue | null;
  onChangeQty: (next: string) => void;
  onRemove: () => void;
}) {
  const qty = lineQty(line);
  const label = `${line.productName} ${line.colorLabel} ${line.size} 수량`;

  return (
    <li className="border-border flex flex-wrap items-center gap-x-3 gap-y-2.5 border-b py-3 last:border-b-0">
      {/* 어느 조합인지까지 이름에 넣는다 — `선택`만으로는 네 줄이 전부 같은
          이름이라 보조기술에서 구분되지 않는다 */}
      <Checkbox
        checked={checked}
        onCheckedChange={(next) => onToggle(next === true)}
        aria-label={`${line.productName} ${line.colorLabel} ${line.size} 선택`}
        className="size-4.5"
      />

      <span aria-hidden className="bg-secondary size-13 shrink-0 rounded-md" />

      {/* basis-40: 이 칸이 먼저 줄어들다 못해 0이 되면 상품명이 세로로 서 버린다.
          여기까지만 줄고 그 아래에서는 값 칸이 줄을 바꾼다 */}
      <div className="min-w-0 flex-1 basis-40">
        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
          <span className="font-medium">{line.productName}</span>
          {/* 재고 수치는 어디에도 없다 — 배지만이다(게이트 Q1) */}
          {line.soldOut ? <Badge>{SOLD_OUT_BADGE}</Badge> : null}
        </div>
        <p className="text-muted-foreground text-body mt-0.5">
          {optionLabel(line)}
        </p>
      </div>

      <div className="ml-auto flex items-center gap-4 phone:ml-0 phone:w-full phone:justify-between">
        <span className="w-24.5 shrink-0">
          <QtyStepper
            label={label}
            value={line.qtyText}
            onChange={onChangeQty}
          />
        </span>

        <span className="w-24 shrink-0 text-right font-medium tabular-nums">
          {/* 0장이면 금액이 아니라 `—`다. `0원`은 공짜로 읽힌다 */}
          {qty > 0 ? (
            formatWon(lineSubtotal(line))
          ) : (
            <span className="text-muted-foreground font-normal">—</span>
          )}
        </span>

        {/* 되돌릴 수 없는 실행이라 무엇이 지워지는지를 접근성 이름이 끝까지
            말한다 — `삭제`만으로는 어느 줄인지 알 수 없다 */}
        <IconButton
          variant="ghost"
          aria-label={`${line.productName} ${line.colorLabel} ${line.size} 장바구니에서 빼기`}
          onClick={onRemove}
        >
          <X aria-hidden className="size-4" />
        </IconButton>
      </div>

      {/* 값만 되돌리고 말을 안 하면 "고장난 칸"이 된다. 줄 전체 폭을 쓰는 것은
          390px에서 값 칸 아래에 끼면 두 글자씩 접히기 때문이다 */}
      {issue ? (
        <p className="text-destructive w-full text-xs">
          {QTY_ISSUE_TEXT[issue]}
        </p>
      ) : null}
    </li>
  );
}
