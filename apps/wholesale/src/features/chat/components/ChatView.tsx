"use client";

import { Panel } from "@ondo/ui";
import { useSearchParams } from "next/navigation";
import { useCallback, useRef, useState } from "react";
import { ChatRoomListPanel } from "./ChatRoomList";
import { ChatRoomPanel } from "./ChatRoomPanel";
import { useRoomListEmptyPeek } from "../api/queries";
import { useResetChatSessionOnLeave } from "../api/session";
import { ROOM_TEXT } from "../constants";
import { mergeReadMark, parseRoomParam } from "../derive";
import type { ChatReadResult, ReadMarks } from "../types";

/**
 * 도매 채팅 받은편지함 — 왼쪽 목록 360px 고정 + 오른쪽 방 유동(방향안 C).
 *
 * `ListDetailLayout`을 쓰지 않는다. 그건 왼쪽이 늘고 오른쪽이 `w-md`로 고정이라 반대 구조다
 * (01-plan §4-1 2). 쓰는 화면이 하나뿐이라 승격하지 않고 여기 둔다(Rule of Two).
 *
 * **선택은 URL이 원본이다**(`?room=`, ADR-0003). 첫 진입에 방을 자동으로 열지 않는다 — 열면 읽음이
 * 나가서 사장이 안 본 방이 읽힌 것이 된다(디자인 결정 4).
 *
 * 읽음 응답은 여기 모아 목록에 내려 준다(`readMarks`). 방 패널과 목록 패널이 다른 경계라 둘을 아는 곳이 여기다.
 */
export function ChatView() {
  const searchParams = useSearchParams();
  const selected = parseRoomParam(searchParams.get("room"));
  const selectedRoomId = typeof selected === "number" ? selected : null;

  const [readMarks, setReadMarks] = useState<ReadMarks>({});
  const onRead = useCallback(
    (result: ChatReadResult) =>
      setReadMarks((marks) => mergeReadMark(marks, result)),
    [],
  );

  const [focusTick, setFocusTick] = useState(0);
  const onOpen = useCallback(() => setFocusTick((n) => n + 1), []);

  const listRef = useRef<HTMLUListElement>(null);
  const listEmpty = useRoomListEmptyPeek();
  useResetChatSessionOnLeave();
  /* 입력창 Esc → 선택 행으로(S4-11). 쓰던 글은 입력창에 남는다 — 같은 행에서 Enter면 이어 쓴다 */
  const onEscape = useCallback(
    () =>
      listRef.current
        ?.querySelector<HTMLAnchorElement>('a[aria-current="true"]')
        ?.focus(),
    [],
  );

  return (
    <div className="flex min-h-0 flex-1 gap-2">
      <ChatRoomListPanel
        selectedRoomId={selectedRoomId}
        readMarks={readMarks}
        listRef={listRef}
        onOpen={onOpen}
      />
      {selectedRoomId !== null ? (
        <ChatRoomPanel
          key={selectedRoomId}
          roomId={selectedRoomId}
          onRead={onRead}
          focusTick={focusTick}
          onEscape={onEscape}
        />
      ) : (
        <Panel className="min-w-0 flex-1" data-ac="S2-5">
          {/* 방이 0개면 빈 패널 — 고를 게 없는데 "고르세요"는 틀린 안내다(디자인 결정 16) */}
          {listEmpty === true ? null : (
            <p className="text-muted-foreground my-auto text-center text-sm">
              {selected === "invalid" ? ROOM_TEXT.notFound : ROOM_TEXT.pick}
            </p>
          )}
        </Panel>
      )}
    </div>
  );
}
