"use client";

import { Button, Panel } from "@ondo/ui";
import { isApiError } from "@ondo/api";
import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ChatComposer } from "./ChatComposer";
import { ChatMessageItem, PendingItem } from "./ChatMessageItem";
import { useRoomQueries } from "../api/queries";
import {
  isChatSessionLostError,
  useChatSessionLost,
  useResetChatSessionOnLeave,
} from "../api/session";
import {
  APPROVAL_PATH,
  LOGIN_PATH,
  ROOM_TEXT,
  SESSION_FIRST_TEXT,
} from "../constants";
import {
  liveAnnouncement,
  maxSequenceOf,
  messageAc,
  returnLinkOf,
  toThreadItems,
  visiblePending,
} from "../derive";
import type { ChatRoomDetail, ChatThread, ReturnLink } from "../types";
import { useChatSend } from "../useChatSend";
import { RETAIL_ERROR_CODE } from "@/shared/api/errorCodes";

/**
 * 방 블록 높이 = 보이는 화면 높이 − 헤더 57(h-14 + 아래 선 1) − 본문 위아래 여백 16(AppShell `main p-2`)
 * (디자인 결정 5). 소매 셸은 문서형 스크롤이라 블록이 화면에 맞춰 높이를 정하고 **메시지 영역만** 안에서
 * 스크롤한다 — 페이지 자체에는 세로 스크롤이 생기지 않는다(S5-9).
 *
 * 하한 448(`min-h-112`, 디자인 결정 13). 이보다 낮은 창(390x480, 가로 모드)에선 블록이 하한을 지키고
 * 그때만 페이지가 스크롤한다(S5-15). `dvh`라 모바일 주소창이 접히고 펴질 때도 따라간다.
 */
const BLOCK_HEIGHT = "relative h-[calc(100dvh-73px)] min-h-112";

/**
 * 소매 채팅방 `/chats/{roomId}`. 목록 없이 방 하나다(01-plan §3 in 2). 방 머리와 메시지는 브라우저에서
 * 받는다 — 목이 브라우저 MSW라 서버 fetch로는 닿지 않는다(§4-2 1).
 *
 * 블록(패널)은 상태와 상관없이 같은 자리, 같은 높이에 있고 로딩, 없는 방, 실패가 그 안에서 그려진다.
 */
export function ChatRoomView({
  roomId,
  from,
}: {
  roomId: number;
  /** 주소의 `?from=`. 검사는 `returnLinkOf`가 한다 — 외부 주소는 버린다 */
  from: string | null;
}) {
  useResetChatSessionOnLeave();
  return (
    <div className="mx-auto max-w-wrap">
      <ChatBlock key={roomId} roomId={roomId} from={from} />
    </div>
  );
}

function hasCode(error: unknown, code: string): boolean {
  return isApiError(error) && error.code === code;
}

function ChatBlock({ roomId, from }: { roomId: number; from: string | null }) {
  const router = useRouter();
  const { room, thread } = useRoomQueries(roomId);
  const errors = [room.error, thread.error];
  const notApproved = errors.some((e) =>
    hasCode(e, RETAIL_ERROR_CODE.ACCOUNT_NOT_APPROVED),
  );

  /* 승인 전 계정(403) — 다른 소매 화면과 같은 갈래로 승인 대기 화면에 보낸다 */
  useEffect(() => {
    if (notApproved) router.replace(APPROVAL_PATH);
  }, [notApproved, router]);

  if (errors.some((e) => hasCode(e, RETAIL_ERROR_CODE.RESOURCE_NOT_FOUND)))
    return (
      <Panel className={BLOCK_HEIGHT}>
        <NotFoundState />
      </Panel>
    );

  /* 첫 조회 401(S6-13) — 방 이름도 대화도 못 받았다. 쓴 글이 없어 `로그인하기`를 둔다. 주소는 그대로 */
  if (errors.some(isChatSessionLostError))
    return (
      <Panel className={BLOCK_HEIGHT} data-ac="S6-13">
        <SessionFirstState />
      </Panel>
    );

  if (room.isError || thread.isError) {
    return (
      <Panel className={BLOCK_HEIGHT} data-ac="S5-8">
        {room.data ? (
          <RoomHead
            name={room.data.counterpart.name}
            back={returnLinkOf(from, room.data.counterpart.id)}
          />
        ) : null}
        {notApproved ? (
          <RoomSkeleton />
        ) : (
          <LoadFailedState
            onRetry={() => {
              // 실패한 것만 다시 묻는다 — 받아 둔 방 머리를 또 부르지 않게(S5-8 "재요청 1회")
              if (room.isError) void room.refetch();
              if (thread.isError) void thread.refetch();
            }}
          />
        )}
      </Panel>
    );
  }

  if (room.data === undefined || thread.data === undefined)
    return (
      <Panel className={BLOCK_HEIGHT} data-ac="S5-5">
        <div className="mb-4 flex h-7 items-center">
          <div className="bg-muted h-6 w-40 animate-pulse rounded-control" />
        </div>
        <RoomSkeleton />
      </Panel>
    );

  return (
    <ChatRoom
      roomId={roomId}
      room={room.data}
      thread={thread.data}
      from={from}
    />
  );
}

function ChatRoom({
  roomId,
  room,
  thread,
  from,
}: {
  roomId: number;
  room: ChatRoomDetail;
  thread: ChatThread;
  from: string | null;
}) {
  const name = room.counterpart.name;
  const back = returnLinkOf(from, room.counterpart.id);

  /* 기준점 — 방을 연 순간의 마지막 sequence. 이 뒤에 붙은 도매 말풍선이 polling으로 받은 것이다(S6-7).
     state 초깃값이라 polling이 다시 그려도 바뀌지 않는다 */
  const [baseline] = useState(maxSequenceOf(thread.messages));
  const live = liveAnnouncement(thread.messages, baseline, name);
  const sessionLost = useChatSessionLost();

  const { pending, send, retry, remove } = useChatSend(roomId);
  const shownPending = visiblePending(pending, thread.messages);
  const pendingIds = new Set(pending.map((p) => p.clientMessageId));

  /* 새 메시지가 오거나 내가 보내면 항상 바닥으로(알려진 한계 — 위치 보존은 loop-08, 도매와 같다) */
  const logRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const log = logRef.current;
    if (log) log.scrollTop = log.scrollHeight;
  }, [thread.messages.length, shownPending.length]);

  /* 입력창이 늘면(여러 줄, 오류 두 줄) 블록 높이는 그대로라 메시지 영역이 줄어든다(디자인 상태 20).
     줄어든 만큼 마지막 말풍선이 입력창 뒤로 밀려 가리지 않게, 바닥을 보고 있었으면 바닥을 지킨다(S5-15).
     위를 읽던 중이면 건드리지 않는다 */
  useEffect(() => {
    const log = logRef.current;
    if (log === null) return;
    let atBottom = true;
    const onScroll = () => {
      atBottom = log.scrollHeight - log.scrollTop - log.clientHeight <= 4;
    };
    const observer = new ResizeObserver(() => {
      if (atBottom) log.scrollTop = log.scrollHeight;
    });
    log.addEventListener("scroll", onScroll, { passive: true });
    observer.observe(log);
    return () => {
      log.removeEventListener("scroll", onScroll);
      observer.disconnect();
    };
  }, []);

  const items = toThreadItems(thread.messages);

  return (
    <Panel
      role="region"
      aria-label={`${name}${ROOM_TEXT.regionSuffix}`}
      data-ac="S5-5 S5-9"
      className={BLOCK_HEIGHT}
    >
      <RoomHead name={name} back={back} documentNav={sessionLost} />

      {/* 첫 자식의 mt-auto가 짧은 대화를 아래로 붙이고, 넘치면 0이 되어 위로 스크롤된다
          (도매 디자인 결정 17 — `justify-content:flex-end`는 위쪽이 잘려 쓰지 않는다) */}
      <div
        ref={logRef}
        role="log"
        aria-label={ROOM_TEXT.logLabel}
        aria-live="off"
        tabIndex={-1}
        /* polling 상태. 화면엔 안 보인다 — e2e가 간격(S6-8)을 잴 때 "응답이 반영됐다"를 이걸로 안다 */
        data-cursor={thread.cursor}
        data-poll-failures={thread.failures}
        /* `relative`가 있어야 말풍선 앞 숨긴 발신자(`sr-only`, position:absolute)의 기준 상자가 이 영역이 된다.
           없으면 기준이 문서라 스크롤에 안 잘리고 문서 높이를 늘려 페이지가 스크롤했다(QA F3) */
        className="scroll-slim relative flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-1 pb-3"
      >
        <div aria-hidden className="mt-auto shrink-0" />
        {items.length === 0 && shownPending.length === 0 ? (
          <p
            data-ac="S5-8"
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
                ac={messageAc(item.message, baseline, pendingIds)}
              />
            ),
          )
        )}
        {shownPending.map((item) => (
          <PendingItem
            key={item.clientMessageId}
            item={item}
            sessionLost={sessionLost}
            onRetry={() => retry(item)}
            onRemove={() => remove(item.clientMessageId)}
          />
        ))}
      </div>

      <ChatComposer
        counterpartName={name}
        sessionLost={sessionLost}
        onSend={send}
      />

      {/* 알림 통로는 이것 하나(도매 디자인 결정 20). log는 off — 내 말, 한 번에 받은 50개까지 읽지 않게.
          글을 sequence를 key로 한 span에 넣는다 — 같은 본문이 연달아 와도 노드가 바뀌어 다시 읽힌다(S6-11) */}
      <div
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
        data-ac="S6-11"
      >
        {live ? <span key={live.sequence}>{live.text}</span> : null}
      </div>
    </Panel>
  );
}

/**
 * 방 머리 — h1 도매처명 + 돌아가기 링크 하나(디자인 결정 6, 14). 링크는 줄바꿈 없이 고정하고 이름만
 * 말줄임한다(30자 상호도 한 줄, S5-15). 전체 이름은 `title`. Panel.Title(아래 여백 24)을 쓰지 않는 이유:
 * 390에서 말풍선 자리를 한 줄 더 남기려고 16으로 줄였다.
 */
function RoomHead({
  name,
  back,
  documentNav = false,
}: {
  name: string;
  back: ReturnLink;
  /**
   * 세션이 끊긴 뒤엔 `<a href>` 전체 이동(디자인 결정 15, S6-14). 클라이언트 이동이면 RSC 요청이 401을
   * 받아 오류 화면으로 갈 수 있고, `(shop)` 레이아웃이 다시 돈다고 기대할 수 없다. 새 문서 요청이면
   * 서버의 `requireSession`이 `/login`으로 보낸다
   */
  documentNav?: boolean;
}) {
  /* ≤40rem 높이 44 — 손가락 기준, 문의하기 버튼과 같다(와이어프레임 .rtitle .home, QA F4) */
  const className =
    "text-muted-foreground hover:text-foreground text-body flex shrink-0 items-center gap-0.5 whitespace-nowrap phone:min-h-11";
  return (
    <div data-ac="S5-5 S5-13 S5-15" className="mb-4 flex items-center gap-3">
      <h1 title={name} className="min-w-0 flex-1 truncate text-xl font-medium">
        {name}
      </h1>
      {documentNav ? (
        <a href={back.href} data-ac="S5-13 S6-14" className={className}>
          <ReturnLabel kind={back.kind} />
        </a>
      ) : (
        <Link href={back.href} data-ac="S5-13" className={className}>
          <ReturnLabel kind={back.kind} />
        </Link>
      )}
    </div>
  );
}

/**
 * 첫 조회 401(S6-13, 디자인 결정 16). 블록 가운데 안내 + `로그인하기`. 머리와 입력창이 없고 빨강도 없다 —
 * 실패가 아니라 상태 안내다. 쓴 글이 없어서 전체 이동(`<a href>`)해도 잃는 게 없다. 로그인 뒤 돌아오기
 * (`next`)는 기존 로그인 화면에 없어 이번엔 안 한다.
 */
function SessionFirstState() {
  return (
    <div
      data-ac="S6-13"
      className="my-auto flex flex-col items-center gap-3 text-center"
    >
      <div>
        <p className="text-sm font-medium">{SESSION_FIRST_TEXT.title}</p>
        <p className="text-muted-foreground mt-1 text-xs">
          {SESSION_FIRST_TEXT.detail}
        </p>
      </div>
      <Button asChild variant="line" size="sm">
        <a href={LOGIN_PATH} data-ac="S6-13">
          {SESSION_FIRST_TEXT.login}
        </a>
      </Button>
    </div>
  );
}

/** `‹ 상품으로 돌아가기`(뒤로 가는 말) / `도매처 홈 ›`(SellerCard와 같은 꺾쇠) */
function ReturnLabel({ kind }: { kind: ReturnLink["kind"] }) {
  return kind === "product" ? (
    <>
      <ChevronLeft aria-hidden className="size-3.5" />
      {ROOM_TEXT.backToProduct}
    </>
  ) : (
    <>
      {ROOM_TEXT.wholesalerHome}
      <ChevronRight aria-hidden className="size-3.5" />
    </>
  );
}

/** 말풍선 자리 막대 3개. 소매엔 목록이 없어 방 이름을 미리 모른다 — 머리도 막대다(디자인 결정 10) */
function RoomSkeleton() {
  return (
    <div
      role="status"
      aria-label={ROOM_TEXT.loading}
      className="mt-auto grid w-full gap-3 pb-3"
    >
      <div className="bg-muted h-9 w-9/20 animate-pulse rounded-control" />
      <div className="bg-muted h-9 w-7/20 animate-pulse justify-self-end rounded-control" />
      <div className="bg-muted h-9 w-11/20 animate-pulse rounded-control" />
    </div>
  );
}

/** 남의 방, 없는 방(404). 실패가 아니라 "없다"라 다시 시도가 없다. 머리도 없다 — 이름을 모른다 */
function NotFoundState() {
  return (
    <div
      data-ac="S5-8"
      className="my-auto flex flex-col items-center gap-3 text-center"
    >
      <p className="text-muted-foreground text-sm">{ROOM_TEXT.notFound}</p>
      <Button asChild variant="line" size="sm">
        <Link href="/">{ROOM_TEXT.home}</Link>
      </Button>
    </div>
  );
}

/**
 * 첫 조회 실패. 입력창은 숨긴다 — 못 읽은 방에 보내지 않게(도매 디자인 결정 13). 문구는 소매 다른 실패
 * 문구와 같은 꼴(디자인 결정 12).
 */
function LoadFailedState({ onRetry }: { onRetry: () => void }) {
  return (
    <div
      role="alert"
      data-ac="S5-8"
      className="my-auto flex flex-col items-center gap-3 text-center"
    >
      <div>
        <p className="text-sm font-medium">{ROOM_TEXT.loadFailed}</p>
        <p className="text-muted-foreground mt-1 text-xs">
          {ROOM_TEXT.loadFailedDetail}
        </p>
      </div>
      <Button
        type="button"
        variant="line"
        size="sm"
        onClick={onRetry}
        data-ac="S5-8"
      >
        {ROOM_TEXT.retry}
      </Button>
    </div>
  );
}

function DateDivider({ children }: { children: string }) {
  return (
    <div
      role="separator"
      aria-label={children}
      data-ac="S5-5"
      className="text-muted-foreground before:border-border after:border-border flex shrink-0 items-center gap-3 text-xs before:flex-1 before:border-t after:flex-1 after:border-t"
    >
      {children}
    </div>
  );
}
