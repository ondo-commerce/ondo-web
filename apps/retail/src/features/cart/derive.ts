import type { CartLine } from "@/shared/cart-store";
import { QTY_UNIT } from "./constants";

/**
 * 장바구니의 파생값. **JSX 안에서 더하지 않는다** — 그룹 요약과 하단 요약과
 * 행 금액이 각자 더하면 한 곳만 안 따라오는 화면이 된다(도매 누적 `derive` 3건).
 * 화면에 뜨는 숫자는 전부 이 파일에서 나온다.
 */

/** 도매처 하나와 그 아래 담긴 조합들 */
export interface CartGroup {
  wholesalerId: string;
  wholesalerName: string;
  wholesalerLocation: string;
  lines: readonly CartLine[];
}

/**
 * 담긴 순서를 지키면서 도매처별로 묶는다.
 *
 * 도매처명으로 정렬하지 않는다 — 방금 담은 것이 목록 어디로 튀는지 알 수 없으면
 * 사장이 자기가 담은 것을 다시 찾아야 한다. **처음 나온 도매처가 위**다.
 */
export function groupByWholesaler(lines: readonly CartLine[]): CartGroup[] {
  const groups: CartGroup[] = [];
  const index = new Map<string, number>();

  for (const line of lines) {
    const at = index.get(line.wholesalerId);

    if (at === undefined) {
      index.set(line.wholesalerId, groups.length);
      groups.push({
        wholesalerId: line.wholesalerId,
        wholesalerName: line.wholesalerName,
        wholesalerLocation: line.wholesalerLocation,
        lines: [line],
      });
      continue;
    }

    /* noUncheckedIndexedAccess: 방금 넣은 자리라 있는 게 확실하지만
       타입상으로는 undefined다. 조용히 !로 지우지 않고 건너뛴다 */
    const group = groups[at];
    if (group) group.lines = [...group.lines, line];
  }

  return groups;
}

/** 행 금액 = 판매가 × 장수 */
export function lineSubtotal(line: CartLine): number {
  return line.price * line.qty;
}

export interface CartTotals {
  /** 조합 수(색상 × 사이즈). 장 수가 아니다 */
  comboCount: number;
  /** 총 장수 */
  sheets: number;
  /** 합계 금액 */
  amount: number;
}

/**
 * 줄 묶음 하나의 합. 그룹 머리와 하단 요약이 **같은 이 함수**를 부른다.
 * 무엇을 넣어 부르는지만 다르다 — 그룹 머리는 그룹 전부, 하단은 선택된 것만.
 */
export function totalsOf(lines: readonly CartLine[]): CartTotals {
  return lines.reduce<CartTotals>(
    (acc, line) => ({
      comboCount: acc.comboCount + 1,
      sheets: acc.sheets + line.qty,
      amount: acc.amount + lineSubtotal(line),
    }),
    { comboCount: 0, sheets: 0, amount: 0 },
  );
}

/** 12,500 → `12,500원` */
export function formatWon(amount: number): string {
  return `${amount.toLocaleString("ko-KR")}원`;
}

/** `3개 조합 · 26장` — 그룹 머리 우측 */
export function comboSheetsLabel(totals: CartTotals): string {
  return `${totals.comboCount}개 조합 · ${totals.sheets}${QTY_UNIT}`;
}

/** `체리레드 · S · 12,500원` — 조합 행의 둘째 줄 */
export function optionLabel(line: CartLine): string {
  return `${line.colorLabel} · ${line.size} · ${formatWon(line.price)}`;
}
