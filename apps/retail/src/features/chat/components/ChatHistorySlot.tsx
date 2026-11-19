"use client";

import { Button } from "@ondo/ui";
import { useLayoutEffect, useRef, type RefObject } from "react";
import { HISTORY_TEXT } from "../constants";
import type { HistorySlot } from "../types";

/** ≤40rem에서 손가락 높이 44, 글자 14(디자인 결정 68). 데스크톱은 `Button sm` 그대로 28, 12 */
const PHONE_TOUCH = "phone:h-11 phone:text-sm";

/**
 * log 맨 위 한 자리(loop-08d §4-3, 디자인 결정 67~70). 도매 08c `ChatHistorySlot`의 복제다. 자동 불러오기와 버튼이
 * 같이 쓴다 — 불러오는 중, 실패, 끝을 이 자리 하나가 말한다(상단 띠, 토스트 없음).
 *
 * 도매와 다른 곳 둘: 폰 폭 44px(결정 68), 실패 줄의 `다시 시도`가 글자 버튼이 아니라 `Button line sm`(결정 69 —
 * 폰에서 글자 버튼은 누를 자리가 16px다).
 *
 * 말풍선과 같이 스크롤한다(sticky 아님). 그래서 방 머리를 덮을 수 없다(S3-10).
 * 감싼 상자는 `contents`라 log의 flex 간격에 그대로 낀다 — 상자는 포커스를 지켜보는 데만 쓴다.
 *
 * 포커스(도매 결정 87, 93 그대로): 이 자리에 포커스가 있었고 그 노드가 바뀌어 포커스가 떨어졌을 때만 옮긴다 —
 * 더 있으면 같은 버튼(같은 노드라 그대로), 끝이면 log, 실패면 `다시 시도`. 자동은 포커스를 안 건드린다.
 */
export function ChatHistorySlot({
  slot,
  logRef,
  onLoad,
}: {
  slot: HistorySlot;
  /** 끝에 닿으면 포커스를 받을 곳(`tabIndex=-1`) */
  logRef: RefObject<HTMLDivElement | null>;
  /** `fetchOlder`. 한 번에 하나는 그쪽이 지킨다 — 여기선 불러오는 중 누름만 무시한다 */
  onLoad: () => void;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const hadFocus = useRef(false);

  useLayoutEffect(() => {
    if (!hadFocus.current) return;
    const active = document.activeElement;
    if (active !== null && active !== document.body) return;
    const target =
      slot === "end" || slot === "none" || slot === "locked"
        ? logRef.current
        : boxRef.current?.querySelector("button");
    target?.focus({ preventScroll: true });
    if (target === logRef.current) hadFocus.current = false;
  }, [slot, logRef]);

  if (slot === "none") return null;
  return (
    <div
      ref={boxRef}
      className="contents"
      data-history={slot}
      onFocus={() => {
        hadFocus.current = true;
      }}
      onBlur={(e) => {
        /* 노드가 바뀌며 떨어진 포커스는 relatedTarget이 없다 — 그때는 기억을 남겨 위 effect가 옮긴다 */
        if (
          e.relatedTarget !== null &&
          !boxRef.current?.contains(e.relatedTarget)
        )
          hadFocus.current = false;
      }}
    >
      {slot === "end" ? (
        <p
          data-ac="08d:S3-2"
          className="text-muted-foreground shrink-0 pt-1 text-center text-xs"
        >
          {HISTORY_TEXT.end}
        </p>
      ) : slot === "failed" ? (
        <div
          role="alert"
          data-ac="08d:S3-4 08d:S3-10"
          className="flex shrink-0 items-center justify-center gap-2 pt-1 text-xs"
        >
          <span className="text-destructive-strong">{HISTORY_TEXT.failed}</span>
          <Button
            type="button"
            variant="line"
            size="sm"
            data-ac="08d:S3-4"
            className={PHONE_TOUCH}
            onClick={onLoad}
          >
            {HISTORY_TEXT.retry}
          </Button>
        </div>
      ) : (
        <div className="flex shrink-0 justify-center pt-1">
          {/* 더 있음, 불러오는 중, 잠김이 같은 버튼 노드다 — 누른 포커스가 상태가 바뀌어도 그대로 남는다.
              불러오는 중은 `disabled`가 아니라 `aria-disabled`: disabled면 포커스가 body로 떨어진다.
              잠김(401)은 `disabled`만, 이유는 입력창 아래 끊김 줄 하나가 말한다(결정 70) */}
          <Button
            type="button"
            variant="line"
            size="sm"
            disabled={slot === "locked"}
            aria-busy={slot === "loading" || undefined}
            aria-disabled={slot === "loading" || undefined}
            data-ac={
              slot === "locked"
                ? "08d:S3-2 08d:S3-5"
                : slot === "loading"
                  ? "08d:S3-2 08d:S3-3 08d:S3-10"
                  : "08d:S3-2"
            }
            className={
              slot === "loading"
                ? `${PHONE_TOUCH} cursor-progress`
                : PHONE_TOUCH
            }
            onClick={() => {
              if (slot === "more") onLoad();
            }}
          >
            {slot === "loading" ? (
              <>
                <span
                  aria-hidden
                  className="border-border border-t-secondary-foreground size-3 animate-spin rounded-full border-2 motion-reduce:animate-none"
                />
                {HISTORY_TEXT.loading}
              </>
            ) : (
              HISTORY_TEXT.more
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
