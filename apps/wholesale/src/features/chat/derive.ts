import {
  CHAT_TIME_ZONE,
  ROOM_POLL_BACKOFF_MAX_MS,
  ROOM_POLL_JITTER,
  ROOM_POLL_MS,
  ROOM_TEXT,
  STOCK_BAND_LABEL,
  UNREAD_MAX_SHOWN,
  WEEKDAY_LABEL,
} from "./constants";
import type {
  BubbleKind,
  ChatAutoReply,
  ChatMessage,
  ChatReadResult,
  ChatRoomPage,
  ChatRoomRowView,
  ChatRoomSummary,
  FactsView,
  ReadMarks,
  ThreadItem,
} from "./types";
import { formatNumber } from "@/shared/lib/format";

/* ------------------------------------------------------------------------
 * 시각 — 서버는 UTC 오프셋이 붙은 ISO를 주고, 화면은 전부 서울 시각으로 읽는다.
 * 브라우저 시간대에 기대지 않는다(해외 출장 중인 사장 노트북도 서울 시각이어야 한다).
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

/**
 * 목록 행 시각. 오늘이면 `HH:mm`, 올해면 `M/D`, 그 전이면 `YY.M.D`(서울 기준 달력).
 * `nowMs`를 받는 이유: 오늘이 언제인지는 화면이 정한다 — 함수 안에서 시계를 읽으면 테스트가 날짜에 묶인다.
 */
export function formatListTime(iso: string, nowMs: number): string {
  const at = seoulParts(Date.parse(iso));
  const now = seoulParts(nowMs);
  if (at.year === now.year && at.month === now.month && at.day === now.day) {
    return `${pad2(at.hour)}:${pad2(at.minute)}`;
  }
  if (at.year === now.year) return `${at.month}/${at.day}`;
  return `${String(at.year % 100).padStart(2, "0")}.${at.month}.${at.day}`;
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
 * 목록
 * ------------------------------------------------------------------------ */

/** 안 읽은 수 배지 글자. 0이면 배지를 그리지 않는다(null) */
export function formatUnread(count: number): string | null {
  if (count <= 0) return null;
  return count > UNREAD_MAX_SHOWN ? `${UNREAD_MAX_SHOWN}+` : String(count);
}

/**
 * 읽음 응답이 목록 응답보다 새로우면 그것을 쓴다(S3-7).
 *
 * 왜 필요한가: 방을 열어 읽음을 보낸 **직후**, 그 전에 떠난 목록 요청이 늦게 돌아오면 그 응답은
 * 읽기 전 값(`myLastReadSequence` 작음, `unreadCount` 큼)을 들고 온다. 그대로 그리면 사라진 배지가
 * 되살아난다. 읽음 위치는 올라가기만 하므로 더 큰 쪽이 새 값이다.
 *
 * 같으면 목록 쪽을 쓴다 — 같은 위치를 본 뒤 더 늦게 계산된 값이라 그 사이 온 메시지가 반영돼 있다.
 */
export function applyReadMark(
  room: ChatRoomSummary,
  mark: ChatReadResult | undefined,
): ChatRoomSummary {
  if (mark === undefined || mark.lastReadSequence <= room.myLastReadSequence)
    return room;
  return {
    ...room,
    myLastReadSequence: mark.lastReadSequence,
    unreadCount: mark.unreadCount,
  };
}

/** 읽음 응답을 쌓는다. 방마다 더 큰 위치만 남긴다 — 늦게 온 읽음 응답이 값을 내리지 못하게 */
export function mergeReadMark(
  marks: ReadMarks,
  result: ChatReadResult,
): ReadMarks {
  const known = marks[result.roomId];
  if (known !== undefined && known.lastReadSequence > result.lastReadSequence)
    return marks;
  return { ...marks, [result.roomId]: result };
}

export function toRoomRowView(
  room: ChatRoomSummary,
  nowMs: number,
): ChatRoomRowView {
  return {
    roomId: room.roomId,
    name: room.counterpart.name,
    preview: room.lastMessage?.preview ?? "",
    time: formatListTime(room.lastActivityAt, nowMs),
    unreadLabel: formatUnread(room.unreadCount),
    unreadCount: room.unreadCount,
    needsReply: room.needsReply,
  };
}

/**
 * 받은 페이지들을 한 줄로. **roomId가 겹치면 앞 페이지 것만 남긴다** — 이어 받는 사이 어떤 방에
 * 새 말이 와서 맨 위로 올라가면, 다시 받은 1페이지와 이미 받은 2페이지에 같은 방이 있을 수 있다.
 * 앞쪽이 더 최근에 정렬된 값이다.
 */
export function toRoomRows(
  pages: readonly ChatRoomPage[],
  marks: ReadMarks,
  nowMs: number,
): ChatRoomRowView[] {
  const seen = new Set<number>();
  const rows: ChatRoomRowView[] = [];
  for (const page of pages) {
    for (const room of page.data) {
      if (seen.has(room.roomId)) continue;
      seen.add(room.roomId);
      rows.push(toRoomRowView(applyReadMark(room, marks[room.roomId]), nowMs));
    }
  }
  return rows;
}

/**
 * `?room=` 값. 양의 정수만 방 번호다. 없으면 `null`(방 미선택), 형식이 틀리면 `"invalid"` —
 * 서버에 묻지 않고 바로 "대화를 찾을 수 없어요"로 간다.
 */
export function parseRoomParam(raw: string | null): number | null | "invalid" {
  if (raw === null || raw === "") return null;
  if (!/^\d+$/.test(raw)) return "invalid";
  const id = Number(raw);
  return Number.isSafeInteger(id) && id > 0 ? id : "invalid";
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

/** 화면에 그린 가장 큰 sequence. 읽음 요청에 쓴다 */
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
 * 말풍선 모양. 모르는 kind(나중에 생길 ORDER_LINK 같은 값)는 TEXT처럼 body만 — sender로 좌우를 가른다.
 * 생성 타입이 enum이라 지금은 그런 값이 오지 않지만, 서버가 값을 늘리면 FE 배포 전에 먼저 온다(가이드 §9).
 */
export function bubbleKindOf(
  message: Pick<ChatMessage, "sender" | "kind">,
): BubbleKind {
  if (message.sender === "SYSTEM") return "system";
  if (message.sender === "RETAILER") return "them";
  switch (message.kind) {
    case "AUTO_REPLY":
      return "auto";
    case "CLARIFY":
      return "clarify";
    default:
      return "me";
  }
}

/** 낭독기용 발신자 이름. 화면에는 안 보이고 말풍선 앞에 숨겨 둔다 */
export function senderLabel(
  message: Pick<ChatMessage, "sender">,
  counterpartName: string,
): string {
  if (message.sender === "RETAILER") return counterpartName;
  if (message.sender === "SYSTEM") return ROOM_TEXT.system;
  return ROOM_TEXT.me;
}

/**
 * 자동 답변 근거 칸. 도매 화면에만 정확 수량이 있다 — 사장이 소매처가 본 구간과 실제 값을 같이 본다.
 * 재고 외(미송, 미수)는 이번 회차 시드에만 있고 문안이 정해지지 않아 값만 한 줄로 적는다.
 */
export function toFactsView(autoReply: ChatAutoReply | null): FactsView | null {
  if (autoReply === null) return null;
  const { stock, backorder, receivable } = autoReply.facts;
  const lines: string[] = [];
  let seen: string | null = null;
  if (stock !== null) {
    lines.push(
      stock.orderLimit === null
        ? `판매가능 ${formatNumber(stock.availableQty)}장`
        : `판매가능 ${formatNumber(stock.availableQty)}장, 주문 한도 ${formatNumber(stock.orderLimit)}장`,
    );
    seen = `소매처에게는 "${STOCK_BAND_LABEL[stock.band]}"으로 보였어요. ${formatClock(autoReply.checkedAt)} 조회`;
  }
  if (backorder !== null) {
    lines.push(
      backorder.expectedInboundDate === null
        ? `미송 ${formatNumber(backorder.qty)}장, 입고일 미정`
        : `미송 ${formatNumber(backorder.qty)}장, 입고 예정 ${backorder.expectedInboundDate}`,
    );
  }
  if (receivable !== null) {
    lines.push(
      `미결제 ${formatNumber(receivable.outstandingAmount)}원, 선수금 ${formatNumber(receivable.prepaidAmount)}원`,
    );
    lines.push(
      receivable.overdue.count === 0
        ? "연체 없음"
        : `연체 ${receivable.overdue.count}건 ${formatNumber(receivable.overdue.amount)}원 (최대 ${receivable.overdue.maxDaysOverdue}일)`,
    );
  }
  return lines.length === 0 ? null : { lines, seen };
}

/**
 * 낭독기 알림 한 줄(S3-8). 방을 연 뒤(`baseline` 이후) 도착한 **소매처** 메시지 중 마지막 것만.
 * 첫 로딩 때는 빈 글자 — 열자마자 50개를 읽어 주지 않는다. 내가 보낸 말, 자동 답변도 읽지 않는다.
 */
export function liveAnnouncement(
  messages: readonly ChatMessage[],
  baseline: number,
  counterpartName: string,
): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (message === undefined || message.sequence <= baseline) break;
    if (message.sender === "RETAILER")
      return `${counterpartName}: ${message.body}`;
  }
  return "";
}

/* ------------------------------------------------------------------------
 * polling 간격
 * ------------------------------------------------------------------------ */

/**
 * 다음 polling까지 기다릴 시간(S3-6). 실패 0번이면 3초. n번 연속 실패면 3초 × 2^(n−1)에 ±20%를 섞고
 * 60초에서 멈춘다 — 1번째 실패 뒤 3초, 2번째 6초, 3번째 12초.
 *
 * 성공 간격에는 흔들림을 섞지 않는다. 평소엔 탭마다 여는 시각이 달라 저절로 흩어지고, 몰림은
 * 서버가 같이 아팠다가 같이 살아날 때 생긴다.
 *
 * `random`은 [0, 1). 받는 이유: 테스트가 경계값(−20%, +20%)을 정확히 볼 수 있게.
 */
export function pollDelayMs(failures: number, random: number): number {
  if (failures <= 0) return ROOM_POLL_MS;
  const base = Math.min(
    ROOM_POLL_MS * 2 ** (failures - 1),
    ROOM_POLL_BACKOFF_MAX_MS,
  );
  const jitter = 1 + (random * 2 - 1) * ROOM_POLL_JITTER;
  return Math.round(base * jitter);
}
