"use client";

import { Notice, Panel } from "@ondo/ui";
import { Info } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { CartSummaryBar } from "./CartSummaryBar";
import { CartToolbar } from "./CartToolbar";
import { EmptyCart } from "./EmptyCart";
import { RemovedNotice } from "./RemovedNotice";
import { WholesalerGroup } from "./WholesalerGroup";
import { SKU_ORDER_LIMIT, parseQty } from "@/shared/qty";
import {
  describeBatchFailure,
  describeCartError,
  useCartBusy,
  useQtySaver,
  useRemoveCartItemsMutation,
  useRestoreCartItemsMutation,
} from "../api/mutations";
import {
  BACKORDER_NOTICE,
  CART_ACTION_ID,
  CART_SUB_TAIL,
  removeFailedText,
  restoreFailedText,
} from "../constants";
import {
  allSelected,
  applyDrafts,
  groupByWholesaler,
  orderBlockedReason,
  selectedIds,
  selectedLines,
  selectionCounter,
  toRemovedLines,
  totalsOf,
  visibleLines,
} from "../derive";
import {
  clearRemoved,
  forgetRestored,
  hideLines,
  prune,
  rememberRemoved,
  revertDraft,
  setDraft,
  setLinesSelected,
  toggleLine,
  useCartUi,
} from "../store";
import type { CartLine } from "../types";

/**
 * 장바구니 한 장.
 *
 * 담긴 목록은 **서버가 준다** — 부모 `app/(shop)/cart/page.tsx`가 `GET /cart-items`를
 * 받아 `lines`로 넘긴다. 이 컴포넌트가 스토어(`../store`)에서 읽는 것은 서버가
 * 모르는 UI 상태뿐이다: 무엇을 골랐는지 · 칸에 무엇을 치는 중인지 · 방금 무엇을
 * 뺐는지. 쓰기(수량 · 빼기 · 되돌리기)는 `../api/mutations`가 보내고, 끝나면
 * `router.refresh()`가 이 페이지와 헤더 뱃지를 같이 다시 그린다 — 뱃지와 본문이
 * 같은 서버 값을 본다(원본 §6-4 결함의 반대). 빼기·되돌리기는 줄마다 요청이
 * 따로 나가므로 **일부만 성공해도** refresh는 돈다 — 화면이 서버의 실제 상태를
 * 보여 주고, 실패 문구는 몇 개 중 몇 개인지를 말한다.
 *
 * **세 층의 숫자가 각자 놀지 않는다.** 행 금액 · 그룹 요약 · 하단 요약이 전부
 * `derive.ts`의 `totalsOf` 하나를 부르고, 무엇을 넣어 부르는지만 다르다 —
 * 그룹은 그 도매처에 담긴 전부, 하단은 고른 것만(RT-32). 서버의 `subtotal`·
 * `totalAmount`는 안 쓴다 — 칸에 치는 중인 수량을 못 따라온다.
 *
 * **담긴 것이 0줄이어도 되돌리기는 남는다.** `RemovedNotice`는 두 상태에서 같은
 * 위치에 있어서 노드가 새로 생기지 않고, `role="status"`도 끊기지 않는다(F1).
 */
export function CartView({
  lines: serverLines,
}: {
  /** `GET /cart-items`를 뷰로 바꾼 것. 순서는 서버 순서다 */
  lines: readonly CartLine[];
}) {
  const ui = useCartUi();
  const busy = useCartBusy();
  const remove = useRemoveCartItemsMutation();
  const restore = useRestoreCartItemsMutation();
  /* 저장 실패는 칸을 서버 값으로 되돌리고 그 줄에 이유를 남긴다 — 저장 안 된
     숫자를 칸에 두면 합계가 서버와 다른 값을 말한다 */
  const saveQty = useQtySaver({ onFailed: revertDraft });
  /* 빼기·되돌리기가 서버에서 거절됐을 때. 수량 저장 실패는 줄마다 따로 뜬다 */
  const [failure, setFailure] = useState<string | null>(null);

  /* 서버 목록에서 사라진 줄의 흔적(숨김 · 선택 해제 · draft)을 지운다.
     refresh가 닿았다는 신호가 곧 이 prop이 바뀌는 것이다 */
  useEffect(() => {
    prune(new Set(serverLines.map((line) => line.lineId)));
  }, [serverLines]);

  const lines = applyDrafts(visibleLines(serverLines, ui.hidden), ui.drafts);
  const selected = selectedIds(lines, ui.deselected);
  const empty = lines.length === 0;
  const picked = selectedLines(lines, selected);
  const totals = totalsOf(picked);
  const removedCount = ui.lastRemoved?.length ?? 0;

  const changeQty = (line: CartLine, next: string) => {
    const { qty, issue } = parseQty(next);
    /* 상한 초과만 값을 되돌린다 — "얼마까지 되는지"가 정해져 있어서 화면이 대신
       정할 수 있는 유일한 경우다. 되돌렸다는 사실은 문구가 말한다 */
    const value = issue === "OVER_LIMIT" ? String(SKU_ORDER_LIMIT) : next;
    setDraft(line.lineId, value, issue);
    setFailure(null);
    /* 서버는 1장 이상만 받는다(`ChangeQtyRequest.qty minimum 1`). 0 · 빈 칸 ·
       못 읽는 글자는 보내지 않는다 — 칸에만 남고 `주문하기`가 막힌다 */
    if (issue === "NOT_A_NUMBER" || qty < 1) return;
    saveQty(line.lineId, { cartItemId: line.cartItemId, qty });
  };

  /* 묶음 요청은 reject하지 않고 성공분·실패분을 갈라 돌려준다(`BatchResult`).
     `onError`는 그 밖의 예외(코드 결함)만 받는 안전망이다 */
  const removeOne = (line: CartLine) => {
    setFailure(null);
    remove.mutate([line.cartItemId], {
      onSuccess: (result) => {
        if (result.done.length > 0) hideLines([line.lineId]);
        setFailure(describeBatchFailure(result, removeFailedText));
      },
      onError: (error) => setFailure(describeCartError(error)),
    });
  };

  /**
   * 고른 조합을 전부 뺀다. **고르지 않은 조합은 남는다.** 지우는 대상을 화면(DOM)이
   * 아니라 선택 집합에서 뽑는다 — 접힘·필터가 나중에 생겨도 대상이 달라지지 않는다.
   *
   * 일부만 지워졌으면 **지워진 줄만** 숨기고 되돌리기 버퍼에 넣는다. 못 지운 줄은
   * 그대로 남고(선택도 그대로) 문구가 몇 개 남았는지 말한다 — refresh가 서버에
   * 실제로 남은 것을 다시 그린다.
   */
  const removePicked = () => {
    if (picked.length === 0) return;
    setFailure(null);
    remove.mutate(
      picked.map((line) => line.cartItemId),
      {
        onSuccess: (result) => {
          const doneIds = new Set(result.done);
          const removed = picked.filter((line) => doneIds.has(line.cartItemId));
          if (removed.length > 0) {
            hideLines(removed.map((line) => line.lineId));
            rememberRemoved(toRemovedLines(removed));
          }
          setFailure(describeBatchFailure(result, removeFailedText));
        },
        onError: (error) => setFailure(describeCartError(error)),
      },
    );
  };

  /* 되돌린 뒤에도 포커스가 <body>로 떨어지지 않게 한다 — `되돌리기`는 눌리면
     사라지는 버튼이라 그 자리에 남는 것이 없다. 되돌아온 줄은 refresh로 오므로
     목록이 바뀐 뒤(`serverLines` 효과)에 옮긴다 — 아직 없는 버튼은 못 찾는다 */
  const focusAfterRestore = useRef(false);
  const handleRestore = () => {
    const removed = ui.lastRemoved;
    if (!removed) return;
    setFailure(null);
    restore.mutate(removed, {
      onSuccess: (result) => {
        /* 다시 담긴 줄은 버퍼에서 뺀다 — 남은 것만 재시도하게. 전부 담겼으면
           버튼이 사라지므로 포커스를 옮긴다 */
        if (result.failed.length === 0) {
          clearRemoved();
          focusAfterRestore.current = true;
        } else {
          forgetRestored(result.done.map((line) => line.lineId));
        }
        setFailure(describeBatchFailure(result, restoreFailedText));
      },
      onError: (error) => setFailure(describeCartError(error)),
    });
  };
  useEffect(() => {
    if (!focusAfterRestore.current || serverLines.length === 0) return;
    focusAfterRestore.current = false;
    document.getElementById(CART_ACTION_ID.removeSelected)?.focus();
  }, [serverLines]);

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
            busy={busy}
            onToggleAll={(on) =>
              setLinesSelected(
                lines.map((line) => line.lineId),
                on,
              )
            }
            onRemoveSelected={removePicked}
          />
        )}

        {/* 담긴 상태와 빈 상태가 이 한 줄을 같이 쓴다 */}
        <RemovedNotice
          count={removedCount}
          pending={restore.isPending}
          onRestore={handleRestore}
        />

        {failure ? (
          <p role="alert" className="text-destructive pb-3 text-xs">
            {failure}
          </p>
        ) : null}

        {empty ? (
          <EmptyCart />
        ) : (
          <>
            {groupByWholesaler(lines).map((group) => (
              <WholesalerGroup
                key={group.wholesalerId}
                group={group}
                issues={ui.issues}
                selected={selected}
                onToggleLines={setLinesSelected}
                onToggleLine={toggleLine}
                onChangeQty={changeQty}
                onRemove={removeOne}
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
