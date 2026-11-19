"use client";

import { Button } from "@ondo/ui";
import { useLayoutEffect, useRef, type RefObject } from "react";
import { HISTORY_TEXT } from "../constants";
import type { HistorySlot } from "../types";

/**
 * log 맨 위 한 자리(loop-08c §4-1, 디자인 결정 81~84, 89~94). 자동 불러오기와 버튼이 같이 쓴다 —
 * 불러오는 중, 실패, 끝을 이 자리 하나가 말한다(상단 띠, 토스트 없음).
 *
 * 말풍선과 같이 스크롤한다(sticky 아님). 그래서 방 머리를 덮을 수 없다(S2-12).
 * 감싼 상자는 `contents`라 log의 flex 간격에 그대로 낀다 — 상자는 포커스를 지켜보는 데만 쓴다.
 *
 * 포커스(결정 87, 93): 이 자리에 포커스가 있었고 그 노드가 바뀌어 포커스가 떨어졌을 때만 옮긴다 —
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
          data-ac="08c:S2-4"
          className="text-muted-foreground shrink-0 pt-1 text-center text-xs"
        >
          {HISTORY_TEXT.end}
        </p>
      ) : slot === "failed" ? (
        <div
          role="alert"
          data-ac="08c:S2-5 08c:S2-12 08c:S2-17"
          className="flex shrink-0 items-center justify-center gap-2 pt-1 text-xs"
        >
          <span className="text-destructive-strong">{HISTORY_TEXT.failed}</span>
          <Button
            type="button"
            variant="link"
            size="sm"
            data-ac="08c:S2-5 08c:S2-17"
            onClick={onLoad}
          >
            {HISTORY_TEXT.retry}
          </Button>
        </div>
      ) : (
        <div className="flex shrink-0 justify-center pt-1">
          {/* 더 있음, 불러오는 중, 잠김이 같은 버튼 노드다 — 누른 포커스가 상태가 바뀌어도 그대로 남는다.
              불러오는 중은 `disabled`가 아니라 `aria-disabled`(결정 82): disabled면 포커스가 body로 떨어진다 */}
          <Button
            type="button"
            variant="line"
            size="sm"
            disabled={slot === "locked"}
            aria-busy={slot === "loading" || undefined}
            aria-disabled={slot === "loading" || undefined}
            data-ac={
              slot === "locked"
                ? "08c:S2-5"
                : slot === "loading"
                  ? "08c:S2-2 08c:S2-3 08c:S2-12"
                  : "08c:S2-2 08c:S2-3 08c:S2-12 08c:S2-19"
            }
            className={slot === "loading" ? "cursor-progress" : undefined}
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
