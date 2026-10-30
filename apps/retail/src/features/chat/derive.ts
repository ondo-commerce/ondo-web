import { isApiError, TRANSPORT_ERROR_CODE } from "@ondo/api";
import {
  BACKORDER_TEXT,
  BADGE_MAX,
  BODY_COUNTER_FROM,
  BODY_MAX,
  CHAT_TIME_ZONE,
  CHATS_HREF,
  CLARIFY_WINDOW_MS,
  ENTRY_TEXT,
  HEADER_BACKOFF_MS,
  HEADER_POLL_MS,
  IDEMPOTENCY_KEY_REUSED,
  LIST_TEXT,
  NAV_TEXT,
  PENDING_TEXT,
  RECEIVABLE_TEXT,
  RETURN_PATH_PATTERN,
  ROOM_POLL_BACKOFF_MAX_MS,
  ROOM_POLL_JITTER,
  ROOM_POLL_MS,
  ROOM_TEXT,
  SETTLEMENTS_HREF,
  STOCK_BAND_LABEL,
  STOCK_TEXT,
  WEEKDAY_LABEL,
} from "./constants";
import type {
  BackorderCardView,
  BadgeView,
  BubbleKind,
  CardQtyCheck,
  ChatChoice,
  ChatInquiry,
  ChatMessage,
  ChatReadResult,
  ChatRoomRowView,
  ChatRoomSummary,
  ChatThread,
  ClarifyView,
  ComposerCheck,
  HeaderCounts,
  PendingMessage,
  ReadState,
  ReceivableCardView,
  ReturnLink,
  SendFailure,
  StockCardView,
  TextPart,
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
  if (RETURN_PATH_PATTERN.chats.test(path))
    return { href: path, kind: "chats" };
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
 * 도매처 홈으로, `/chats`면 채팅 목록으로(loop-06 S2-4). 없거나 다른 값(`https://x.test`, `//x.test`,
 * `/chats?x=1`)은 버리고 상대 도매처 홈.
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

/**
 * 조회 시각 글자(loop-07 Q4, 디자인 결정 45). `checkedAt`의 서울 날짜가 오늘이면 `14:20 조회`, 아니면
 * `10/28 14:20 조회`(M/D, 앞 0 없음). 다음 날 같은 방을 열면 "14:20"이 오늘 값처럼 보이기 때문이다.
 * 해가 바뀌어도 M/D다 — 도매 목록 시각(`10/27`)과 같은 꼴이고, 1년 넘은 답을 다시 볼 일은 드물다.
 */
export function checkedLabel(checkedAt: string, nowMs: number): string {
  const time = `${formatClock(checkedAt)}${ROOM_TEXT.checkedSuffix}`;
  if (seoulDateKey(checkedAt) === seoulDateKey(new Date(nowMs).toISOString()))
    return time;
  const p = seoulParts(Date.parse(checkedAt));
  return `${p.month}/${p.day} ${time}`;
}

/**
 * 자동 답변 말풍선 안 조회 시각(checkedAt, 서울). 모든 자동 답에 단다(D31①). 근거가 없으면 null.
 * `nowMs`는 방이 15초마다 갱신하는 지금 시각 — 자정을 넘기면 다시 그릴 때 날짜가 붙는다(S2-5).
 */
export function autoReplySeen(
  message: Pick<ChatMessage, "autoReply">,
  nowMs: number,
): string | null {
  if (message.autoReply === null) return null;
  return checkedLabel(message.autoReply.checkedAt, nowMs);
}

/** `messageAc`가 말풍선 하나만 봐서는 모르는 방 상태(loop-05b 와이어프레임 상태별 data-ac) */
export interface MessageAcContext {
  /** 401 끊김 — 자동 답 말풍선 S8-8 */
  sessionLost: boolean;
  /** 바로 뒤에 사람 넘김 줄이 붙은 내 말(`handoffCauses`) — S8-10 */
  handoffCauses: ReadonlySet<number>;
  /** 옵션 칩으로 보낸 말이 못 보냄 상태(`choiceSendFailed`) — 되묻기 말풍선 S8-15 */
  choiceFailed: boolean;
  /** 미송 대상 검증에 걸린 내 말과 그 넘김 줄(`backorderGuardSequences`) — S3-5 */
  backorderGuard: ReadonlySet<number>;
}

const NO_AC_CONTEXT: MessageAcContext = {
  sessionLost: false,
  handoffCauses: new Set(),
  choiceFailed: false,
  backorderGuard: new Set(),
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
  > &
    Partial<Pick<ChatMessage, "autoReply">>,
  baseline: number,
  pendingIds: ReadonlySet<string>,
  context: MessageAcContext = NO_AC_CONTEXT,
): string {
  const kind = bubbleKindOf(message);
  const ac = [kind === "auto" || kind === "system" ? "S5-6" : "S5-5"];
  // 06a 와이어프레임: 미송 되묻기는 S3-1, 미송 답은 S3-3. 05b: 되묻기는 S8-3, 재고 답은 S8-4
  // 07 와이어프레임(data-loop="07"): 미수 답은 S2-1 S2-4
  const intent = message.autoReply?.intent;
  const backorder = intent === "BACKORDER";
  if (message.kind === "CLARIFY") ac.push(backorder ? "S3-1" : "S8-3");
  if (message.kind === "AUTO_REPLY")
    ac.push(
      backorder ? "S3-3" : intent === "RECEIVABLE" ? "S2-1 S2-4" : "S8-4",
    );
  if (message.kind === "AUTO_REPLY" && context.sessionLost) ac.push("S8-8");
  if (message.kind === "CLARIFY" && context.choiceFailed) ac.push("S8-15");
  if (message.kind === "HANDOFF" || context.handoffCauses.has(message.sequence))
    ac.push("S8-10");
  if (context.backorderGuard.has(message.sequence)) ac.push("S3-5");
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

/**
 * 미송 대상 검증에 걸린 말(와이어프레임 #state-bo-guard, S3-5). 미송 칩(`inquiry.backorderId`)으로 보냈는데
 * 바로 다음 말이 미송 답이 아닌 내 말, 그리고 그 바로 뒤 넘김 줄. 남의 미송, 보기 밖, 30분 지난 칩이 여기 온다.
 * 소매 응답엔 넘김 이유가 없어서(누출 규칙) 이유로 가르지 않는다. 다음 말이 아직 없으면(보내는 중) 달지 않는다.
 * 열린 넘김 억제(M2)로 넘김 줄이 안 붙어도 내 말에는 단다 — 답이 안 나간 건 같다
 */
export function backorderGuardSequences(
  messages: readonly Pick<
    ChatMessage,
    "sequence" | "sender" | "kind" | "inquiry"
  >[],
): Set<number> {
  const guarded = new Set<number>();
  const sorted = [...messages].sort((a, b) => a.sequence - b.sequence);
  sorted.forEach((message, i) => {
    const next = sorted[i + 1];
    if (
      message.sender !== "RETAILER" ||
      message.inquiry?.intent !== "BACKORDER" ||
      message.inquiry.backorderId == null ||
      next === undefined ||
      next.kind === "AUTO_REPLY"
    )
      return;
    guarded.add(message.sequence);
    if (next.kind === "HANDOFF") guarded.add(next.sequence);
  });
  return guarded;
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
 * 헤더 채팅 링크(loop-06 S2). 규칙은 도매 `features/notification/derive.ts`와 같다 — 앱 사이 import가
 * 금지라 복제했고, 같은 이름(`headerBackoffMs`)과 같은 경계값 테스트를 쓴다
 * ------------------------------------------------------------------------ */

/**
 * 채팅 링크의 이름과 배지(S2-2). 0이거나 count를 모르면(실패, 401, 403) 배지 없이 이름은 "채팅".
 * 이름에는 실제 수 그대로, 배지만 "99+"로 줄인다.
 */
export function chatBadgeLabel(counts: HeaderCounts | undefined): BadgeView {
  const n = counts?.kind === "ok" ? counts.chats : 0;
  if (n <= 0) return { label: NAV_TEXT.label, badge: null };
  return {
    label: NAV_TEXT.unreadLabel(n),
    badge: n > BADGE_MAX ? `${BADGE_MAX}+` : String(n),
  };
}

/** 연속 실패 n번 뒤 다음 간격. 0이면 평소 30초, 1 → 60초, 2 → 120초, 3 이상 → 300초 */
export function headerBackoffMs(failures: number): number {
  if (failures <= 0) return HEADER_POLL_MS;
  const index = Math.min(failures, HEADER_BACKOFF_MS.length) - 1;
  return HEADER_BACKOFF_MS[index] ?? HEADER_POLL_MS;
}

/** count 쿼리의 다음 간격. 401, 403이면 멈춘다(false) */
export function headerPollDelayMs(
  counts: HeaderCounts | undefined,
): number | false {
  if (counts === undefined || counts.kind === "ok") return HEADER_POLL_MS;
  if (counts.kind === "stopped") return false;
  return headerBackoffMs(counts.failures);
}

/** 실패 하나를 더한 값. 직전이 성공이었거나 처음이면 1부터 센다 */
export function failedCounts(prev: HeaderCounts | undefined): HeaderCounts {
  return {
    kind: "failed",
    failures: prev?.kind === "failed" ? prev.failures + 1 : 1,
  };
}

/**
 * 이 count 응답을 버려야 하나(S2-6 나). count마다 시작 순번(`started`)을 달고, 읽음이 성공할 때 그때까지
 * 나간 마지막 순번을 울타리(`fence`)로 세운다. 울타리 안쪽에서 시작한 응답은 읽기 **전** 숫자를 들고 오므로
 * 늦게 도착하면 방금 사라진 배지를 되살린다. 같은 순번도 버린다 — 읽음과 같은 틱에 떠난 count다.
 */
export function isStaleCount(started: number, fence: number): boolean {
  return started <= fence;
}

/* ------------------------------------------------------------------------
 * 방 읽음(loop-06 S2-5, S2-6 가)
 * ------------------------------------------------------------------------ */

/**
 * 지금 읽음을 보낼 위치. 보낼 게 없으면 null. 도매 `ChatRoomPanel`의 읽음 규칙과 같다.
 * - 탭이 안 보이면 보내지 않는다 — 사장이 못 본 걸 읽었다고 하지 않는다. 다시 보이는 순간 평가한다
 * - 세션이 끊겼으면 보내지 않는다(05a 끊김 상태, 요청 0)
 * - 그린 위치가 확인된 위치 이하이거나, 같은 위치가 이미 날아가는 중이면 보내지 않는다 — 응답 전에 다시
 *   그려져도 POST는 1회다. 날아가는 중인 위치보다 **큰** 것이 새로 그려지면 바로 보낸다(10 응답 전 12)
 */
export function nextReadTarget(state: ReadState): number | null {
  if (!state.visible || state.sessionLost) return null;
  if (state.drawn <= state.confirmed || state.drawn <= state.inFlight)
    return null;
  return state.drawn;
}

/**
 * 읽음 응답을 받은 뒤 아는 위치. 서버는 `max(기존, 요청)`을 돌려주지만 응답은 순서대로 오지 않는다 —
 * 10 요청의 응답이 12 응답 뒤에 늦게 오면 그 값(10)은 버린다(올라가기만 한다).
 */
export function confirmedReadOf(
  confirmed: number,
  result: Pick<ChatReadResult, "lastReadSequence">,
): number {
  return Math.max(confirmed, result.lastReadSequence);
}

/* ------------------------------------------------------------------------
 * `/chats` 목록(loop-06 S2-4)
 * ------------------------------------------------------------------------ */

/** 서울 달력 날짜 번호. 날짜끼리 하루 차이를 센다(UTC 자정 기준 일 수) */
function seoulDayNumber(ms: number): number {
  const p = seoulParts(ms);
  return Math.floor(Date.UTC(p.year, p.month - 1, p.day) / 86_400_000);
}

/**
 * 목록 행 시각(와이어프레임 `#state-chat-list`). 오늘이면 `HH:mm`, 어제면 `어제`, 올해면 `M/D`,
 * 그 전이면 `YY.M.D`(서울 달력). 도매 `formatListTime`에 `어제`만 더했다 — 와이어프레임이 그렇게 그렸다.
 * `nowMs`는 부르는 쪽이 준다(테스트가 날짜에 묶이지 않게).
 */
export function formatListTime(iso: string, nowMs: number): string {
  const ms = Date.parse(iso);
  const at = seoulParts(ms);
  const days = seoulDayNumber(nowMs) - seoulDayNumber(ms);
  if (days <= 0) return `${pad2(at.hour)}:${pad2(at.minute)}`;
  if (days === 1) return LIST_TEXT.yesterday;
  if (at.year === seoulParts(nowMs).year) return `${at.month}/${at.day}`;
  return `${String(at.year % 100).padStart(2, "0")}.${at.month}.${at.day}`;
}

/** 안 읽은 수 알약 글자. 0이면 null(알약을 안 그린다) */
export function formatUnread(count: number): string | null {
  if (count <= 0) return null;
  return count > BADGE_MAX ? `${BADGE_MAX}+` : String(count);
}

/**
 * wire → 행. 행을 누르면 `?from=/chats`로 연다 — 방 머리 돌아가기가 목록으로 온다(디자인 결정 36).
 * 같은 방이 두 번 오면 앞 것만(첫 장 안에서도 서버가 겹쳐 줄 수 있다고 본다).
 */
export function toRoomRows(
  rooms: readonly ChatRoomSummary[],
  nowMs: number,
): ChatRoomRowView[] {
  const seen = new Set<number>();
  const rows: ChatRoomRowView[] = [];
  for (const room of rooms) {
    if (seen.has(room.roomId)) continue;
    seen.add(room.roomId);
    rows.push({
      roomId: room.roomId,
      href: chatRoomHref(room.roomId, CHATS_HREF),
      name: room.counterpart.name,
      preview: room.lastMessage?.preview ?? "",
      time: formatListTime(room.lastActivityAt, nowMs),
      unreadLabel: formatUnread(room.unreadCount),
      unreadCount: room.unreadCount,
    });
  }
  return rows;
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

/** 보기 종류. 칸이 없으면 VARIANT(계약 "읽는 쪽 ?? VARIANT", 05b 서버는 이 칸을 안 싣는다) */
export function choiceKindOf(
  choice: Pick<ChatChoice, "kind">,
): NonNullable<ChatChoice["kind"]> {
  return choice.kind ?? "VARIANT";
}

/**
 * 이 되묻기가 미송 되묻기인가(loop-06 §4-3 1). 의도가 BACKORDER이거나 보기 중 하나라도 미송, `다른 주문이에요`
 * 보기면 그렇다. 미송 되묻기는 게시글 문맥(`listingId`)이 없어도 칩을 그린다 — 상품 상세 밖에서 연 방에서도
 * "언제 와요?"를 물을 수 있다.
 */
export function isBackorderClarify(
  message: Pick<ChatMessage, "kind" | "autoReply">,
): boolean {
  if (message.kind !== "CLARIFY") return false;
  if (message.autoReply?.intent === "BACKORDER") return true;
  return choicesOf(message).some((c) => choiceKindOf(c) !== "VARIANT");
}

/**
 * 보기 하나의 고유 키. 렌더 key, 고름 표시, 복원이 전부 이 값을 쓴다. 미송 보기는 **backorderId**다 — 같은 SKU의
 * 미송 둘(9001, 9006)은 variantId가 같아 variantId로는 갈리지 않는다(Codex plan r1 10).
 */
export function choiceKey(
  choice: Pick<ChatChoice, "kind" | "variantId" | "backorderId">,
): string {
  switch (choiceKindOf(choice)) {
    case "BACKORDER":
      return `backorder:${choice.backorderId ?? "?"}`;
    case "NOT_LISTED":
      return "not-listed";
    default:
      return `variant:${choice.variantId}`;
  }
}

/** 보류 말풍선이 이 되묻기 줄을 잠그나. 재고는 못 보낸 것도 잠그고(결정 28), 미송은 보내는 중만 잠근다(S3-2) */
function lockingPending(
  pending: readonly PendingMessage[],
  backorder: boolean,
): PendingMessage[] {
  return backorder
    ? pending.filter((p) => p.status === "sending")
    : [...pending];
}

/**
 * 되묻기 칩을 지금 고를 수 있나(§4-1 5, S8-16). 셋 다 맞아야 한다.
 * - 그 방의 **마지막** 되묻기다
 * - 그 뒤에 소매 메시지(보낸 것, 보내는 중, 못 보낸 것)도 도매 사람 답(TEXT와 모르는 kind)도 없다
 * - 되묻기가 온 지 30분 안이다(서버 계승 규칙과 같은 창)
 *
 * 재고 되묻기는 못 보낸 말풍선(`pending`)도 막는다(결정 28): 고른 칩이 실패해도 줄은 고른 채 잠겨 있고
 * `다시 보내기`만 같은 키로 보낸다. `지우기`로 보류 말풍선이 사라지면 30분 안일 때 다시 켜진다.
 * **미송 되묻기는 실패하면 풀린다**(loop-06 S3-2, 디자인 결정 기록) — 주문을 잘못 골랐을 수 있어 다른 주문을
 * 다시 고를 수 있어야 한다. 보내는 중일 때만 잠근다.
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
  if (lockingPending(pending, isBackorderClarify(clarify)).length > 0)
    return false;
  for (const later of messages.slice(index + 1)) {
    if (later.kind === "CLARIFY") return false;
    if (later.sender === "RETAILER") return false;
    if (bubbleKindOf(later) === "them") return false;
  }
  return now - Date.parse(clarify.sentAt) <= CLARIFY_WINDOW_MS;
}

/**
 * 이 되묻기에 고른 보기. 되묻기 바로 뒤의 첫 소매 메시지(서버에 간 것이 먼저, 없으면 줄을 잠그는 보류 말풍선)가
 * 보기 중 하나를 골랐으면 그 보기. 칩으로 골랐으면 `inquiry`로 — 미송은 `backorderId`, `다른 주문이에요`는
 * `notListed`, 재고는 VARIANT 보기의 `variantId`. 칩 글자를 그대로 쳤으면 본문으로 안다(`다른 주문이에요`는 빼고 —
 * 손으로 친 그 글자는 서버가 새로 판정한다, S3-4). 딴소리였거나 아직 아무것도 안 보냈으면 null.
 *
 * 미송은 backorderId로만 고른다: 같은 SKU 미송 9001과 9006은 variantId가 같다(S3-2). 새로고침 뒤에도 서버에 간
 * 메시지의 `inquiry`로 같은 보기를 다시 찾는다.
 */
export function selectedChoice(
  messages: readonly ChatMessage[],
  pending: readonly PendingMessage[],
  sequence: number,
): ChatChoice | null {
  const index = messages.findIndex((m) => m.sequence === sequence);
  const clarify = messages[index];
  if (clarify === undefined) return null;
  const choices = choicesOf(clarify);
  const answer =
    messages.slice(index + 1).find((m) => m.sender === "RETAILER") ??
    lockingPending(pending, isBackorderClarify(clarify))[0];
  if (answer === undefined) return null;
  const inquiry = answer.inquiry;
  // 칩으로 고른 것이 먼저 — 본문은 사장이 칩 글자를 직접 친 경우에만 본다
  const byInquiry =
    inquiry === null
      ? undefined
      : inquiry.notListed === true
        ? choices.find((c) => choiceKindOf(c) === "NOT_LISTED")
        : inquiry.backorderId !== null
          ? choices.find(
              (c) =>
                choiceKindOf(c) === "BACKORDER" &&
                c.backorderId === inquiry.backorderId,
            )
          : choices.find(
              (c) =>
                choiceKindOf(c) === "VARIANT" &&
                c.variantId === inquiry.variantId,
            );
  return (
    byInquiry ??
    choices.find(
      (c) => choiceKindOf(c) !== "NOT_LISTED" && c.label === answer.body.trim(),
    ) ??
    null
  );
}

/**
 * 되묻기 말풍선의 칩 줄. 보기가 없는 되묻기(05a 시드, 상품을 못 찾은 것)는 null — 칩 없이 본문만.
 * 재고 되묻기는 게시글 문맥이 있어야 칩을 그린다(`inquiry.listingId`로 간다). 미송 되묻기는 없어도 그린다.
 */
export function toClarifyView(
  message: ChatMessage,
  messages: readonly ChatMessage[],
  pending: readonly PendingMessage[],
  now: number,
): ClarifyView | null {
  if (message.kind !== "CLARIFY") return null;
  const choices = choicesOf(message);
  if (choices.length === 0) return null;
  const backorder = isBackorderClarify(message);
  const listingId = message.autoReply?.subject.listingId ?? null;
  if (!backorder && listingId === null) return null;
  const selected = selectedChoice(messages, pending, message.sequence);
  return {
    mode: backorder ? "backorder" : "stock",
    listingId,
    choices,
    active: choicesActive(messages, pending, message.sequence, now),
    selectedKey: selected === null ? null : choiceKey(selected),
  };
}

/**
 * 미송 보기 하나를 고른 문의 문맥(loop-06 §4-3 1, S3-2). 본문은 칩 글자 그대로다.
 * - 미송 보기 → `{intent: BACKORDER, backorderId, variantId: 그 미송의 SKU, listingId: null}`
 * - `다른 주문이에요` → `{intent: BACKORDER, notListed: true}`. 서버는 본문을 명령으로 읽지 않고 이 칸만 본다
 *   (Codex plan r1 11) — 같은 글자를 손으로 치면 `notListed`가 없어 새로 판정한다(S3-4)
 * 상품 문맥(`listingId`)은 싣지 않는다 — 미송 답은 상품 상세 문맥과 무관하다(§3 out 4).
 */
export function backorderChoiceInquiry(choice: ChatChoice): ChatInquiry {
  if (choiceKindOf(choice) === "NOT_LISTED")
    return {
      intent: "BACKORDER",
      listingId: null,
      variantId: null,
      backorderId: null,
      label: choice.label,
      notListed: true,
    };
  return {
    intent: "BACKORDER",
    listingId: null,
    variantId: choice.variantId,
    backorderId: choice.backorderId ?? null,
    label: choice.label,
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
    /* VARIANT 보기만 — 미송 보기도 variantId를 들고 있지만 글자가 주문 문장이다(loop-06) */
    const hit = choicesOf(m).find(
      (c) => choiceKindOf(c) === "VARIANT" && c.variantId === variantId,
    );
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

/* ------------------------------------------------------------------------
 * 미송 자동 답 카드(loop-06 S3-3, 디자인 결정 39 40)
 * ------------------------------------------------------------------------ */

/** `YYYY-MM-DD` → `11월 5일`, 다른 해면 `2027년 1월 5일`(서버 문장과 같은 규칙, §4-2 7) */
function inboundDateLabel(date: string, today: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const sameYear = date.slice(0, 4) === today.slice(0, 4);
  return sameYear ? `${m}월 ${d}일` : `${y}년 ${m}월 ${d}일`;
}

/** 입고 예정일과 오늘(서울 날짜)로 상태. 둘 다 `YYYY-MM-DD`라 글자 비교가 날짜 비교다 */
function inboundStateOf(
  date: string | null,
  today: string,
): BackorderCardView["state"] {
  if (date === null) return "NONE";
  if (date === today) return "TODAY";
  return date > today ? "FUTURE" : "PAST";
}

/** 보기 글자 끝의 주문 조각 `9/7 주문 #7003`(다른 해 `2025/12/30 주문 #…`). 없으면 null */
function orderPartOf(label: string): string | null {
  return /((?:\d{4}\/)?\d{1,2}\/\d{1,2} 주문 #\d+)$/.exec(label)?.[1] ?? null;
}

/**
 * 미송 자동 답(AUTO_REPLY, BACKORDER)의 카드 칸(S3-3). 미송 답이 아니거나 근거가 없으면 null — 본문만 그린다.
 *
 * - 대상: 서버 `subject.label`(`린넨 셋업 자켓 베이지 / L`). 주문 조각은 같은 방 되묻기 보기 중 이 backorderId의
 *   글자 끝에서 가져온다 — facts에 주문일과 번호가 없다. 보기 없이 바로 답한 경우(확정 문장)엔 대상만
 * - 수량: `facts.backorder.qty`는 **남은** 미배분 수량이다. 그래서 늘 "남은"을 붙인다(`/backorders`의 qty는
 *   원래 미송량이라 다를 수 있다, §3 out 6)
 * - 상태의 "오늘"은 답을 만든 시각(`checkedAt`)의 서울 날짜다 — 서버가 그 날로 문장을 정했고, 지난 카드가
 *   자정을 넘겼다고 다른 말을 하면 문장과 카드가 갈린다
 * - 사유는 예정, 오늘일 때만(결정 40). 지난 날짜 옆 사유는 그 계획이 아직 유효한 것처럼 읽힌다
 */
export function toBackorderReplyView(
  message: ChatMessage,
  messages: readonly ChatMessage[],
): BackorderCardView | null {
  if (message.kind !== "AUTO_REPLY") return null;
  const reply = message.autoReply;
  if (reply === null || reply.intent !== "BACKORDER") return null;
  const facts = reply.facts.backorder;
  const backorderId = reply.subject.backorderId;
  if (facts === null || backorderId === null) return null;

  const today = seoulDateKey(reply.checkedAt);
  const state = inboundStateOf(facts.expectedInboundDate, today);
  let order: string | null = null;
  for (const m of messages) {
    const hit = choicesOf(m).find(
      (c) => choiceKindOf(c) === "BACKORDER" && c.backorderId === backorderId,
    );
    if (hit !== undefined) order = orderPartOf(hit.label);
  }
  return {
    backorderId,
    target: reply.subject.label ?? "",
    order,
    qtyLabel: `${formatCount(facts.qty)}${QTY_UNIT}`,
    state,
    dateLabel:
      facts.expectedInboundDate === null
        ? null
        : inboundDateLabel(facts.expectedInboundDate, today),
    reason:
      state === "FUTURE" || state === "TODAY"
        ? (facts.expectedInboundReason ?? null)
        : null,
  };
}

/* ------------------------------------------------------------------------
 * 미수 자동 답 카드(loop-07 S2, 디자인 결정 41 42 43)
 * ------------------------------------------------------------------------ */

/** `37,500원`. 서버 본문과 같은 꼴 — 원 단위 정수, 세 자리 쉼표, 반올림과 줄임 없음(§4-1 10) */
function formatWon(value: number): string {
  return `${formatCount(value)}원`;
}

/**
 * 미수 자동 답(AUTO_REPLY, RECEIVABLE)의 카드 칸(S2-1 S2-2). 미수 답이 아니거나 근거가 없으면 null — 본문만 그린다.
 *
 * - 갚을 돈 > 0: `갚을 돈 37,500원` + 기한 줄(`기한 지남 1건 37,500원 (최대 54일)` 또는 `기한 지난 것 없음`)
 * - 갚을 돈 0: `갚을 돈 없음` 한 줄. 기한 줄은 그리지 않는다(결정 42) — 0원이면 기한 지난 돈도 0이라 같은 말을 두 번 한다
 * - 선수금 > 0이면 마지막에 `선수금 30,000원`
 *
 * 링크의 도매처는 facts가 아니라 방 상대(`counterpart.id`)다 — 소매 응답 facts엔 도매처 칸이 없고, 서버가 이 방
 * 도매처 몫만 답한다(§4-1 5).
 */
export function toReceivableReplyView(
  message: ChatMessage,
  wholesalerId: number,
): ReceivableCardView | null {
  if (message.kind !== "AUTO_REPLY") return null;
  const reply = message.autoReply;
  if (reply === null || reply.intent !== "RECEIVABLE") return null;
  const facts = reply.facts.receivable;
  if (facts === null) return null;

  const lines: TextPart[][] = [];
  if (facts.outstandingAmount > 0) {
    lines.push([
      { text: RECEIVABLE_TEXT.outstanding, strong: false },
      { text: formatWon(facts.outstandingAmount), strong: true },
    ]);
    const { count, amount, maxDaysOverdue } = facts.overdue;
    lines.push(
      count > 0
        ? [
            { text: RECEIVABLE_TEXT.overdue, strong: false },
            {
              text: `${formatCount(count)}건 ${formatWon(amount)}`,
              strong: true,
            },
            { text: ` (최대 ${formatCount(maxDaysOverdue)}일)`, strong: false },
          ]
        : [{ text: RECEIVABLE_TEXT.overdueNone, strong: false }],
    );
  } else {
    lines.push([{ text: RECEIVABLE_TEXT.nothing, strong: true }]);
  }
  if (facts.prepaidAmount > 0)
    lines.push([
      { text: RECEIVABLE_TEXT.prepaid, strong: false },
      { text: formatWon(facts.prepaidAmount), strong: true },
    ]);

  return {
    lines,
    settlementHref: `${SETTLEMENTS_HREF}?wholesaler=${wholesalerId}`,
  };
}

/** 카드 줄을 화면 글자로(e2e와 unit이 같은 글을 본다) */
export function partsText(parts: readonly TextPart[]): string {
  return parts.map((part) => part.text).join("");
}

/**
 * 카드 입고 상태 줄을 조각으로(결정 39). 굵게는 날짜와 상태 낱말만. 색 없음 — 지남도 빨강이 아니고 "지연" 낱말도
 * 없다(Q2: 입고됐는데 날짜만 안 고쳤을 수 있다).
 */
export function backorderStateLine(
  card: Pick<BackorderCardView, "state" | "dateLabel">,
): { text: string; strong: boolean }[] {
  switch (card.state) {
    case "FUTURE":
      return [
        { text: BACKORDER_TEXT.expected, strong: false },
        { text: card.dateLabel ?? "", strong: true },
      ];
    case "TODAY":
      return [
        { text: BACKORDER_TEXT.expected, strong: false },
        { text: BACKORDER_TEXT.today, strong: true },
      ];
    case "NONE":
      return [{ text: BACKORDER_TEXT.undecided, strong: true }];
    case "PAST":
      return [
        { text: BACKORDER_TEXT.passed, strong: true },
        { text: ` (${card.dateLabel ?? ""})`, strong: false },
      ];
  }
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
