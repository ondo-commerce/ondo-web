"use client";

import { Notice, Panel } from "@ondo/ui";
import { Info } from "lucide-react";
import { flushSync } from "react-dom";
import { CartSummaryBar } from "./CartSummaryBar";
import { CartToolbar } from "./CartToolbar";
import { EmptyCart } from "./EmptyCart";
import { RemovedNotice } from "./RemovedNotice";
import { WholesalerGroup } from "./WholesalerGroup";
import { BACKORDER_NOTICE, CART_ACTION_ID, CART_SUB_TAIL } from "../constants";
import {
  allSelected,
  groupByWholesaler,
  orderBlockedReason,
  selectedLines,
  selectionCounter,
  totalsOf,
} from "../derive";
import {
  removeLine,
  removeSelected,
  restoreRemoved,
  setLinesSelected,
  setQty,
  toggleLine,
  useCartIssues,
  useCartLines,
  useCartSelected,
  useLastRemovedCount,
} from "../store";

/**
 * 장바구니 한 장.
 *
 * 담긴 목록도 선택도 화면이 `useState`로 들고 있지 않고 `../store`에서 읽는다.
 * 이유가 둘이다.
 * ① 헤더 뱃지가 같은 값을 봐야 한다 — 원본은 같은 화면에서 헤더 접근성 이름
 *    `6개 담김` · 뱃지 `4` · 본문 `담긴 조합 4개`가 서로 달랐다(§6-4).
 * ② 수량을 고치고 선택을 풀고 다른 화면에 갔다 오면 그게 통째로 버려진다
 *    (누적 `state-loss`).
 *
 * **세 층의 숫자가 각자 놀지 않는다.** 행 금액 · 그룹 요약 · 하단 요약이 전부
 * `derive.ts`의 `totalsOf` 하나를 부르고, 무엇을 넣어 부르는지만 다르다 —
 * 그룹은 그 도매처에 담긴 전부, 하단은 고른 것만(RT-32).
 *
 * **담긴 것이 0줄이어도 되돌리기는 남는다.** 빈 상태를 따로 return 하던 동안에는
 * 담긴 것을 전부 고르고 지웠을 때 툴바가 통째로 빠지면서 되돌리기도 같이
 * 사라졌다 — 되돌릴 4줄이 스토어에 그대로 남아 있는데 부를 컨트롤이 없었다.
 * 지금은 한 자리에서 내용만 갈아 끼운다: `RemovedNotice`는 두 상태에서 같은
 * 위치에 있어서 노드가 새로 생기지 않고, `role="status"`도 끊기지 않는다.
 */
export function CartView() {
  const lines = useCartLines();
  const issues = useCartIssues();
  const selected = useCartSelected();
  const removedCount = useLastRemovedCount();

  const empty = lines.length === 0;
  const picked = selectedLines(lines, selected);
  const totals = totalsOf(picked);

  /* 되돌린 뒤에도 포커스가 <body>로 떨어지지 않게 한다 — `되돌리기`는 눌리면
     사라지는 버튼이라 그 자리에 남는 것이 없다. 되돌아온 줄은 선택까지 복원되므로
     `선택 삭제`가 다시 눌릴 수 있는 상태고, 사장이 직전에 눌렀던 자리도 그쪽이다.
     `flushSync`로 목록을 먼저 그린 뒤에 부른다 — 아직 없는 버튼은 못 찾는다 */
  const handleRestore = () => {
    flushSync(() => restoreRemoved());
    document.getElementById(CART_ACTION_ID.removeSelected)?.focus();
  };

  return (
    <div className="mx-auto max-w-wrap">
      <Panel>
        <Panel.Title
          sub={
            empty ? undefined : `담긴 조합 ${lines.length}개 · ${CART_SUB_TAIL}`
          }
        >
          장바구니
        </Panel.Title>

        {empty ? null : (
          <CartToolbar
            allOn={allSelected(lines, selected)}
            counter={selectionCounter(lines, selected)}
            selectedCount={picked.length}
            onToggleAll={(on) =>
              setLinesSelected(
                lines.map((line) => line.lineId),
                on,
              )
            }
            onRemoveSelected={removeSelected}
          />
        )}

        {/* 담긴 상태와 빈 상태가 이 한 줄을 같이 쓴다 */}
        <RemovedNotice count={removedCount} onRestore={handleRestore} />

        {empty ? (
          <EmptyCart />
        ) : (
          <>
            {groupByWholesaler(lines).map((group) => (
              <WholesalerGroup
                key={group.wholesalerId}
                group={group}
                issues={issues}
                selected={selected}
                onToggleLines={setLinesSelected}
                onToggleLine={toggleLine}
                onChangeQty={setQty}
                onRemove={removeLine}
              />
            ))}

            <CartSummaryBar
              totals={totals}
              blockedReason={orderBlockedReason(totals)}
            />
          </>
        )}
      </Panel>

      {/* 재고 소진 배지가 왜 담기를 막지 않는지를 목록 아래에서 한 번 더 말한다.
          담긴 것이 없으면 설명할 배지도 없다 */}
      {empty ? null : (
        <Notice className="mt-2">
          <span className="flex items-center gap-2">
            <Info aria-hidden className="size-4 shrink-0" />
            {BACKORDER_NOTICE}
          </span>
        </Notice>
      )}
    </div>
  );
}
