"use client";

import { Badge, Panel } from "@ondo/ui";
import { useQueryClient } from "@tanstack/react-query";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { ChatComposer } from "./ChatComposer";
import { ChatMessageItem, PendingItem } from "./ChatMessageItem";
import { chatKeys } from "../api/keys";
import { useMarkReadMutation } from "../api/mutations";
import { useRoomNamePeek, useRoomQueries } from "../api/queries";
import { isChatSessionLostError, useChatSessionLost } from "../api/session";
import { LIST_TEXT, ROOM_TEXT, SESSION_LOST_TEXT } from "../constants";
import {
  liveAnnouncement,
  maxSequenceOf,
  handoffCauses,
  messageAc,
  readMarkerSequence,
  toThreadItems,
  visiblePending,
} from "../derive";
import type { ChatReadResult, RoomListParams } from "../types";
import type { ChatOutbox } from "../useChatSend";
import { useDocumentVisible } from "../useDocumentVisible";
import { QueryBoundary, QueryErrorView } from "@/shared/api/QueryBoundary";

interface RoomCallbacks {
  onRead: (result: ChatReadResult) => void;
  focusTick: number;
  /** 입력창 Esc — 포커스를 목록의 선택 행으로(S4-11) */
  onEscape: () => void;
  /** 쓰던 글을 기억할 키(loop-08b S3). null이면 기억하지 않는다 */
  draftKey: string | null;
  /** 화면 전체의 보내기(`useChatOutbox`). 보류 말풍선은 방 패널 밖에 살아 방을 옮겨도 남는다 */
  outbox: ChatOutbox;
}

/**
 * 오른쪽 방 패널. 패널은 경계 밖에 있어 로딩, 실패, 없는 방이 전부 **같은 패널 안에서** 그려진다.
 * 왼쪽 목록은 다른 경계라 메시지 조회가 실패해도 그대로 눌린다(S3-9).
 *
 * 부르는 쪽이 `key={roomId}`를 준다 — 방을 옮기면 낭독 기준점이 새로 시작한다. 쓰던 글은 저장소에서
 * (`useRoomDraft`), 보류 말풍선은 `ChatView`의 outbox에서 그 방 것을 다시 받는다(loop-08b S3).
 */
export function ChatRoomPanel({
  roomId,
  list,
  ...callbacks
}: {
  roomId: number;
  /** 왼쪽 목록의 지금 조건. 방 이름을 그 목록 캐시에서 먼저 꺼낸다 */
  list: RoomListParams;
} & RoomCallbacks) {
  const hintName = useRoomNamePeek(roomId, list);

  /* 실패한 채로 방을 떠나면 그 실패를 버린다 — 다시 열면 새로 묻는다. 안 버리면 Suspense 경계가
     같은 실패를 그대로 다시 그려서, 사장이 다른 방에 갔다 와도 `다시 시도`를 눌러야 한다 */
  const queryClient = useQueryClient();
  useEffect(
    () => () => {
      for (const queryKey of [chatKeys.thread(roomId), chatKeys.room(roomId)])
        if (queryClient.getQueryState(queryKey)?.status === "error")
          queryClient.removeQueries({ queryKey, exact: true });
    },
    [queryClient, roomId],
  );

  return (
    <Panel className="min-w-0 flex-1" data-ac="S2-5 S3-9">
      <QueryBoundary
        className="my-auto"
        fallback={
          <>
            {hintName ? <Panel.Title>{hintName}</Panel.Title> : null}
            <RoomSkeleton />
          </>
        }
        notFound={
          <p className="text-muted-foreground text-sm" data-ac="S2-5">
            {ROOM_TEXT.notFound}
          </p>
        }
        errorFallback={({ error, described, retry }) => (
          <>
            {hintName ? <Panel.Title>{hintName}</Panel.Title> : null}
            {/* 입력창은 숨긴다 — 못 읽은 방에 보내지 않게(디자인 결정 13).
                세션이 끊긴 뒤 연 방은 다시 시도해도 같다 — 버튼 없이 이유만 */}
            {isChatSessionLostError(error) ? (
              <p
                role="alert"
                className="text-destructive-strong my-auto text-center text-sm"
              >
                {SESSION_LOST_TEXT}
              </p>
            ) : (
              <QueryErrorView
                described={described}
                onRetry={retry}
                className="my-auto"
              />
            )}
          </>
        )}
      >
        <ChatRoom roomId={roomId} {...callbacks} />
      </QueryBoundary>
    </Panel>
  );
}

/** 방 머리(소매처명)는 목록에서 이미 알면 먼저 그린다. 말풍선 자리만 막대 3개 */
function RoomSkeleton() {
  return (
    <div
      role="status"
      aria-label="불러오는 중"
      className="my-auto grid w-full gap-3"
    >
      <div className="bg-muted h-9 w-9/20 animate-pulse rounded-control" />
      <div className="bg-muted h-9 w-7/20 animate-pulse justify-self-end rounded-control" />
      <div className="bg-muted h-9 w-11/20 animate-pulse rounded-control" />
    </div>
  );
}

function ChatRoom({
  roomId,
  onRead,
  focusTick,
  onEscape,
  draftKey,
  outbox,
}: { roomId: number } & RoomCallbacks) {
  const queryClient = useQueryClient();
  const { room, thread, threadUpdatedAt } = useRoomQueries(roomId);
  const now = useNow();
  const sessionLost = useChatSessionLost();
  const visible = useDocumentVisible();
  const name = room.counterpart.name;
  const maxSequence = maxSequenceOf(thread.messages);

  /* 낭독 기준점 — 방을 연 순간의 마지막 sequence. 이 뒤에 온 소매 메시지만 알린다(S3-8).
     state 초깃값이라 polling이 다시 그려도 바뀌지 않는다. 같은 값이 polling으로 새로 붙은 말풍선의 기준이다(F7) */
  const [baseline] = useState(maxSequence);
  const [openedCursor] = useState(thread.cursor);
  const live = liveAnnouncement(thread.messages, baseline, name);

  /* 새 메시지를 받으면 목록과 방 머리를 비운다 — 둘 다 서버가 계산한 `needsReply`, 미리보기, 순서를 들고 있다.
     처음 연 값과 같으면 아무것도 안 한다(열기만 했는데 목록을 다시 부르지 않게) */
  useEffect(() => {
    if (thread.cursor <= openedCursor) return;
    void queryClient.invalidateQueries({ queryKey: chatKeys.rooms() });
    void queryClient.invalidateQueries({ queryKey: chatKeys.room(roomId) });
  }, [thread.cursor, openedCursor, queryClient, roomId]);

  /* 읽음(S3-7). 그린 가장 큰 sequence가 서버가 **확인해 준** 위치보다 크고, 탭이 보이고, 세션이 살아 있을 때.
     - 확인된 위치(confirmed)와 날아가는 중인 위치(inFlight)를 나눈다(리뷰 F2). 응답 전 다시 그려져도 1회,
       실패하면 inFlight만 풀려 다음 polling 응답(threadUpdatedAt) 때 다시 보낸다
     - 숨김 중 쌓인 것은 다시 보이는 순간(visible) 평가한다(리뷰 F3) */
  const { mutateAsync: markRead } = useMarkReadMutation();
  const confirmedRead = useRef(room.myLastReadSequence);
  const inFlightRead = useRef(0);
  useEffect(() => {
    if (!visible || sessionLost) return;
    if (
      maxSequence <= confirmedRead.current ||
      maxSequence <= inFlightRead.current
    )
      return;
    const target = maxSequence;
    inFlightRead.current = target;
    markRead({ roomId, lastReadSequence: target }).then(
      (result) => {
        confirmedRead.current = Math.max(
          confirmedRead.current,
          result.lastReadSequence,
        );
        if (inFlightRead.current === target) inFlightRead.current = 0;
        onRead(result);
      },
      () => {
        if (inFlightRead.current === target) inFlightRead.current = 0;
      },
    );
  }, [
    maxSequence,
    visible,
    sessionLost,
    threadUpdatedAt,
    markRead,
    onRead,
    roomId,
  ]);

  const pending = outbox.pendingOf(roomId);
  /* 입력창이 memo라 보내기 함수는 방이 같으면 같은 참조여야 한다 */
  const { send: sendTo } = outbox;
  const send = useCallback(
    (body: string) => sendTo(roomId, body),
    [sendTo, roomId],
  );
  const shownPending = visiblePending(pending, thread.messages);
  const pendingIds = new Set(pending.map((p) => p.clientMessageId));

  /* 새 메시지가 오거나 내가 보내면 항상 바닥으로(알려진 한계 — 위치 보존과 `새 메시지 N개`는 loop-08) */
  const logRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const log = logRef.current;
    if (log) log.scrollTop = log.scrollHeight;
  }, [thread.messages.length, shownPending.length]);

  const items = toThreadItems(thread.messages);
  const causes = handoffCauses(thread.messages);
  /* 상대 읽음은 캐시의 방별 최댓값 하나만 본다(머리와 meta가 이미 합쳐져 있다). 값만 바뀐 polling은
     말풍선 수가 그대로라 위 바닥 내리기가 안 돈다 — 읽던 자리가 안 움직인다(S3-4) */
  const readSequence = readMarkerSequence(
    thread.messages,
    thread.counterpartRead,
  );

  return (
    <>
      <Panel.Title
        suffix={
          room.needsReply ? (
            <Badge tone="active" data-ac="S2-2">
              {LIST_TEXT.needsReply}
            </Badge>
          ) : null
        }
      >
        {name}
      </Panel.Title>

      {/* Panel.Body와 같은 스크롤 자리. ref가 필요해 직접 그린다(Panel.Body는 ref를 받지 않는다).
          첫 자식의 mt-auto가 짧은 대화를 아래로 붙이고, 넘치면 0이 되어 위로 스크롤된다(디자인 결정 17) */}
      <div
        ref={logRef}
        role="log"
        aria-label={ROOM_TEXT.logLabel}
        aria-live="off"
        tabIndex={-1}
        /* polling 상태. 화면엔 안 보인다 — e2e가 간격(S3-6)을 잴 때 "응답이 반영됐다"를 이걸로 안다 */
        data-cursor={thread.cursor}
        data-poll-failures={thread.failures}
        className="scroll-slim flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-1 pb-3"
      >
        <div aria-hidden className="mt-auto shrink-0" />
        {items.length === 0 && shownPending.length === 0 ? (
          <p
            data-ac="S3-9"
            className="text-muted-foreground py-12 text-center text-sm"
          >
            {ROOM_TEXT.empty}
          </p>
        ) : (
          items.map((item) =>
            item.type === "divider" ? (
              <DateDivider key={item.key}>{item.label}</DateDivider>
            ) : (
              <ChatMessageItem
                key={item.key}
                message={item.message}
                counterpartName={name}
                ac={messageAc(item.message, baseline, pendingIds, causes)}
                readMark={item.message.sequence === readSequence}
                /* "오늘"의 기준 = 지금 시각(1분 tick). 마지막 polling 응답 시각을 쓰면 응답이 끊긴 동안(오프라인,
                   세션 끊김) 자정을 넘겨도 날짜가 안 붙는다(리뷰 M4, D38 ⑤). 소매(`useNow`)와 같은 방식 */
                nowMs={now}
              />
            ),
          )
        )}
        {shownPending.map((item) => (
          <PendingItem
            key={item.clientMessageId}
            item={item}
            sessionLost={sessionLost}
            onRetry={() => outbox.retry(roomId, item)}
            onRemove={() => outbox.remove(roomId, item.clientMessageId)}
          />
        ))}
      </div>

      <ChatComposer
        key={draftKey ?? "no-draft"}
        draftKey={draftKey}
        counterpartName={name}
        focusTick={focusTick}
        sessionLost={sessionLost}
        onSend={send}
        onEscape={onEscape}
      />

      {/* 알림 통로는 이것 하나(디자인 결정 20). log는 off — 내 말, 자동 답변, 한 번에 받은 50개까지 읽지 않게.
          글을 sequence를 key로 한 span에 넣는다 — 같은 본문이 연달아 와도 노드가 바뀌어 다시 읽힌다(QA F8) */}
      <div
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
        data-ac="S3-8"
      >
        {live ? <span key={live.sequence}>{live.text}</span> : null}
      </div>
    </>
  );
}

function DateDivider({ children }: { children: string }) {
  return (
    <div
      role="separator"
      aria-label={children}
      data-ac="S3-1"
      className="text-muted-foreground before:border-border after:border-border flex shrink-0 items-center gap-3 text-xs before:flex-1 before:border-t after:flex-1 after:border-t"
    >
      {children}
    </div>
  );
}

/**
 * 지금 시각(ms). 조회 시각 줄의 "오늘" 판정(S3-5)을 렌더 중에 시계를 읽지 않고 하려고 state로 둔다.
 * 1분마다 갱신 — 줄이 분 단위("14:20 조회")라 자정 뒤 최대 1분 늦게 날짜가 붙는다
 */
function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), NOW_TICK_MS);
    return () => clearInterval(timer);
  }, []);
  return now;
}

const NOW_TICK_MS = 60_000;
