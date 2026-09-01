import { QTY_UNIT, parseQty } from "@/shared/qty";
import type { CartLine } from "./types";

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

/**
 * 그 줄의 장수. 칸에 있는 **글자**를 숫자로 읽는 곳은 `parseQty` 하나뿐이고,
 * 화면·행 금액·합계가 전부 이 함수를 거쳐서 같은 값을 본다.
 * 못 읽는 글자(`45.5`)는 0장이다 — 값을 지어내지 않는다.
 */
export function lineQty(line: CartLine): number {
  return parseQty(line.qtyText).qty;
}

/** 행 금액 = 판매가 × 장수 */
export function lineSubtotal(line: CartLine): number {
  return line.price * lineQty(line);
}

export interface CartTotals {
  /** 조합 수(색상 × 사이즈). 장 수가 아니다 */
  comboCount: number;
  /** 총 장수 */
  sheets: number;
  /** 합계 금액 */
  amount: number;
  /**
   * 아직 못 읽은 입력이 이 묶음에 남아 있는가. 있으면 합계가 그 줄을 0장으로
   * 세고 있다는 뜻이라, 주문으로 넘기기 전에 화면이 말해야 한다.
   */
  hasIssue: boolean;
}

/**
 * 줄 묶음 하나의 합. 그룹 머리와 하단 요약이 **같은 이 함수**를 부른다.
 * 무엇을 넣어 부르는지만 다르다 — 그룹 머리는 그룹 전부, 하단은 선택된 것만.
 */
export function totalsOf(lines: readonly CartLine[]): CartTotals {
  return lines.reduce<CartTotals>(
    (acc, line) => ({
      comboCount: acc.comboCount + 1,
      sheets: acc.sheets + lineQty(line),
      amount: acc.amount + lineSubtotal(line),
      hasIssue: acc.hasIssue || parseQty(line.qtyText).issue === "NOT_A_NUMBER",
    }),
    { comboCount: 0, sheets: 0, amount: 0, hasIssue: false },
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

/* ────────────────────────────────────────────────────────────────────────
   선택 — 3층(전체 / 도매처 / 조합)이지만 상태는 조합 집합 하나뿐이다.
   위 두 층은 그 집합에서 **계산해서** 나온다. 층마다 상태를 두면 조합을
   하나 껐을 때 그룹 체크가 켜진 채로 남는다.
   ──────────────────────────────────────────────────────────────────────── */

/** 고른 것만 남긴다. 하단 요약과 `선택 삭제`가 이 결과를 센다 */
export function selectedLines(
  lines: readonly CartLine[],
  selected: ReadonlySet<string>,
): CartLine[] {
  return lines.filter((line) => selected.has(line.lineId));
}

/**
 * 이 묶음이 전부 켜져 있는가. 그룹 머리 체크와 전체 선택 체크가 같이 쓴다.
 *
 * **빈 묶음은 켜진 것이 아니다.** 담긴 게 하나도 없을 때 전체 선택이 켜져
 * 보이면 아무것도 없는데 다 골랐다고 말하는 화면이 된다.
 */
export function allSelected(
  lines: readonly CartLine[],
  selected: ReadonlySet<string>,
): boolean {
  return lines.length > 0 && lines.every((line) => selected.has(line.lineId));
}

/** `(3/4)` — 전체 선택 옆 카운터 */
export function selectionCounter(
  lines: readonly CartLine[],
  selected: ReadonlySet<string>,
): string {
  return `(${selectedLines(lines, selected).length}/${lines.length})`;
}

/**
 * `주문하기`를 못 누르는 이유. null이면 누를 수 있다.
 *
 * **`disabled`만 걸고 이유를 안 적으면** 사장이 버튼을 반복해서 누르다 만다.
 * 순서가 곧 우선순위다 — 아무것도 안 골랐으면 수량 얘기를 할 차례가 아니다.
 */
export function orderBlockedReason(totals: CartTotals): string | null {
  if (totals.comboCount === 0) return "주문할 조합을 하나 이상 골라 주세요.";
  if (totals.hasIssue) {
    return "수량을 읽을 수 없는 조합이 있어요. 빨간 글씨가 뜬 줄을 고쳐 주세요.";
  }
  if (totals.sheets === 0) {
    return `고른 조합의 수량이 0${QTY_UNIT}이에요. 살 만큼 넣어 주세요.`;
  }

  return null;
}
