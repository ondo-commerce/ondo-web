import { isApiError, TRANSPORT_ERROR_CODE } from "@ondo/api";
import {
  BODY_COUNTER_FROM,
  BODY_MAX,
  CHAT_TIME_ZONE,
  HANDOFF_REASON_TEXT,
  PENDING_TEXT,
  ROOM_POLL_BACKOFF_MAX_MS,
  ROOM_POLL_JITTER,
  ROOM_POLL_MS,
  ROOM_TEXT,
  STOCK_BAND_LABEL,
  UNREAD_MAX_SHOWN,
  WEEKDAY_LABEL,
} from "./constants";
import type {
  AutoReplyNote,
  AutoReplySettings,
  BubbleKind,
  ChatAutoReply,
  ChatHandoffReason,
  ChatMessage,
  ChatReadResult,
  ChatRoomPage,
  ChatRoomRowView,
  ChatRoomSummary,
  ChatThread,
  ClarifyChoicesView,
  ComposerCheck,
  FactLine,
  FactPart,
  FactsView,
  PendingMessage,
  ReadMarks,
  SendFailure,
  ThreadItem,
} from "./types";
import { WHOLESALE_ERROR_CODE } from "@/shared/api/errorCodes";
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

/**
 * 근거 칸 조회 시각(#302 S3-5, 디자인 결정 43). `checkedAt`의 서울 날짜가 오늘이면 `14:20 조회`, 아니면
 * `10/28 14:20 조회`(M/D, 앞 0 없음). 다음 날 같은 방을 열면 "14:20"이 오늘 값처럼 보여서 날짜를 붙인다(기획 Q4).
 * 해가 달라도 `M/D`만 쓴다 — 소매 `checkedLabel`과 같은 규칙(앱끼리 복제, 한쪽을 바꾸면 다른 쪽도).
 */
export function checkedLabel(checkedAt: string, nowMs: number): string {
  const time = `${formatClock(checkedAt)}${ROOM_TEXT.checkedSuffix}`;
  if (seoulDateKey(checkedAt) === seoulDateKey(new Date(nowMs).toISOString()))
    return time;
  const p = seoulParts(Date.parse(checkedAt));
  return `${p.month}/${p.day} ${time}`;
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
 * 되묻기 보기 줄(#296 S13-1 디자인 결정 37, #299 S4-1 디자인 결정 38). 소매에게 나간 보기를 사장이 글자로 본다 —
 * 도매에선 누를 수 없다. choices가 없거나 null이거나 비면 줄 자체가 없다. 순서는 서버 순서 그대로.
 *
 * "(주문 불가)"는 **kind VARIANT + `orderable: false`**만 붙인다(색, 취소선 없음). 미송 보기와 `다른 주문이에요`
 * 보기도 계약상 orderable 칸이 있지만(NOT_LISTED는 늘 false) 주문 가능 여부를 뜻하지 않는다 — 읽으면
 * 사장이 "주문 불가 미송"으로 잘못 읽는다. kind가 없으면 VARIANT(계약 `?? VARIANT`, 05b 서버 그대로).
 *
 * 미송 보기가 하나라도 있으면 목록 모양(`list`)이다. 재고 보기만이면 05b-2 그대로 한 줄.
 */
export function toClarifyChoicesView(
  autoReply: ChatAutoReply | null,
): ClarifyChoicesView | null {
  const choices = autoReply?.choices ?? [];
  if (choices.length === 0) return null;
  const labels = choices.map((c) =>
    (c.kind ?? "VARIANT") === "VARIANT" && !c.orderable
      ? `${c.label}${ROOM_TEXT.choiceNotOrderable}`
      : c.label,
  );
  if (choices.some((c) => (c.kind ?? "VARIANT") !== "VARIANT"))
    return { mode: "list", items: labels };
  return {
    mode: "inline",
    text: `${ROOM_TEXT.choicesPrefix}${labels.join(", ")}`,
  };
}

/**
 * 자동 답변 근거 칸. 도매 화면에만 정확 수량이 있다 — 사장이 소매처가 본 구간과 실제 값을 같이 본다.
 * 재고 외(미송, 미수)는 이번 회차 시드에만 있고 문안이 정해지지 않아 값만 한 줄로 적는다.
 *
 * 끝 줄은 **모든** 자동 답에 "HH:mm 조회"다(F12, S7-13). 되묻기처럼 값이 없어도 언제 본 값으로 답했는지는
 * 남긴다. 시각은 말풍선 시각이 아니라 `checkedAt` — 같은 키로 다시 받아도 처음 조회 시각 그대로다(S7-10).
 * 오늘이 아니면 날짜가 붙는다(`checkedLabel`, #302 S3-5). `nowMs`는 방이 polling 응답마다 갱신하는 시각이다.
 */
export function toFactsView(
  autoReply: ChatAutoReply | null,
  nowMs: number,
): FactsView | null {
  if (autoReply === null) return null;
  const { stock, backorder, receivable } = autoReply.facts;
  const lines: FactLine[] = [];
  const checked = checkedLabel(autoReply.checkedAt, nowMs);
  let seen = checked;
  // 값 조각은 굵게(와이어프레임 `.facts b`, QA F11). 사장이 숫자부터 읽는다
  const value = (text: string): FactPart => ({ text, strong: true });
  const label = (text: string): FactPart => ({ text, strong: false });
  if (stock !== null) {
    const available = [
      label("판매가능 "),
      value(`${formatNumber(stock.availableQty)}장`),
    ];
    lines.push(
      stock.orderLimit === null
        ? available
        : [
            ...available,
            label(", 주문 한도 "),
            value(`${formatNumber(stock.orderLimit)}장`),
          ],
    );
    seen = `소매처에게는 "${STOCK_BAND_LABEL[stock.band]}"으로 보였어요. ${checked}`;
  }
  if (backorder !== null) {
    const qty = [label("미송 "), value(`${formatNumber(backorder.qty)}장`)];
    lines.push(
      backorder.expectedInboundDate === null
        ? [...qty, label(", 입고일 미정")]
        : [...qty, label(", 입고 예정 "), value(backorder.expectedInboundDate)],
    );
  }
  if (receivable !== null) {
    lines.push([
      label("미결제 "),
      value(`${formatNumber(receivable.outstandingAmount)}원`),
      label(", 선수금 "),
      value(`${formatNumber(receivable.prepaidAmount)}원`),
    ]);
    const { count, amount, maxDaysOverdue } = receivable.overdue;
    lines.push(
      count === 0
        ? [label("연체 없음")]
        : [
            label("연체 "),
            value(`${count}건 ${formatNumber(amount)}원`),
            label(` (최대 ${maxDaysOverdue}일)`),
          ],
    );
  }
  return { lines, seen };
}

/**
 * 넘김 이유 한 줄 글(#302 S3-1). 이번 회차 8개 이유만 글이 있고, 그 밖 값(이번 회차 밖, 서버가 새로 늘린 값)과
 * 이유 없음은 null — 이유 줄을 그리지 않는다(디자인 결정 42). 인자가 `string`인 이유: 서버 enum은 FE 배포보다
 * 먼저 늘어난다(가이드 §9). 생성 타입 밖 값도 여기서 걸러진다.
 */
export function handoffReasonText(
  reason: string | null | undefined,
): string | null {
  if (reason === null || reason === undefined) return null;
  if (!Object.hasOwn(HANDOFF_REASON_TEXT, reason)) return null;
  return HANDOFF_REASON_TEXT[reason as ChatHandoffReason] ?? null;
}

/**
 * 시스템 줄 아래 이유 글. HANDOFF 줄만 — 계약상 `handoff`는 HANDOFF면 늘 값, 그 밖 kind면 null이지만
 * 다른 kind에 값이 실려 와도 넘김 줄이 아니면 이유를 달지 않는다. 칸이 없으면(옛 서버, `?? null`) 이유 없음.
 */
export function handoffReasonOf(
  message: Pick<ChatMessage, "kind" | "handoff">,
): string | null {
  if (message.kind !== "HANDOFF") return null;
  return handoffReasonText(message.handoff?.reason);
}

/**
 * 스위치를 눌렀을 때 PUT 본문. `intents`는 받은 값 그대로 돌려보낸다 — 화면은 전체 스위치 하나지만 계약은
 * 의도별 칸이라(Q6), 여기서 기본값으로 덮으면 다른 곳에서 끈 의도가 다시 켜진다.
 */
export function toggledSettings(
  settings: AutoReplySettings,
  enabled: boolean,
): AutoReplySettings {
  return { enabled, intents: { ...settings.intents } };
}

/**
 * 목록 머리 아래 한 줄. 실패가 꺼짐 안내보다 먼저다 — 실패면 스위치가 원래 값으로 돌아와 있어서
 * 꺼짐 안내가 같이 뜨면 "꺼졌다"와 "못 바꿨다"가 함께 보인다. 설정을 아직 모르면 아무것도 없다.
 */
export function autoReplyNoteOf(
  settings: AutoReplySettings | undefined,
  failed: boolean,
): AutoReplyNote {
  if (failed) return "failed";
  if (settings === undefined) return null;
  return settings.enabled ? null : "off";
}

/** 근거 한 줄을 글자로. 테스트와 낭독용 */
export function factLineText(line: FactLine): string {
  return line.map((part) => part.text).join("");
}

/**
 * 낭독기 알림(S3-8). 방을 연 뒤(`baseline` 이후) 도착한 **소매처** 메시지 중 마지막 것만.
 * 첫 로딩 때는 null — 열자마자 50개를 읽어 주지 않는다. 내가 보낸 말, 자동 답변도 읽지 않는다.
 *
 * sequence를 같이 주는 이유(QA F8): 같은 본문("네")이 연달아 오면 글자가 그대로라 live 영역에 변화가 없고
 * 낭독기가 두 번째를 안 읽는다. 그리는 쪽이 sequence를 key로 써서 매번 새 노드로 바꾼다.
 */
export function liveAnnouncement(
  messages: readonly ChatMessage[],
  baseline: number,
  counterpartName: string,
): { text: string; sequence: number } | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (message === undefined || message.sequence <= baseline) break;
    if (message.sender === "RETAILER")
      return {
        text: `${counterpartName}: ${message.body}`,
        sequence: message.sequence,
      };
  }
  return null;
}

/* ------------------------------------------------------------------------
 * polling 간격
 * ------------------------------------------------------------------------ */

/**
 * 다음 polling까지 기다릴 시간(S3-6). 실패 0번이면 3초. n번 연속 실패면 3초 × 2^(n−1)에 ±20%를 섞는다
 * — 1번째 실패 뒤 3초, 2번째 6초, 3번째 12초. **흔들림을 섞은 뒤에도** 30초를 넘지 않는다(기획 §4-1,
 * 리뷰 F5) — 서버가 살아난 뒤 사장이 30초 넘게 새 말을 못 보는 일이 없게.
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
  return Math.min(Math.round(base * jitter), ROOM_POLL_BACKOFF_MAX_MS);
}

/* ------------------------------------------------------------------------
 * 보내기 (#265)
 * ------------------------------------------------------------------------ */

/** 서버와 같은 셈 — 앞뒤 공백을 빼고 코드 포인트로. 이모지 하나가 1자다 */
export function bodyLength(text: string): number {
  return [...text.trim()].length;
}

/**
 * 입력창 판정(S4-4). 넘어도 **자르지 않는다** — 붙여 넣은 긴 글을 사장이 직접 줄이게 둔다.
 * 판정과 안내만 하고 보내기를 잠근다.
 */
export function checkComposer(text: string): ComposerCheck {
  const length = bodyLength(text);
  const over = length > BODY_MAX;
  const shown = `${formatNumber(length)}/${formatNumber(BODY_MAX)}`;
  return {
    length,
    blank: length === 0,
    over,
    counter: !over && length >= BODY_COUNTER_FROM ? shown : null,
    overMessage: over
      ? `${formatNumber(BODY_MAX)}자까지 보낼 수 있어요 (${shown})`
      : null,
  };
}

/**
 * 보내기 실패를 화면 반응 셋으로. **`code`로만 가른다.** 서버까지 못 간 것(`NETWORK_ERROR`)은
 * 오프라인과 같은 안내다 — 사장이 할 일(연결 확인 뒤 다시 보내기)이 같다.
 */
export function sendFailureOf(error: unknown): SendFailure {
  if (isApiError(error)) {
    if (error.code === WHOLESALE_ERROR_CODE.UNAUTHENTICATED) return "session";
    if (error.code === TRANSPORT_ERROR_CODE.NETWORK) return "offline";
  }
  return "server";
}

/** 실패 말풍선 아래 문구 */
export function failureText(failure: SendFailure | null): string {
  return failure === "offline" ? PENDING_TEXT.offline : PENDING_TEXT.failed;
}

/**
 * 보내기 응답을 방 캐시에 넣는다. **cursor는 그대로 둔다** — 내가 보낸 7번 앞에 소매처의 6번이 같이
 * 커밋됐을 수 있다. cursor를 7로 올리면 다음 polling이 6번을 건너뛴다(`ChatThread` 주석).
 * 다음 polling이 7번을 다시 가져와도 `mergeMessages`가 한 번만 남긴다.
 */
export function insertSent(
  thread: ChatThread,
  sent: readonly ChatMessage[],
): ChatThread {
  return { ...thread, messages: mergeMessages(thread.messages, sent) };
}

/**
 * 말풍선의 와이어프레임 `data-ac`(QA F7). 기본 S3-1, 방을 연 뒤 polling으로 붙었으면 S3-3 S3-4,
 * 보류 말풍선과 같은 키라 그것을 대신한 것(응답 유실 뒤 합쳐진 것)이면 S4-6.
 * 넘김 줄과 그 바로 앞 소매 문의는 S9-3(와이어프레임 `#state-autoreply-off-flow`, QA F4). 넘김이 꺼짐 때문인지
 * 메시지만으로는 모른다 — 넘김 줄이면 다 단다.
 */
export function messageAc(
  message: Pick<ChatMessage, "sequence" | "clientMessageId" | "kind">,
  baseline: number,
  pendingIds: ReadonlySet<string>,
  handoffCauseIds: ReadonlySet<number> = new Set(),
): string {
  const ac = ["S3-1"];
  if (message.sequence > baseline) ac.push("S3-3", "S3-4");
  if (
    message.clientMessageId !== null &&
    pendingIds.has(message.clientMessageId)
  )
    ac.push("S4-6");
  if (message.kind === "HANDOFF" || handoffCauseIds.has(message.sequence))
    ac.push("S9-3");
  return ac.join(" ");
}

/**
 * 넘김 줄 바로 앞의 소매 말 sequence들 — 넘김을 부른 문의다(S9-3). 서버는 소매 말과 넘김 줄을 연달아
 * 붙인다(n, n+1). 사이에 다른 말이 끼면 잇지 않는다. 소매 앱의 같은 이름 함수와 같은 규칙(앱끼리 복제)
 */
export function handoffCauses(
  messages: readonly Pick<ChatMessage, "sequence" | "sender" | "kind">[],
): Set<number> {
  const causes = new Set<number>();
  const sorted = [...messages].sort((a, b) => a.sequence - b.sequence);
  sorted.forEach((message, i) => {
    const prev = sorted[i - 1];
    if (message.kind === "HANDOFF" && prev?.sender === "RETAILER")
      causes.add(prev.sequence);
  });
  return causes;
}

/**
 * 화면에 남길 보류 말풍선(S4-6). 서버 메시지 중 같은 `clientMessageId`가 있으면 뺀다 — 응답은 유실됐는데
 * polling이 먼저 가져온 경우다. 그러면 실패 말풍선 대신 서버 말풍선 하나만 남는다.
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
