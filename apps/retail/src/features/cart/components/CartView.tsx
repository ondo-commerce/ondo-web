"use client";

import { Panel } from "@ondo/ui";
import { EmptyCart } from "./EmptyCart";
import { WholesalerGroup } from "./WholesalerGroup";
import { CART_SUB_TAIL } from "../constants";
import { groupByWholesaler } from "../derive";
import { useCartLines } from "../store";

/**
 * 장바구니 한 장.
 *
 * 담긴 목록을 화면이 `useState`로 들고 있지 않고 `../store`에서 읽는다.
 * 헤더 뱃지가 같은 값을 봐야 하기 때문이다 — 원본은 같은 화면에서 헤더 접근성
 * 이름 `6개 담김` · 뱃지 `4` · 본문 `담긴 조합 4개`가 서로 달랐다(§6-4).
 * **부제의 `담긴 조합 N개`도 그 값 하나에서 나온다.**
 *
 * 목록이 서버에서도 한 벌 완성돼 내려온다 — 스토어에 `getServerSnapshot`이
 * 있어서 첫 HTML이 비어 있지 않다.
 */
export function CartView() {
  const lines = useCartLines();

  if (lines.length === 0) {
    return (
      <div className="mx-auto max-w-wrap">
        <Panel>
          <Panel.Title>장바구니</Panel.Title>
          <EmptyCart />
        </Panel>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-wrap">
      <Panel>
        <Panel.Title sub={`담긴 조합 ${lines.length}개 · ${CART_SUB_TAIL}`}>
          장바구니
        </Panel.Title>

        {groupByWholesaler(lines).map((group) => (
          <WholesalerGroup key={group.wholesalerId} group={group} />
        ))}
      </Panel>
    </div>
  );
}
