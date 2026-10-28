import { isApiError, TRANSPORT_ERROR_CODE } from "@ondo/api";
import {
  BODY_COUNTER_FROM,
  BODY_MAX,
  CHAT_TIME_ZONE,
  ENTRY_TEXT,
  PENDING_TEXT,
  RETURN_PATH_PATTERN,
  ROOM_TEXT,
  WEEKDAY_LABEL,
} from "./constants";
import type {
  BubbleKind,
  ChatMessage,
  ChatThread,
  ComposerCheck,
  PendingMessage,
  ReturnLink,
  SendFailure,
  ThreadItem,
} from "./types";
import { RETAIL_ERROR_CODE } from "@/shared/api/errorCodes";

/*
 * 도매 `apps/wholesale/src/features/chat/derive.ts`와 짝이다(01-plan §4-6). 앱 사이 import가 금지라
 * 복제했다 — **같은 이름, 같은 테스트 케이스**를 쓰고, 한쪽 버그를 고치면 다른 쪽도 고친다.
 * 역할에 따라 답이 바뀌는 함수(`bubbleKindOf` `senderLabel` `messageAc`, #285의 `liveAnnouncement`)만
 * 소매 시점으로 뒤집었다(§4-5 표). 정확 수량 근거 칸(`toFactsView`)은 소매에 없다(D31②).
 */

/* ------------------------------------------------------------------------
 * 시각 — 서버는 UTC 오프셋이 붙은 ISO를 주고, 화면은 전부 서울 시각으로 읽는다.
 * TODO(#285): `formatClock` `seoulDateKey` `formatDateDivider`는 도메인 없는 유틸이라 두 앱 공용 후보다
 * (01-plan §8, `packages/api/src/runtime/` 옆). 이번엔 복제한다.
 * ------------------------------------------------------------------------ */

interface SeoulParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  /** 0 = 일요일 */
  weekday: number;
}

const SEOUL_FORMAT = new Intl.DateTimeFormat("en-US", {
  timeZone: CHAT_TIME_ZONE,
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "numeric",
  minute: "numeric",
  weekday: "short",
  hourCycle: "h23",
});

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

function seoulParts(ms: number): SeoulParts {
  const parts: Record<string, string> = {};
  for (const part of SEOUL_FORMAT.formatToParts(ms)) {
    parts[part.type] = part.value;
  }
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    weekday: WEEKDAY_INDEX[parts.weekday ?? ""] ?? 0,
  };
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

/** 말풍선 옆 시각 `HH:mm` */
export function formatClock(iso: string): string {
  const p = seoulParts(Date.parse(iso));
  return `${pad2(p.hour)}:${pad2(p.minute)}`;
}

/** 서울 달력 날짜 키. 날짜 구분선을 가르는 기준이다 */
export function seoulDateKey(iso: string): string {
  const p = seoulParts(Date.parse(iso));
  return `${p.year}-${pad2(p.month)}-${pad2(p.day)}`;
}

/** 날짜 구분선 `10월 27일 (화)` */
export function formatDateDivider(iso: string): string {
  const p = seoulParts(Date.parse(iso));
  return `${p.month}월 ${p.day}일 (${WEEKDAY_LABEL[p.weekday]})`;
}

/* ------------------------------------------------------------------------
 * 입구와 돌아가기
 * ------------------------------------------------------------------------ */

/**
 * 주소의 방 번호. 양의 정수만. 아니면 null — 페이지가 서버에 묻지 않고 `notFound()`로 보낸다(S5-8).
 * 도매 `parseRoomParam`(쿼리 `?room=`)과 달리 경로 매개변수라 "방 미선택"이 없다.
 */
export function parseRoomId(raw: string): number | null {
  if (!/^\d+$/.test(raw)) return null;
  const id = Number(raw);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

/** 지금 경로가 돌아올 곳으로 받을 수 있는 값이면 그대로, 아니면 null */
function returnPathOf(path: string | null | undefined): ReturnLink | null {
  if (path === null || path === undefined) return null;
  if (RETURN_PATH_PATTERN.product.test(path))
    return { href: path, kind: "product" };
  if (RETURN_PATH_PATTERN.wholesaler.test(path))
    return { href: path, kind: "wholesaler" };
  return null;
}

/**
 * 방 주소. `from`은 받을 수 있는 값일 때만 싣는다. 인코딩하지 않는 이유: 허용값이 `/`와 숫자뿐이라
 * 그대로 실어도 안전하고, 주소창에 `/chats/1?from=/products/11`로 읽힌다(S5-1).
 */
export function chatRoomHref(roomId: number, from: string | null): string {
  const back = returnPathOf(from);
  return back === null
    ? `/chats/${roomId}`
    : `/chats/${roomId}?from=${back.href}`;
}

/**
 * 방 머리의 돌아가기 링크 하나(S5-13). `from`이 `/products/숫자`면 그 상품으로, `/wholesalers/숫자`면 그
 * 도매처 홈으로. 없거나 다른 값(`https://x.test`, `//x.test`)은 버리고 상대 도매처 홈.
 */
export function returnLinkOf(
  from: string | null,
  counterpartId: number,
): ReturnLink {
  return (
    returnPathOf(from) ?? {
      href: `/wholesalers/${counterpartId}`,
      kind: "wholesaler",
    }
  );
}

/**
 * 문의하기 실패를 화면 반응으로(01-plan §4-1 2). 401은 공용 처리(`providers.tsx`)가 `/login`으로
 * 보내므로 여기서 문구를 띄우지 않는다 — 이 단계엔 쓴 글이 없어 전체 이동해도 잃는 게 없다.
 */
export function entryFailureOf(
  error: unknown,
): "approval" | "session" | { message: string } {
  if (isApiError(error)) {
    if (error.code === RETAIL_ERROR_CODE.ACCOUNT_NOT_APPROVED)
      return "approval";
    if (error.code === RETAIL_ERROR_CODE.UNAUTHORIZED) return "session";
    if (error.code === RETAIL_ERROR_CODE.RESOURCE_NOT_FOUND)
      return { message: ENTRY_TEXT.notFound };
  }
  return { message: ENTRY_TEXT.failed };
}

/* ------------------------------------------------------------------------
 * 방 — 메시지 합치기, 구분선, 말풍선 모양
 * ------------------------------------------------------------------------ */

/**
 * 메시지 두 묶음을 sequence로 합친다. 같은 sequence는 하나만(나중 것이 이긴다 — 서버가 다시 준 값),
 * 결과는 오름차순. polling 결과, 보내기 응답이 같은 메시지를 두 번 가져와도 한 번만 그린다.
 */
export function mergeMessages(
  existing: readonly ChatMessage[],
  incoming: readonly ChatMessage[],
): ChatMessage[] {
  const bySequence = new Map<number, ChatMessage>();
  for (const message of existing) bySequence.set(message.sequence, message);
  for (const message of incoming) bySequence.set(message.sequence, message);
  return [...bySequence.values()].sort((a, b) => a.sequence - b.sequence);
}

/** 이어 받은 마지막 sequence. 응답이 비면 그대로 */
export function advanceCursor(
  cursor: number,
  page: readonly ChatMessage[],
): number {
  return page.reduce((max, m) => Math.max(max, m.sequence), cursor);
}

/** 화면에 그린 가장 큰 sequence. 낭독 기준점에 쓴다 */
export function maxSequenceOf(messages: readonly ChatMessage[]): number {
  return messages.at(-1)?.sequence ?? 0;
}

/** 메시지 사이에 날짜가 바뀌는 자리마다 구분선을 끼운다. 첫 메시지 앞에도 하나 */
export function toThreadItems(messages: readonly ChatMessage[]): ThreadItem[] {
  const items: ThreadItem[] = [];
  let lastDate: string | null = null;
  for (const message of messages) {
    const date = seoulDateKey(message.sentAt);
    if (date !== lastDate) {
      items.push({
        type: "divider",
        key: `d-${date}`,
        label: formatDateDivider(message.sentAt),
      });
      lastDate = date;
    }
    items.push({ type: "message", key: `m-${message.sequence}`, message });
  }
  return items;
}

/**
 * 말풍선 모양 — **소매 시점**(§4-5 표). 내 것(RETAILER)이 오른쪽, 도매 TEXT가 왼쪽, 자동 답변
 * (AUTO_REPLY, CLARIFY)은 도매 이름으로 나간 답이라 **상대 쪽(왼쪽)**이다. 도매 화면에서는 자동 답이
 * 사장 자신의 쪽(오른쪽)이었다.
 *
 * 모르는 kind(나중에 생길 ORDER_LINK 같은 값)는 TEXT처럼 body만 — sender로 좌우를 가른다. 생성 타입이
 * enum이라 지금은 그런 값이 오지 않지만, 서버가 값을 늘리면 FE 배포 전에 먼저 온다(가이드 §9).
 */
export function bubbleKindOf(
  message: Pick<ChatMessage, "sender" | "kind">,
): BubbleKind {
  if (message.sender === "SYSTEM") return "system";
  if (message.sender === "RETAILER") return "me";
  switch (message.kind) {
    case "AUTO_REPLY":
    case "CLARIFY":
      return "auto";
    default:
      return "them";
  }
}

/**
 * 낭독기용 발신자 이름. 화면에는 안 보이고 말풍선 앞에 숨겨 둔다. 자동 답은 `무드온 자동 답변` —
 * 사장이 직접 쓴 답과 낭독으로도 구분된다(와이어프레임 `.sr`).
 */
export function senderLabel(
  message: Pick<ChatMessage, "sender" | "kind">,
  counterpartName: string,
): string {
  if (message.sender === "RETAILER") return ROOM_TEXT.me;
  if (message.sender === "SYSTEM") return ROOM_TEXT.system;
  return bubbleKindOf(message) === "auto"
    ? `${counterpartName}${ROOM_TEXT.autoReplySuffix}`
    : counterpartName;
}

/**
 * 사람 넘김 줄의 글. HANDOFF는 서버 body가 도매에게 하는 말("직접 답해 주세요")이라 소매 화면은
 * 고정 문구를 쓴다(디자인 결정 8). SYSTEM이 보낸 모르는 kind는 body 그대로.
 */
export function systemLineText(message: Pick<ChatMessage, "kind" | "body">) {
  return message.kind === "HANDOFF" ? ROOM_TEXT.handoff : message.body;
}

/** 자동 답변 말풍선 안 `10:22 조회`(checkedAt, 서울). 모든 자동 답에 조회 시각을 단다(D31①). 근거가 없으면 null */
export function autoReplySeen(
  message: Pick<ChatMessage, "autoReply">,
): string | null {
  if (message.autoReply === null) return null;
  return `${formatClock(message.autoReply.checkedAt)}${ROOM_TEXT.checkedSuffix}`;
}

/**
 * 말풍선의 와이어프레임 `data-ac`. 소매 AC ID로 새로 붙인다(§4-5 표). 기본 S5-5, 자동 답과 사람 넘김
 * S5-6, 방을 연 뒤 받은 도매 말풍선은 S6-7 S6-11, 보류 말풍선과 같은 키라 그것을 대신한 것은 S6-4.
 */
export function messageAc(
  message: Pick<
    ChatMessage,
    "sequence" | "clientMessageId" | "sender" | "kind"
  >,
  baseline: number,
  pendingIds: ReadonlySet<string>,
): string {
  const kind = bubbleKindOf(message);
  const ac = [kind === "auto" || kind === "system" ? "S5-6" : "S5-5"];
  if (message.sequence > baseline && message.sender === "WHOLESALER")
    ac.push("S6-7", "S6-11");
  if (
    message.clientMessageId !== null &&
    pendingIds.has(message.clientMessageId)
  )
    ac.push("S6-4");
  return ac.join(" ");
}

/* ------------------------------------------------------------------------
 * 보내기
 * ------------------------------------------------------------------------ */

/** 소매 화면의 숫자 표기. 도매 `shared/lib/format`의 `formatNumber`와 같은 꼴(소매엔 그 파일이 없다) */
function formatCount(value: number): string {
  return value.toLocaleString("ko-KR");
}

/** 서버와 같은 셈 — 앞뒤 공백을 빼고 코드 포인트로. 이모지 하나가 1자다. TODO(#285): 공용 후보(§8) */
export function bodyLength(text: string): number {
  return [...text.trim()].length;
}

/**
 * 입력창 판정(S6-3). 넘어도 **자르지 않는다** — 붙여 넣은 긴 글을 사장이 직접 줄이게 둔다.
 * 판정과 안내만 하고 보내기를 잠근다.
 */
export function checkComposer(text: string): ComposerCheck {
  const length = bodyLength(text);
  const over = length > BODY_MAX;
  const shown = `${formatCount(length)}/${formatCount(BODY_MAX)}`;
  return {
    length,
    blank: length === 0,
    over,
    counter: !over && length >= BODY_COUNTER_FROM ? shown : null,
    overMessage: over
      ? `${formatCount(BODY_MAX)}자까지 보낼 수 있어요 (${shown})`
      : null,
  };
}

/**
 * 보내기 실패를 화면 반응 셋으로. **`code`로만 가른다.** 서버까지 못 간 것(`NETWORK_ERROR`)은
 * 오프라인과 같은 안내다 — 사장이 할 일(연결 확인 뒤 다시 보내기)이 같다. 401 코드는 소매 어휘
 * (`UNAUTHORIZED`)다 — 도매는 `UNAUTHENTICATED`.
 */
export function sendFailureOf(error: unknown): SendFailure {
  if (isApiError(error)) {
    if (error.code === RETAIL_ERROR_CODE.UNAUTHORIZED) return "session";
    if (error.code === TRANSPORT_ERROR_CODE.NETWORK) return "offline";
  }
  return "server";
}

/** 실패 말풍선 아래 문구 */
export function failureText(failure: SendFailure | null): string {
  return failure === "offline" ? PENDING_TEXT.offline : PENDING_TEXT.failed;
}

/**
 * 보내기 응답을 방 캐시에 넣는다. **cursor는 그대로 둔다** — 내가 보낸 7번 앞에 도매의 6번이 같이
 * 커밋됐을 수 있다(`ChatThread` 주석). 다음 polling이 7번을 다시 가져와도 `mergeMessages`가 한 번만 남긴다.
 */
export function insertSent(
  thread: ChatThread,
  sent: readonly ChatMessage[],
): ChatThread {
  return { ...thread, messages: mergeMessages(thread.messages, sent) };
}

/**
 * 화면에 남길 보류 말풍선. 서버 메시지 중 같은 `clientMessageId`가 있으면 뺀다 — 응답은 유실됐는데
 * polling이 먼저 가져온 경우다(S6-4). 그러면 실패 말풍선 대신 서버 말풍선 하나만 남는다.
 */
export function visiblePending(
  pending: readonly PendingMessage[],
  messages: readonly ChatMessage[],
): PendingMessage[] {
  const delivered = new Set(
    messages.flatMap((m) =>
      m.clientMessageId === null ? [] : [m.clientMessageId],
    ),
  );
  return pending.filter((p) => !delivered.has(p.clientMessageId));
}

/** 같은 키의 보류 말풍선을 바꾼다. 없으면 맨 아래에 붙인다(다시 보내기는 제자리) */
export function upsertPending(
  pending: readonly PendingMessage[],
  next: PendingMessage,
): PendingMessage[] {
  const index = pending.findIndex(
    (p) => p.clientMessageId === next.clientMessageId,
  );
  if (index < 0) return [...pending, next];
  return pending.map((p, i) => (i === index ? next : p));
}
