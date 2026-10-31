"use client";

import { Panel } from "@ondo/ui";
import { useSearchParams } from "next/navigation";
import { useCallback, useRef, useState } from "react";
import { ChatRoomListPanel } from "./ChatRoomList";
import { ChatRoomPanel } from "./ChatRoomPanel";
import { useRoomListEmptyPeek } from "../api/queries";
import { useResetChatSessionOnLeave } from "../api/session";
import { ROOM_TEXT } from "../constants";
import {
  chatsHref,
  draftKey,
  mergeReadMark,
  normalizeQuery,
  parseListFilter,
  parseRoomParam,
} from "../derive";
import type {
  ChatReadResult,
  ReadMarks,
  RoomListFilter,
  RoomListParams,
} from "../types";
import { useChatOutbox } from "../useChatSend";

const NO_CONDITION: RoomListParams = { filter: "ALL", q: null };

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
 *
 * 목록 조건(`?filter&q`)이 걸려도 오른쪽 방은 그대로다. 조건 결과 0이어도, 열어 둔 방이 조건에서 빠져도
 * 선택은 URL `room=`이 원본이라 안 바뀐다(loop-08b Q5, S4-11 ③).
 */
export function ChatView({
  email,
}: {
  /** 로그인 이메일. 쓰던 글 키에 들어간다(`draftKey`). feature끼리 import 못 해 `app/`이 넘긴다 */
  email: string | null;
}) {
  const searchParams = useSearchParams();
  /* 보류 말풍선은 방 패널이 아니라 여기 산다 — 방을 옮겨도 남는다(loop-08b S3-10) */
  const outbox = useChatOutbox();
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

  /* 목록 조건(loop-08b S4). 처음엔 URL에서 읽고, 그다음은 이 state가 화면의 원본이다 — 칩과 검색칸은 누른 순간
     바뀌어야 하는데(디자인 결정 55) 라우터 이동은 transition이라 새 목록을 기다리는 동안 칩까지 옛 값에 묶인다.
     URL은 바꿀 때마다 `replaceState`로 따라 적는다(뒤로 가기 기록을 늘리지 않는다, S4-3). 행 링크가 조건을 달고
     가서(`roomHref`) 방을 옮겨도 URL과 이 값이 같다 */
  const [list, setList] = useState<RoomListParams>(() => ({
    filter: parseListFilter(searchParams.get("filter")),
    q: normalizeQuery(searchParams.get("q")),
  }));
  /* 조건 지우기마다 오른다 — 검색칸을 빈칸으로 다시 마운트하고 포커스를 거기 둔다(디자인 결정 56) */
  const [searchReset, setSearchReset] = useState(0);
  const changeList = useCallback(
    (next: RoomListParams) => {
      setList(next);
      window.history.replaceState(
        null,
        "",
        chatsHref(next.filter, next.q, selectedRoomId),
      );
    },
    [selectedRoomId],
  );
  const onFilter = useCallback(
    (filter: RoomListFilter) => changeList({ ...list, filter }),
    [changeList, list],
  );
  const onQuery = useCallback(
    (q: string | null) => {
      if (q !== list.q) changeList({ ...list, q });
    },
    [changeList, list],
  );
  const onClear = useCallback(() => {
    changeList(NO_CONDITION);
    setSearchReset((n) => n + 1);
  }, [changeList]);

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
        list={list}
        searchReset={searchReset}
        noRooms={listEmpty === true}
        onFilter={onFilter}
        onQuery={onQuery}
        onClear={onClear}
      />
      {selectedRoomId !== null ? (
        <ChatRoomPanel
          key={selectedRoomId}
          roomId={selectedRoomId}
          list={list}
          onRead={onRead}
          focusTick={focusTick}
          onEscape={onEscape}
          draftKey={draftKey(email, selectedRoomId)}
          outbox={outbox}
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
