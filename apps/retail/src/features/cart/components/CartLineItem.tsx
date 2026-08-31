import { Badge } from "@ondo/ui";
import type { CartLine } from "../types";
import { QTY_UNIT, SOLD_OUT_BADGE } from "../constants";
import { formatWon, lineSubtotal, optionLabel } from "../derive";

/**
 * 담긴 조합 한 줄.
 *
 * **≤40rem에서 값 칸들이 통째로 아랫줄로 내려간다.** 직전 회차에서 수량 칸이
 * 98px 고정인 채로 옆 `소계` 칸 위에 42px 겹쳐 그려졌다(F1). 여기서는 폭을
 * 비율로 나누지 않고 값 칸 각각에 rem을 못 박은 뒤, 390px처럼 한 줄에 못
 * 들어가는 폭에서는 `phone:w-full`로 줄을 바꿔 겹칠 자리를 없앤다.
 *
 * 썸네일이 빈 회색 상자인 것은 사진 자산이 아직 없어서다 — 없는 이미지를
 * 지어내지 않는다. 값이 아니라 자리라서 `aria-hidden`이다.
 */
export function CartLineItem({ line }: { line: CartLine }) {
  return (
    <li className="border-border flex flex-wrap items-center gap-x-3 gap-y-2.5 border-b py-3 last:border-b-0">
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

      <div className="ml-auto flex items-center gap-4 phone:ml-0 phone:w-full">
        <span className="w-24.5 text-center tabular-nums">
          {line.qty}
          {QTY_UNIT}
        </span>
        <span className="w-24 text-right font-medium tabular-nums">
          {formatWon(lineSubtotal(line))}
        </span>
      </div>
    </li>
  );
}
