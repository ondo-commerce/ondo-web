"use client";

import { Button } from "@ondo/ui";
import { useEffect, useRef } from "react";
import { CART_ACTION_ID, removedNotice } from "../constants";

/**
 * `선택 삭제`가 무엇을 지웠는지와 **되돌리기**.
 *
 * 확인 모달을 두지 않기로 한 대신 남긴 장치다(게이트 Q3 ③). 그래서 두 가지를
 * 지킨다.
 *
 * ① **담긴 것을 전부 지운 뒤에도 살아 있어야 한다.** 이 줄이 `CartToolbar` 안에
 *    있던 동안에는, 4줄을 전부 고르고 지우면 목록이 0줄이 되면서 툴바가 통째로
 *    안 그려졌고 되돌리기도 같이 사라졌다 — 스토어에는 지운 4줄이 그대로 남아
 *    있는데 그것을 부를 컨트롤이 화면에 없었다. **가장 크게 지우는 한 번**에서만
 *    빠지던 구멍이라 담긴 상태·빈 상태가 이 컴포넌트 하나를 같이 쓴다.
 * ② **본문 글자와 구별돼야 한다.** `Button variant="link"`의 기본색(gray-500)은
 *    감싼 문장(gray-600)과 대비가 1.56:1이라 색만으로는 링크로 보이지 않고,
 *    평상시 밑줄도 없었다. 여기서 밑줄과 굵기·색을 얹는다(WCAG 1.4.1 · G183).
 *    `packages/ui`를 고치지 않는다 — 다른 화면의 link는 본문 안에 있지 않다.
 *
 * `role="status"`는 늘 붙어 있다. 지운 뒤에 이 노드가 새로 생기면 보조기술이
 * 새 내용을 못 읽고 지나갈 수 있어서, 비어 있을 때도 자리를 지킨다.
 */
export function RemovedNotice({
  count,
  pending,
  onRestore,
}: {
  /** 방금 뺀 조합 수. 0이면 되돌릴 것이 없다 */
  count: number;
  /** 되돌리기(다시 담기) 요청이 나가 있다. 두 번 눌리면 두 번 담긴다 */
  pending: boolean;
  onRestore: () => void;
}) {
  /* 지운 직후 포커스를 되돌리기로 옮긴다 — 버튼이 그 자리에서 disabled가 돼
     포커스가 <body>로 떨어지던 자리다. 화면에 들어올 때(마운트) 이미 되돌릴
     것이 남아 있는 경우에는 건드리지 않는다: 사장이 다른 화면에 갔다 온 것이지
     방금 지운 것이 아니다 */
  const previous = useRef(count);
  useEffect(() => {
    if (count > 0 && count !== previous.current) {
      document.getElementById(CART_ACTION_ID.restore)?.focus();
    }
    previous.current = count;
  }, [count]);

  return (
    <p
      role="status" /* 위 8 + 아래 12 — 툴바가 이 줄을 품고 있던 때의 간격 그대로다 */
      className="text-secondary-foreground pt-2 pb-3 text-xs"
    >
      {count > 0 ? (
        <>
          {removedNotice(count)}{" "}
          <Button
            id={CART_ACTION_ID.restore}
            variant="link"
            /* 12px 본문 안의 링크라 크기는 그대로 두고 밑줄·굵기·색으로 가른다 */
            className="text-foreground text-xs font-semibold underline underline-offset-2"
            disabled={pending}
            onClick={onRestore}
          >
            되돌리기
          </Button>
        </>
      ) : (
        ""
      )}
    </p>
  );
}
