import { QTY_ISSUE_TEXT, QTY_UNIT, parseQty } from "@/shared/qty";
import {
  MISSING_PRODUCT_NAME,
  MISSING_WHOLESALER_NAME,
  SAVE_FAILED_TEXT,
} from "./constants";
import type {
  CartGroupWire,
  CartItemWire,
  CartLine,
  CartLineIssue,
  CartWire,
  RemovedLine,
} from "./types";

/**
 * 장바구니의 파생값. **JSX 안에서 더하지 않는다** — 그룹 요약과 하단 요약과
 * 행 금액이 각자 더하면 한 곳만 안 따라오는 화면이 된다(도매 누적 `derive` 3건).
 * 화면에 뜨는 숫자는 전부 이 파일에서 나온다.
 */

/* ────────────────────────────────────────────────────────────────────────
   wire → 뷰. 화면은 wire 모양을 모른다.
   ──────────────────────────────────────────────────────────────────────── */

/**
 * 서버 응답의 도매처 묶음을 **평평한 줄 목록**으로 편다. 그룹은 화면이
 * `groupByWholesaler`로 다시 만든다 — 서버가 준 순서가 그대로 첫 등장 순서라
 * 결과는 같고, 선택·draft·되돌리기가 전부 줄 단위라 줄 목록이 원본이어야 한다.
 *
 * `wholesaler`·`title`·`salePrice`·`colorName`·`size`·`listingId`는 생성 타입상
 * non-optional이지만 dev의 도매에 없는 variant 행에서 **전부 null**로 온다
 * (실측 2026-09-05: `{"wholesaler":null,"items":[{"cartItemId":1,"variantId":90231,
 * "listingId":null,"title":null,…,"isOrderable":false}]}`). 여기서 한 번만 좁히고
 * 화면은 모른다. 도매처가 null인 묶음은 이름 자리에 `MISSING_WHOLESALER_NAME`을
 * 두고 id는 빈 문자열이다 — 그런 묶음이 둘이면 한 상자로 합쳐진다.
 *
 * `groups`·`items` 두 배열도 같은 급으로 좁힌다. 스냅샷에 nullable 표기가 없어
 * 타입은 배열이지만 `wholesaler`가 그랬듯 서버가 빈 장바구니를 `groups: null`로
 * 주는 날 `/cart`·`/checkout`이 서버 컴포넌트째 죽는다 — 좁히는 자리는 여기 하나다.
 */
export function toCartLines(wire: CartWire): CartLine[] {
  return (wire.groups ?? []).flatMap((group) => {
    const wholesaler = (group.wholesaler ?? null) as
      CartGroupWire["wholesaler"] | null;
    return (group.items ?? []).map((item) =>
      toCartLine(item, {
        id: wholesaler === null ? "" : String(wholesaler.id),
        name: wholesaler?.name ?? MISSING_WHOLESALER_NAME,
      }),
    );
  });
}

function toCartLine(
  item: CartItemWire,
  wholesaler: { id: string; name: string },
): CartLine {
  const qty = item.qty ?? 0;

  return {
    lineId: String(item.cartItemId),
    cartItemId: item.cartItemId,
    variantId: item.variantId,
    wholesalerId: wholesaler.id,
    wholesalerName: wholesaler.name,
    /* 스펙에 없다(`CartWholesaler`는 id·name뿐). 화면은 비어 있으면 숨긴다 */
    wholesalerLocation: "",
    productId: String(item.listingId ?? ""),
    productName: item.title ?? MISSING_PRODUCT_NAME,
    colorLabel: item.colorName ?? "",
    size: item.size ?? "",
    price: item.salePrice ?? null,
    /* 스펙에 없다. 값이 오기 전까지 배지는 안 뜬다 */
    soldOut: false,
    orderable: item.isOrderable ?? true,
    qty,
    qtyText: String(qty),
  };
}

/**
 * 서버 줄에 **칸에 친 글자**를 얹는다. draft는 `store.ts`(UI 상태)에 있고 서버
 * 값과 다를 때만 의미가 있다 — 같은 값이면 어느 쪽을 보여 줘도 같다.
 */
export function applyDrafts(
  lines: readonly CartLine[],
  drafts: Readonly<Record<string, string>>,
): CartLine[] {
  return lines.map((line) => {
    const draft = drafts[line.lineId];
    return draft === undefined ? line : { ...line, qtyText: draft };
  });
}

/**
 * DELETE는 성공했는데 `router.refresh()`가 아직 안 닿은 줄을 뺀다. 그 사이에도
 * 줄이 남아 있으면 사장이 "안 지워졌나" 하고 한 번 더 누른다.
 */
export function visibleLines(
  lines: readonly CartLine[],
  hidden: ReadonlySet<string>,
): CartLine[] {
  return hidden.size === 0
    ? [...lines]
    : lines.filter((line) => !hidden.has(line.lineId));
}

/**
 * 되돌리기 버퍼에 넣을 값. 서버 줄이 아니라 "다시 담을 때 보낼 것"만 남긴다.
 * 수량은 칸의 글자가 아니라 **서버에 저장돼 있던 값**이다 — 칸에 `0`이나 `45.5`가
 * 있던 줄을 되돌릴 때 `qty: 0`을 보내면 서버(최소 1)가 거절한다.
 */
export function toRemovedLines(lines: readonly CartLine[]): RemovedLine[] {
  return lines.map((line) => ({
    lineId: line.lineId,
    variantId: line.variantId,
    qty: Math.max(line.qty, 1),
  }));
}

/* ────────────────────────────────────────────────────────────────────────
   묶기 · 세기
   ──────────────────────────────────────────────────────────────────────── */

/** 도매처 하나와 그 아래 담긴 조합들 */
export interface CartGroup {
  wholesalerId: string;
  wholesalerName: string;
  wholesalerLocation: string;
  lines: readonly CartLine[];
}

/**
 * 순서를 지키면서 도매처별로 묶는다.
 *
 * 도매처명으로 정렬하지 않는다 — 서버가 준 순서가 곧 화면 순서다. **처음 나온
 * 도매처가 위**다.
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
 * **주문 불가 행도 0장이다** — 칸에 숫자가 남아 있어도 주문에 안 실린다.
 */
export function lineQty(line: CartLine): number {
  return line.orderable ? parseQty(line.qtyText).qty : 0;
}

/** 행 금액 = 판매가 × 장수. 단가가 없는 줄(주문 불가)은 0원이다 */
export function lineSubtotal(line: CartLine): number {
  return (line.price ?? 0) * lineQty(line);
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
 *
 * 서버의 `subtotal`·`totalAmount`를 쓰지 않는다. 그 값은 저장이 끝난 수량의
 * 합이라 칸에 치는 중인 글자를 못 따라오고, 하단은 선택된 것만 세야 한다.
 */
export function totalsOf(lines: readonly CartLine[]): CartTotals {
  return lines.reduce<CartTotals>(
    (acc, line) => ({
      comboCount: acc.comboCount + 1,
      sheets: acc.sheets + lineQty(line),
      amount: acc.amount + lineSubtotal(line),
      hasIssue:
        acc.hasIssue ||
        (line.orderable && parseQty(line.qtyText).issue === "NOT_A_NUMBER"),
    }),
    { comboCount: 0, sheets: 0, amount: 0, hasIssue: false },
  );
}

/**
 * `주문하기`가 갈 주소. 고른 조합의 `cartItemId`를 주소에 실어 주문서로 넘긴다 —
 * 주문서는 `GET /checkout?cartItemIds=`로 **그것만** 받아 단가를 다시 받는다(스펙).
 * 세션 스토어의 선택 상태를 주문 feature가 읽지 않게 하는 통로가 이 주소다.
 */
export function checkoutHref(picked: readonly CartLine[]): string {
  const ids = picked.map((line) => line.cartItemId);
  return ids.length === 0 ? "/checkout" : `/checkout?ids=${ids.join(",")}`;
}

/** 12,500 → `12,500원` */
export function formatWon(amount: number): string {
  return `${amount.toLocaleString("ko-KR")}원`;
}

/** 단가가 없는 줄은 `—`다. `0원`은 공짜로 읽힌다 */
export function formatPrice(price: number | null): string {
  return price === null ? "—" : formatWon(price);
}

/** `3개 조합 · 26장` — 그룹 머리 우측 */
export function comboSheetsLabel(totals: CartTotals): string {
  return `${totals.comboCount}개 조합 · ${totals.sheets}${QTY_UNIT}`;
}

/**
 * `체리레드 · S · 12,500원` — 조합 행의 둘째 줄. 비어 있는 조각(도매에 없는
 * variant는 색·사이즈가 null이다)은 건너뛴다 — ` ·  · —`는 읽을 수 없다.
 */
export function optionLabel(line: CartLine): string {
  return [line.colorLabel, line.size, formatPrice(line.price)]
    .filter((part) => part !== "")
    .join(" · ");
}

/** 그 줄에 뜨는 이유 문구. 저장 실패는 이 feature에만 있는 이유라 여기서 합친다 */
export function lineIssueText(issue: CartLineIssue): string {
  return issue === "SAVE_FAILED" ? SAVE_FAILED_TEXT : QTY_ISSUE_TEXT[issue];
}

/* ────────────────────────────────────────────────────────────────────────
   선택 — 3층(전체 / 도매처 / 조합)이지만 상태는 집합 하나뿐이다.
   위 두 층은 그 집합에서 **계산해서** 나온다. 층마다 상태를 두면 조합을
   하나 껐을 때 그룹 체크가 켜진 채로 남는다.

   스토어가 드는 것은 `selected`가 아니라 **`deselected`(뺀 것)**다. 담긴 것은
   기본이 선택이라(확정 와이어프레임 `전체 선택 (4/4)`) 서버에서 새로 온 줄이
   저절로 켜지고, 스토어가 서버 목록을 몰라도 된다.
   ──────────────────────────────────────────────────────────────────────── */

/** 지금 켜져 있는 조합. 주문 불가 행은 켤 수 없다 */
export function selectedIds(
  lines: readonly CartLine[],
  deselected: ReadonlySet<string>,
): ReadonlySet<string> {
  const selected = new Set<string>();
  for (const line of lines) {
    if (line.orderable && !deselected.has(line.lineId)) {
      selected.add(line.lineId);
    }
  }
  return selected;
}

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
 * 보이면 아무것도 없는데 다 골랐다고 말하는 화면이 된다. 주문 불가 행은
 * 켤 수 없으니 세지 않는다 — 그 행 때문에 전체 선택이 영영 안 켜지면 안 된다.
 */
export function allSelected(
  lines: readonly CartLine[],
  selected: ReadonlySet<string>,
): boolean {
  const selectable = lines.filter((line) => line.orderable);
  return (
    selectable.length > 0 &&
    selectable.every((line) => selected.has(line.lineId))
  );
}

/** `(3/4)` — 전체 선택 옆 카운터. 분모는 담긴 전부(주문 불가 포함)다 */
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
