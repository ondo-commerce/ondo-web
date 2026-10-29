import { isApiError, TRANSPORT_ERROR_CODE } from "@ondo/api";
import {
  BODY_COUNTER_FROM,
  BODY_MAX,
  CHAT_TIME_ZONE,
  CLARIFY_WINDOW_MS,
  ENTRY_TEXT,
  IDEMPOTENCY_KEY_REUSED,
  PENDING_TEXT,
  RETURN_PATH_PATTERN,
  ROOM_POLL_BACKOFF_MAX_MS,
  ROOM_POLL_JITTER,
  ROOM_POLL_MS,
  ROOM_TEXT,
  STOCK_BAND_LABEL,
  STOCK_TEXT,
  WEEKDAY_LABEL,
} from "./constants";
import type {
  BubbleKind,
  CardQtyCheck,
  ChatChoice,
  ChatInquiry,
  ChatMessage,
  ChatThread,
  ClarifyView,
  ComposerCheck,
  PendingMessage,
  ReturnLink,
  SendFailure,
  StockCardView,
  ThreadItem,
} from "./types";
import { RETAIL_ERROR_CODE } from "@/shared/api/errorCodes";
import { QTY_UNIT, SKU_ORDER_LIMIT, parseQty } from "@/shared/qty";

/*
 * 도매 `apps/wholesale/src/features/chat/derive.ts`와 짝이다(01-plan §4-6). 앱 사이 import가 금지라
 * 복제했다 — **같은 이름, 같은 테스트 케이스**를 쓰고, 한쪽 버그를 고치면 다른 쪽도 고친다.
 * 역할에 따라 답이 바뀌는 함수(`bubbleKindOf` `senderLabel` `messageAc` `liveAnnouncement`)만
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

/** `messageAc`가 말풍선 하나만 봐서는 모르는 방 상태(loop-05b 와이어프레임 상태별 data-ac) */
export interface MessageAcContext {
  /** 401 끊김 — 자동 답 말풍선 S8-8 */
  sessionLost: boolean;
  /** 바로 뒤에 사람 넘김 줄이 붙은 내 말(`handoffCauses`) — S8-10 */
  handoffCauses: ReadonlySet<number>;
  /** 옵션 칩으로 보낸 말이 못 보냄 상태(`choiceSendFailed`) — 되묻기 말풍선 S8-15 */
  choiceFailed: boolean;
}

const NO_AC_CONTEXT: MessageAcContext = {
  sessionLost: false,
  handoffCauses: new Set(),
  choiceFailed: false,
};

/**
 * 말풍선의 와이어프레임 `data-ac`. 소매 AC ID로 새로 붙인다(§4-5 표). 기본 S5-5, 자동 답과 사람 넘김
 * S5-6, 방을 연 뒤 받은 도매 말풍선은 S6-7 S6-11, 보류 말풍선과 같은 키라 그것을 대신한 것은 S6-4.
 * 05b 상태별 번호(넘김 S8-10, 401 S8-8, 칩 재시도 S8-15)는 `context`로 받는다(QA F4).
 */
export function messageAc(
  message: Pick<
    ChatMessage,
    "sequence" | "clientMessageId" | "sender" | "kind"
  >,
  baseline: number,
  pendingIds: ReadonlySet<string>,
  context: MessageAcContext = NO_AC_CONTEXT,
): string {
  const kind = bubbleKindOf(message);
  const ac = [kind === "auto" || kind === "system" ? "S5-6" : "S5-5"];
  // 05b 와이어프레임: 되묻기는 S8-3, 재고 답은 S8-4
  if (message.kind === "CLARIFY") ac.push("S8-3");
  if (message.kind === "AUTO_REPLY") ac.push("S8-4");
  if (message.kind === "AUTO_REPLY" && context.sessionLost) ac.push("S8-8");
  if (message.kind === "CLARIFY" && context.choiceFailed) ac.push("S8-15");
  if (message.kind === "HANDOFF" || context.handoffCauses.has(message.sequence))
    ac.push("S8-10");
  if (message.sequence > baseline && message.sender === "WHOLESALER")
    ac.push("S6-7", "S6-11");
  if (
    message.clientMessageId !== null &&
    pendingIds.has(message.clientMessageId)
  )
    ac.push("S6-4");
  return ac.join(" ");
}

/**
 * 사람 넘김 줄 바로 앞의 내 말 sequence들 — 넘김을 부른 문의다(와이어프레임 #state-handoff-nego, S8-10).
 * 서버는 내 말과 넘김 줄을 한 응답에 연달아 준다(sequence n, n+1). 사이에 다른 말이 끼면 잇지 않는다
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

/** 옵션 칩으로 보낸 말(문맥에 variant가 있다)인가 — 재시도 때 문맥을 지키는 대상(S8-15) */
function isChoiceSend(item: Pick<PendingMessage, "inquiry">): boolean {
  return item.inquiry?.intent === "STOCK" && item.inquiry.variantId !== null;
}

/** 옵션 칩으로 보낸 말 중 못 보낸 게 있나(S8-15 — 되묻기 말풍선과 그 실패 말풍선에 번호를 단다) */
export function choiceSendFailed(
  pending: readonly Pick<PendingMessage, "inquiry" | "status">[],
): boolean {
  return pending.some((p) => p.status === "failed" && isChoiceSend(p));
}

/** 보류 말풍선의 `data-ac`. 보내는 중 S6-1, 못 보냄 S6-4, 옵션 칩으로 보낸 걸 못 보냈으면 + S8-15 */
export function pendingAc(
  item: Pick<PendingMessage, "inquiry" | "status">,
): string {
  if (item.status === "sending") return "S6-1";
  return isChoiceSend(item) ? "S6-4 S8-15" : "S6-4";
}

/**
 * 낭독기 알림(S6-11) — **소매 시점**(§4-5 표). 방을 연 뒤(`baseline` 이후) 도착한 **도매 쪽** 메시지
 * (사람 답 TEXT, 자동 답 AUTO_REPLY, CLARIFY, 모르는 kind) 중 마지막 것만. 내가 보낸 말과 SYSTEM 줄은
 * 읽지 않는다. 첫 로딩 때는 null — 열자마자 50개를 읽어 주지 않는다. 도매 화면은 반대로 RETAILER만 읽었다.
 *
 * sequence를 같이 주는 이유(도매 QA F8): 같은 본문("네")이 연달아 오면 글자가 그대로라 live 영역에 변화가
 * 없고 낭독기가 두 번째를 안 읽는다. 그리는 쪽이 sequence를 key로 써서 매번 새 노드로 바꾼다.
 */
export function liveAnnouncement(
  messages: readonly ChatMessage[],
  baseline: number,
  counterpartName: string,
): { text: string; sequence: number } | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (message === undefined || message.sequence <= baseline) break;
    if (message.sender === "WHOLESALER")
      return {
        text: `${senderLabel(message, counterpartName)}: ${message.body}`,
        sequence: message.sequence,
      };
  }
  return null;
}

/* ------------------------------------------------------------------------
 * polling 간격
 * ------------------------------------------------------------------------ */

/**
 * 다음 polling까지 기다릴 시간(S6-8). 실패 0번이면 3초. n번 연속 실패면 3초 × 2^(n−1)에 ±20%를 섞는다
 * — 1번째 실패 뒤 3초, 2번째 6초, 3번째 12초, 4번째 24초. **흔들림을 섞은 뒤에도** 30초를 넘지 않는다
 * (도매 리뷰 F5). 성공 간격에는 흔들림을 섞지 않는다. `random`은 [0, 1) — 테스트가 경계값을 본다.
 * TODO(#285): 도메인 없는 backoff라 두 앱 공용 후보다(01-plan §8). 이번엔 복제한다.
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
    // 같은 키에 다른 본문 — 정상 흐름에선 안 온다. 500과 같이 다시 보내기, 지우기를 준다
    if (error.code === IDEMPOTENCY_KEY_REUSED) return "server";
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

/* ------------------------------------------------------------------------
 * 재고 자동 답(loop-05b S8) — 재고 문의 칩, 되묻기 칩, 재고 카드, 장바구니 담기
 * ------------------------------------------------------------------------ */

/**
 * 입력창 위 `재고 문의` 칩이 물을 상품(S8-1). 방이 상품 상세에서 열렸을 때(`?from=/products/{id}`)만.
 * 도매처 홈에서 왔거나 `from`이 없으면 null — 칩 줄 자체가 없다. 그때 자유 문장은 서버가 방 문맥(30분)으로
 * 판정한다(§4-2 6).
 */
export function askListingId(from: string | null): number | null {
  const back = returnPathOf(from);
  if (back?.kind !== "product") return null;
  return Number(back.href.slice(back.href.lastIndexOf("/") + 1));
}

/** `재고 문의` 칩의 문의 문맥. 옵션은 서버가 되묻는다(§4-1 1) */
export function stockAskInquiry(listingId: number): ChatInquiry {
  return {
    intent: "STOCK",
    listingId,
    variantId: null,
    backorderId: null,
    label: null,
  };
}

/** 옵션 칩 하나를 고른 문의 문맥. 본문은 칩 글자 그대로다(카카오 바로가기 응답과 같다, §4-1 5) */
export function choiceInquiry(
  listingId: number,
  choice: ChatChoice,
): ChatInquiry {
  return {
    intent: "STOCK",
    listingId,
    variantId: choice.variantId,
    backorderId: null,
    label: choice.label,
  };
}

/**
 * `재고 문의` 칩이 보내는 중인가(S8-2). 칩이 보낸 말풍선(옵션 없는 재고 문의)이 아직 응답 전이면 true.
 * 실패하면 다시 켠다 — 같은 질문을 또 물을 수 있다(결정 21). 칩 상태를 따로 두지 않고 보류 말풍선에서 읽는다
 */
export function askChipBusy(pending: readonly PendingMessage[]): boolean {
  return pending.some(
    (p) =>
      p.status === "sending" &&
      p.inquiry?.intent === "STOCK" &&
      p.inquiry.variantId === null,
  );
}

function choicesOf(message: Pick<ChatMessage, "autoReply">): ChatChoice[] {
  return message.autoReply?.choices ?? [];
}

/**
 * 되묻기 칩을 지금 고를 수 있나(§4-1 5, S8-16). 셋 다 맞아야 한다.
 * - 그 방의 **마지막** 되묻기다
 * - 그 뒤에 소매 메시지(보낸 것, 보내는 중, 못 보낸 것)도 도매 사람 답(TEXT와 모르는 kind)도 없다
 * - 되묻기가 온 지 30분 안이다(서버 계승 규칙과 같은 창)
 *
 * 못 보낸 말풍선(`pending`)도 막는 이유(결정 28): 고른 칩이 실패해도 줄은 고른 채 잠겨 있고 `다시 보내기`만
 * 같은 키로 보낸다. `지우기`로 보류 말풍선이 사라지면 30분 안일 때 다시 켜진다.
 * `now`는 부르는 쪽이 준다 — 이 함수는 시계를 읽지 않는다.
 */
export function choicesActive(
  messages: readonly ChatMessage[],
  pending: readonly PendingMessage[],
  sequence: number,
  now: number,
): boolean {
  const index = messages.findIndex((m) => m.sequence === sequence);
  const clarify = messages[index];
  if (clarify === undefined || clarify.kind !== "CLARIFY") return false;
  if (choicesOf(clarify).length === 0) return false;
  if (pending.length > 0) return false;
  for (const later of messages.slice(index + 1)) {
    if (later.kind === "CLARIFY") return false;
    if (later.sender === "RETAILER") return false;
    if (bubbleKindOf(later) === "them") return false;
  }
  return now - Date.parse(clarify.sentAt) <= CLARIFY_WINDOW_MS;
}

/**
 * 이 되묻기에 고른 옵션. 되묻기 바로 뒤의 첫 소매 메시지(서버에 간 것이 먼저, 없으면 보류 말풍선)가 보기 중
 * 하나를 골랐으면 그 variantId. 칩으로 골랐으면 `inquiry.variantId`, 칩 글자를 그대로 쳤으면 본문으로 안다.
 * 딴소리였거나 아직 아무것도 안 보냈으면 null(체크 없이 전부 잠김, 와이어프레임 `#state-chip-lock`).
 */
export function selectedChoice(
  messages: readonly ChatMessage[],
  pending: readonly PendingMessage[],
  sequence: number,
): number | null {
  const index = messages.findIndex((m) => m.sequence === sequence);
  const clarify = messages[index];
  if (clarify === undefined) return null;
  const choices = choicesOf(clarify);
  const answer =
    messages.slice(index + 1).find((m) => m.sender === "RETAILER") ??
    pending[0];
  if (answer === undefined) return null;
  // 칩으로 고른 것(variantId)이 먼저 — 본문은 사장이 칩 글자를 직접 친 경우에만 본다
  const picked =
    choices.find((c) => c.variantId === answer.inquiry?.variantId) ??
    choices.find((c) => c.label === answer.body.trim());
  return picked?.variantId ?? null;
}

/** 되묻기 말풍선의 칩 줄. 보기가 없는 되묻기(05a 시드, 상품을 못 찾은 것)는 null — 칩 없이 본문만 */
export function toClarifyView(
  message: ChatMessage,
  messages: readonly ChatMessage[],
  pending: readonly PendingMessage[],
  now: number,
): ClarifyView | null {
  if (message.kind !== "CLARIFY") return null;
  const choices = choicesOf(message);
  const listingId = message.autoReply?.subject.listingId ?? null;
  if (choices.length === 0 || listingId === null) return null;
  return {
    listingId,
    choices,
    active: choicesActive(messages, pending, message.sequence, now),
    selectedVariantId: selectedChoice(messages, pending, message.sequence),
  };
}

/**
 * 카드 머리의 옵션 이름 `레드 / M`. 서버 `subject.label`은 `빈티지 플라워 셔츠 레드 / M`(상품명 + 옵션)이라
 * 그대로 쓰면 카드 한 줄이 길어진다(결정 19). 같은 방의 되묻기 보기에 이 variant가 있으면 그 글자를 쓰고,
 * 없으면(되묻기 없이 바로 답한 "레드 L 몇 장") label 끝의 `색 / 사이즈` 조각을 쓴다. 그것도 없으면 label 전체.
 */
function optionNameOf(
  variantId: number,
  label: string | null,
  messages: readonly ChatMessage[],
): string {
  for (const m of messages) {
    const hit = choicesOf(m).find((c) => c.variantId === variantId);
    if (hit !== undefined) return hit.label;
  }
  const tail = /(\S+ \/ \S+)$/.exec(label ?? "");
  return tail?.[1] ?? label ?? "";
}

/**
 * 재고 자동 답의 카드 칸(S8-4, S8-9). 재고 답이 아니거나 대상 옵션이 없으면 null — 본문만 그린다.
 * 소매 `facts.stock`에는 정확 수량이 없다(D31②). 지난 카드도 담기를 막지 않는다 — 장바구니 쪽이 다시 본다(§4-1 6).
 */
export function toStockCardView(
  message: ChatMessage,
  messages: readonly ChatMessage[],
): StockCardView | null {
  if (message.kind !== "AUTO_REPLY") return null;
  const reply = message.autoReply;
  if (reply === null || reply.intent !== "STOCK") return null;
  const stock = reply.facts.stock;
  const variantId = reply.subject.variantId;
  if (stock === null || variantId === null) return null;
  return {
    variantId,
    optionName: optionNameOf(variantId, reply.subject.label, messages),
    band: stock.band,
    bandLabel: STOCK_BAND_LABEL[stock.band],
    orderable: stock.orderable,
    orderLimit: stock.orderLimit,
    addable: stock.band !== "NONE" && stock.orderable,
  };
}

/**
 * 카드 한 줄을 조각으로(결정 19). 굵게는 옵션 이름과 값만. 재고 없음이면 `레드 / L 재고 없음`으로 끝난다(결정 27).
 * 한도가 없거나 주문할 수 없으면 한도 조각을 뺀다.
 */
export function stockCardLine(
  card: StockCardView,
): { text: string; strong: boolean }[] {
  if (card.band === "NONE")
    return [
      { text: card.optionName, strong: true },
      { text: ` ${card.bandLabel}`, strong: false },
    ];
  const parts = [
    { text: card.optionName, strong: true },
    { text: STOCK_TEXT.stock, strong: false },
    { text: card.bandLabel, strong: true },
  ];
  parts.push({
    text: `, ${card.orderable ? STOCK_TEXT.orderable : STOCK_TEXT.notOrderable}`,
    strong: false,
  });
  if (card.orderable && card.orderLimit !== null) {
    parts.push(
      { text: `, ${STOCK_TEXT.limitPrefix}`, strong: false },
      { text: `${formatCount(card.orderLimit)}${QTY_UNIT}`, strong: true },
    );
  }
  return parts;
}

/** 카드가 담을 수 있는 상한. 한도 없음(null, 0)이면 SKU 상한 500 — 한도가 그보다 커도 500을 넘지 않는다 */
function cardLimit(orderLimit: number | null): number {
  if (orderLimit === null || orderLimit <= 0) return SKU_ORDER_LIMIT;
  return Math.min(orderLimit, SKU_ORDER_LIMIT);
}

/**
 * 카드 수량 칸 판정(S8-6, 결정 26). **친 글자를 고치지 않는다** — 상품 상세처럼 501을 500으로 맞추면
 * 사장은 501장을 담았다고 믿는다. 못 받는 값이면 `qty: null`과 이유 한 줄, 담기 잠김.
 * 숫자 판정은 `parseQty` 하나다(부호, 소수점, 전각, 지수 표기를 막는 정규식이 거기 있다).
 */
export function checkCardQty(
  text: string,
  orderLimit: number | null,
): CardQtyCheck {
  const { issue } = parseQty(text);
  if (issue === "NOT_A_NUMBER")
    return { qty: null, reason: STOCK_TEXT.qtyNotNumber };
  const trimmed = text.trim();
  const value = trimmed === "" ? 0 : Number(trimmed);
  if (value < 1) return { qty: null, reason: STOCK_TEXT.qtyMin };
  const limit = cardLimit(orderLimit);
  if (value > limit)
    return {
      qty: null,
      reason: `한 번에 ${formatCount(limit)}${QTY_UNIT}까지 담을 수 있어요`,
    };
  return { qty: value, reason: null };
}

/** 담기 성공 한 줄. 같은 SKU를 또 담아 서버 합계가 1보다 크면 `(지금 N장)`을 붙인다(S8-5) */
export function cardAddedText(qty: number): string {
  return qty > 1
    ? `${STOCK_TEXT.added}(지금 ${formatCount(qty)}${QTY_UNIT})`
    : STOCK_TEXT.added;
}

/**
 * 담기 실패를 화면 반응으로(§4-1 7). 401은 여기 오지 않는다 — 부르는 쪽이 `guardSession`으로 방 끊김으로
 * 바꿨다. 403은 승인 대기 화면, 400은 서버가 준 말 그대로(지어내지 않는다, 결정 25), 그 밖(500, 연결 실패)은
 * "다시 눌러 주세요".
 */
export function cartAddFailureOf(
  error: unknown,
): "approval" | { message: string } {
  if (isApiError(error)) {
    if (error.code === RETAIL_ERROR_CODE.ACCOUNT_NOT_APPROVED)
      return "approval";
    if (error.status === 400) {
      const message = error.fieldErrors[0]?.message ?? error.message;
      return { message: message === "" ? STOCK_TEXT.addFailed : message };
    }
  }
  return { message: STOCK_TEXT.addFailed };
}
