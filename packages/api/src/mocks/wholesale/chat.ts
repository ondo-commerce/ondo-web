import { delay, http, HttpResponse } from "msw";
import type { WholesaleSchema } from "../../wholesale";
import { CHAT_EXTRA_LISTINGS } from "../chat/extraListings";
import {
  DEFAULT_AUTO_REPLY_SETTINGS,
  decideInquiry,
  generatedLines,
  type AutoReplySettings,
  type InquiryListing,
} from "../chat/inquiry";
import { seoulDate } from "../chat/backorderCandidates";
import { inquiryBackorders, resetBackorderMock } from "./backorder";
import { chatStockListing } from "./product";

/**
 * 채팅 목 — 초안 op 5개(#263, 스냅샷 `x-ondo-draft`). 계약은 `01-plan.md` §5-2, 목은 §5-3.
 *
 * BE 시드가 없다(채팅 코드 자체가 없다, D10). 그래서 다른 목과 달리 **시드를 여기서 지었다.**
 * 지은 것이 무엇을 시험하려고 있는지 방마다 적는다 — 값이 그럴듯한 게 목적이 아니라
 * 경계(30개 페이지, 50개 페이지, 같은 시각, 역전, 중복 재전송, 남의 방)를 만드는 게 목적이다.
 *
 * 상태가 있다: 방, 방별 sequence, 양쪽 읽음 위치, Idempotency-Key 저장소. 새로고침하면 시드로 돌아간다.
 *
 * 세션이 없는 목이라 "나"는 도매처 101(상품 목의 첫 도매처)이다. 소매처 1 봄봄상회, 2 대기상회는
 * 주문, 미송 목과 같은 id다. 3~32는 목 전용 가명이다.
 *
 * 소매 쪽 목(`../retail/chat.ts`, loop-05a)은 이 저장소를 같이 쓴다 — 방은 (도매처, 소매처) 쌍에
 * 1개이고 양쪽이 같은 roomId를 보기 때문이다(README "채팅 목"). 맨 아래 `chatStore`가 그 입구다.
 * 목은 앱마다 브라우저 안에 살아서 도매 탭과 소매 탭이 상태를 나누지는 않는다 — 나누는 건 시드와 규칙이다.
 */

type ChatMessage = WholesaleSchema<"ChatMessage">;
type ChatRoomSummary = WholesaleSchema<"ChatRoomSummary">;
type ChatRoomDetail = WholesaleSchema<"ChatRoomDetail">;
type ChatSendResult = WholesaleSchema<"ChatSendResult">;
type ChatInquiry = WholesaleSchema<"ChatInquiry">;
type ChatMessageKind = WholesaleSchema<"ChatMessageKind">;
type ChatSender = WholesaleSchema<"ChatSender">;
type ChatIntent = WholesaleSchema<"ChatIntent">;

/** 세션 없는 목의 "나". 상품 목의 첫 도매처 */
export const CHAT_ME_WHOLESALER_ID = 101;

/** 본문 손잡이. `includes`로 본다 — 긴 글 안에 섞여도 걸린다. 위에서부터 먼저 맞는 것 하나 */
export const CHAT_BODY_HOOK = {
  /** 401 UNAUTHENTICATED. 만들지 않는다 */
  AUTH_401: "auth401",
  /** 403 NOT_APPROVED. 만들지 않는다 */
  AUTH_403: "auth403",
  /** 만들고 저장하고 **응답만** 500. 같은 키로 다시 보내면 200 replay (응답 유실 재현) */
  FAIL_AFTER_COMMIT: "failAfterCommit",
  /** 같은 키의 첫 요청만 500(만들지 않음), 다시 보내면 201 */
  FAIL_500_ONCE: "fail500once",
  /** 늘 500. 만들지 않는다 */
  FAIL_500: "fail500",
  /** 만든 뒤 5초 있다가 201 ("보내는 중" 확인, 중복 요청 대기) */
  SLOW_5S: "slow5s",
} as const;

/** 보내기 기본 지연. "보내는 중" 말풍선이 한 프레임은 보이게 */
export const CHAT_SEND_DELAY_MS = 300;
export const CHAT_SLOW_MS = 5_000;

export const CHAT_BODY_MAX = 1000;
const PREVIEW_MAX = 80;
const ROOM_PAGE_DEFAULT = 30;
const MESSAGE_PAGE_DEFAULT = 50;
const SIZE_MAX = 100;

/** `/__mock/chat/fail`이 고르는 op. 앞 4개는 스펙 op, `room`은 방 머리 */
export const CHAT_FAIL_OPS = [
  "rooms",
  "room",
  "messages",
  "send",
  "read",
  "settings",
] as const;
type ChatFailOp = (typeof CHAT_FAIL_OPS)[number];

/* --- 상태 --------------------------------------------------------------- */

interface MockRoom {
  roomId: number;
  wholesalerId: number;
  retailerId: number;
  retailerName: string;
  createdAt: string;
  messages: ChatMessage[];
  /** 도매(나)가 읽은 위치 */
  wholesalerLastRead: number;
  /** 소매가 읽은 위치. 한 번도 안 읽었으면 null */
  retailerLastRead: number | null;
  /**
   * 방의 상품 문맥(loop-05b §4-2 6). 소매 `createChatRoom`의 listingId와 그 시각(ms).
   * 자동 답이 "이 상품"을 이 값으로 읽는다. 30분 지나면 없는 것으로 본다(판정이 잰다)
   */
  context: { listingId: number; at: number } | null;
}

interface IdempotencyRecord {
  bodyHash: string;
  /** 처음 요청이 끝나야 채워진다. 같은 키 동시 요청은 이걸 기다린다 */
  ready: Promise<void>;
  /** 만든 직후(지연 전에) 채운다. 만들지 못한 요청(500, 401 …)은 기록을 남기지 않는다 */
  result: ChatSendResult | null;
}

let rooms: MockRoom[] = [];
let nextMessageId = 1;
/** 키 범위는 (방, 보낸 사업체). 목은 보내는 쪽이 도매뿐이라 `${roomId}:WHOLESALER:${key}` */
const idempotency = new Map<string, IdempotencyRecord>();
/** `fail500once`가 이미 한 번 실패시킨 키 */
const failedOnceKeys = new Set<string>();
const failPlan = new Map<ChatFailOp, { status: number; times: number }>();
/**
 * 자동 답 설정(도매처 단위, 초안 op `autoReplySettings`). 목은 "나"(101) 한 벌만 둔다 — 다른 도매처 방은
 * 늘 켜짐으로 판정한다. 새로고침하면 켜짐으로 돌아간다(BE는 저장, §4-3)
 */
let autoReplySettings: AutoReplySettings = structuredClone(
  DEFAULT_AUTO_REPLY_SETTINGS,
);

/* --- 시드 --------------------------------------------------------------- */

/** 시드 기준 시각. 방 1이 10/27(화)과 10/28(수)에 걸친다(S3-1 날짜 구분선) */
const SEED_BASE_MS = Date.parse("2026-10-28T10:00:00+09:00");
const MINUTE_MS = 60_000;

function at(minutesBeforeBase: number): string {
  return new Date(SEED_BASE_MS - minutesBeforeBase * MINUTE_MS).toISOString();
}

const RETAILER_NAMES: readonly string[] = [
  "봄봄상회",
  "대기상회",
  "가람상회",
  "나래옷방",
  "다온패션",
  "라온상점",
  "마루의류",
  "바다상회",
  "사랑옷집",
  "아라패션",
  "자람상회",
  "차오름",
  "카페옷방",
  "타래상회",
  "파랑의류",
  "하늘옷집",
  "고운상회",
  "누리패션",
  "도담옷방",
  "로아상회",
  "모아의류",
  "보람상점",
  "새봄패션",
  "온새미",
  "제이옷방",
  "초롱상회",
  "큰별의류",
  "토리패션",
  "풀잎상회",
  "한결옷집",
  "여울상회",
  "윤슬패션",
];

interface SeedLine {
  sender: ChatSender;
  kind?: ChatMessageKind;
  body: string;
  sentAt: string;
  clientMessageId?: string | null;
  inquiry?: ChatInquiry | null;
  autoReply?: ChatMessage["autoReply"];
}

function room(
  roomId: number,
  retailerIndex: number,
  createdAt: string,
  lines: readonly SeedLine[],
  read: { wholesaler: number; retailer: number | null },
  wholesalerId = CHAT_ME_WHOLESALER_ID,
): MockRoom {
  const r: MockRoom = {
    roomId,
    wholesalerId,
    retailerId: retailerIndex + 1,
    retailerName:
      RETAILER_NAMES[retailerIndex] ?? `소매처 ${retailerIndex + 1}`,
    createdAt,
    messages: [],
    wholesalerLastRead: read.wholesaler,
    retailerLastRead: read.retailer,
    context: null,
  };
  for (const line of lines) {
    append(r, line);
  }
  return r;
}

/** 시드 메시지의 clientMessageId. 무작위를 섞으면 새로고침마다 값이 달라져 화면 검증이 흔들린다 */
function seedUuid(id: number): string {
  return `00000000-0000-4000-8000-${String(id).padStart(12, "0")}`;
}

function append(r: MockRoom, line: SeedLine): ChatMessage {
  const id = nextMessageId++;
  const message: ChatMessage = {
    id,
    roomId: r.roomId,
    sequence: (r.messages.at(-1)?.sequence ?? 0) + 1,
    clientMessageId:
      line.clientMessageId === undefined
        ? line.sender === "SYSTEM" || (line.kind ?? "TEXT") !== "TEXT"
          ? null
          : seedUuid(id)
        : line.clientMessageId,
    sender: line.sender,
    kind: line.kind ?? "TEXT",
    body: line.body,
    sentAt: line.sentAt,
    inquiry: line.inquiry ?? null,
    autoReply: line.autoReply ?? null,
  };
  r.messages.push(message);
  return message;
}

/** 방 6의 "같은 키로 두 번 보낸 기록". 이 키로 다시 보내면 200 replay */
export const CHAT_SEED_REPLAY_KEY = "6f1d1f0e-4d3b-4c55-9a77-000000000006";

function seedRooms(): MockRoom[] {
  nextMessageId = 1;
  const list: MockRoom[] = [];

  // 방 1 봄봄상회 — 두 날(10/27 화, 10/28 수), 재고 문의 → 되묻기 → 자동 답, 사장 답, 안 읽은 소매 글 1
  list.push(
    room(
      1,
      0,
      at(60 * 26),
      [
        {
          sender: "RETAILER",
          body: "안녕하세요, 플라워 셔츠 문의드려요",
          sentAt: at(60 * 25),
        },
        {
          sender: "WHOLESALER",
          body: "네 말씀하세요",
          sentAt: at(60 * 25 - 3),
        },
        {
          sender: "RETAILER",
          body: "이 셔츠 몇 장 남았어요?",
          sentAt: at(40),
          inquiry: {
            intent: "STOCK",
            listingId: 2001,
            variantId: null,
            backorderId: null,
            label: "빈티지 플라워 셔츠",
          },
        },
        {
          sender: "WHOLESALER",
          kind: "CLARIFY",
          body: "어떤 색상, 사이즈요?",
          sentAt: at(40),
          autoReply: {
            intent: "STOCK",
            replyToSequence: 3,
            generatedBy: "RULE",
            checkedAt: at(40),
            subject: {
              listingId: 2001,
              variantId: null,
              backorderId: null,
              label: "빈티지 플라워 셔츠",
            },
            facts: { stock: null, backorder: null, receivable: null },
          },
        },
        {
          sender: "RETAILER",
          body: "레드 / M",
          sentAt: at(38),
          inquiry: {
            intent: "STOCK",
            listingId: 2001,
            variantId: 3002,
            backorderId: null,
            label: "빈티지 플라워 셔츠 레드 / M",
          },
        },
        {
          sender: "WHOLESALER",
          kind: "AUTO_REPLY",
          body: "레드 M은 10~49장 있어요. 지금 주문할 수 있어요(한 번에 최대 500장)",
          sentAt: at(38),
          // 상품 목 3002의 시드 재고(35, 주문제한 500)를 옮겨 적었다. 상품 목과 상태를 공유하지 않는다
          autoReply: {
            intent: "STOCK",
            replyToSequence: 5,
            generatedBy: "RULE",
            checkedAt: at(38),
            subject: {
              listingId: 2001,
              variantId: 3002,
              backorderId: null,
              label: "빈티지 플라워 셔츠 레드 / M",
            },
            facts: {
              stock: { availableQty: 35, band: "UNDER_50", orderLimit: 500 },
              backorder: null,
              receivable: null,
            },
          },
        },
        {
          sender: "RETAILER",
          body: "감사합니다. 내일 주문할게요",
          sentAt: at(30),
        },
      ],
      { wholesaler: 6, retailer: 6 },
    ),
  );

  // 방 2 대기상회 — 열린 사람 넘김. 그 뒤 자동 답이 와도 닫히지 않는다(openHandoff)
  list.push(
    room(
      2,
      1,
      at(60 * 5),
      [
        { sender: "RETAILER", body: "제 미수 얼마예요?", sentAt: at(60 * 4) },
        {
          sender: "WHOLESALER",
          kind: "AUTO_REPLY",
          body: "갚을 돈 786,000원, 그중 기한 지난 것 1건이에요",
          sentAt: at(60 * 4),
          autoReply: {
            intent: "RECEIVABLE",
            replyToSequence: 1,
            generatedBy: "RULE",
            checkedAt: at(60 * 4),
            subject: {
              listingId: null,
              variantId: null,
              backorderId: null,
              label: null,
            },
            facts: {
              stock: null,
              backorder: null,
              receivable: {
                outstandingAmount: 786_000,
                prepaidAmount: 0,
                overdue: { count: 1, amount: 120_000, maxDaysOverdue: 3 },
              },
            },
          },
        },
        {
          sender: "RETAILER",
          body: "조금 깎아 주세요",
          sentAt: at(60 * 3),
        },
        {
          sender: "SYSTEM",
          kind: "HANDOFF",
          body: "자동 답변이 답하지 못했어요. 직접 답해 주세요",
          sentAt: at(60 * 3),
        },
      ],
      { wholesaler: 2, retailer: 4 },
    ),
  );

  // 방 3 가람상회 — 메시지 120개(50개 페이지를 두 번 넘긴다). 홀수 소매, 짝수 도매. 100까지 읽음
  const long: SeedLine[] = [];
  for (let i = 1; i <= 120; i++) {
    long.push({
      sender: i % 2 === 1 ? "RETAILER" : "WHOLESALER",
      body: `메시지 ${i}`,
      sentAt: at(60 * 30 - i),
    });
  }
  list.push(room(3, 2, at(60 * 31), long, { wholesaler: 100, retailer: 120 }));

  // 방 4 나래옷방 — 메시지 0개. lastActivityAt = 방 생성 시각
  list.push(room(4, 3, at(60 * 2), [], { wholesaler: 0, retailer: null }));

  // 방 5 다온패션 — 같은 sentAt 2개(2, 3)와 역전(4가 3보다 이른 시각). 순서는 sequence가 정한다
  list.push(
    room(
      5,
      4,
      at(60 * 7),
      [
        { sender: "RETAILER", body: "주문 확인 부탁해요", sentAt: at(60 * 6) },
        { sender: "WHOLESALER", body: "확인했어요", sentAt: at(60 * 5) },
        { sender: "RETAILER", body: "감사해요", sentAt: at(60 * 5) },
        { sender: "RETAILER", body: "아 하나 더요", sentAt: at(60 * 5 + 1) },
      ],
      { wholesaler: 4, retailer: 2 },
    ),
  );

  // 방 6 라온상점 — 같은 키로 두 번 보낸 기록. 메시지는 1개뿐이고 키는 저장소에 있다
  list.push(
    room(
      6,
      5,
      at(60 * 9),
      [
        { sender: "RETAILER", body: "샘플 받을 수 있나요", sentAt: at(60 * 8) },
        {
          sender: "WHOLESALER",
          body: "네 내일 보내 드릴게요",
          sentAt: at(60 * 8 - 2),
          clientMessageId: CHAT_SEED_REPLAY_KEY,
        },
      ],
      { wholesaler: 2, retailer: 2 },
    ),
  );

  // 방 7~32 — 목록 페이지(30개)를 넘기는 평범한 방. 20, 21은 lastActivityAt이 같다(roomId 보조 정렬)
  for (let roomId = 7; roomId <= 32; roomId++) {
    const minutes = roomId === 21 ? 60 * 10 + 20 * 13 : 60 * 10 + roomId * 13;
    list.push(
      room(
        roomId,
        roomId - 1,
        at(minutes + 60),
        [
          {
            sender: "RETAILER",
            body: "이번 주 신상 있나요?",
            sentAt: at(minutes + 5),
          },
          {
            sender: "WHOLESALER",
            body: "목요일에 올라가요",
            sentAt: at(minutes),
          },
        ],
        { wholesaler: 2, retailer: roomId % 3 === 0 ? 1 : 2 },
      ),
    );
  }

  // 방 33 — 다른 도매처(102)와 봄봄상회의 방. 101에게는 없는 방이다(404).
  // 소매 목(봄봄상회 = 나)이 보는 두 번째 방이라 소매 화면이 시험할 것을 여기 둔다(loop-05a S5-6 S5-7):
  // 미송, 미수 자동 답(정확 수량 검사가 빈 검사가 되지 않게)과 사람 넘김 줄
  list.push(
    room(
      33,
      0,
      at(60 * 3),
      [
        { sender: "RETAILER", body: "다른 도매처 방", sentAt: at(60 * 2) },
        {
          sender: "RETAILER",
          body: "블랙 L 미송 언제 와요?",
          sentAt: at(60 * 2 - 1),
        },
        {
          sender: "WHOLESALER",
          kind: "AUTO_REPLY",
          body: "블랙 L 미송 20장은 11월 3일 입고 예정이에요",
          sentAt: at(60 * 2 - 1),
          autoReply: {
            intent: "BACKORDER",
            replyToSequence: 2,
            generatedBy: "RULE",
            checkedAt: at(60 * 2 - 1),
            subject: {
              listingId: null,
              variantId: null,
              backorderId: 801,
              label: "코튼 셔츠 블랙 / L",
            },
            facts: {
              stock: null,
              backorder: {
                qty: 20,
                expectedInboundDate: "2026-11-03",
                expectedInboundReason: null,
              },
              receivable: null,
            },
          },
        },
        {
          sender: "RETAILER",
          body: "제 미수 얼마예요?",
          sentAt: at(60 * 2 - 2),
        },
        {
          sender: "WHOLESALER",
          kind: "AUTO_REPLY",
          body: "갚을 돈 52,000원이에요. 기한 지난 것은 없어요",
          sentAt: at(60 * 2 - 2),
          autoReply: {
            intent: "RECEIVABLE",
            replyToSequence: 4,
            generatedBy: "RULE",
            checkedAt: at(60 * 2 - 2),
            subject: {
              listingId: null,
              variantId: null,
              backorderId: null,
              label: null,
            },
            facts: {
              stock: null,
              backorder: null,
              receivable: {
                outstandingAmount: 52_000,
                prepaidAmount: 0,
                overdue: { count: 0, amount: 0, maxDaysOverdue: 0 },
              },
            },
          },
        },
        {
          sender: "RETAILER",
          body: "조금 깎아 주세요",
          sentAt: at(60 * 2 - 3),
        },
        {
          sender: "SYSTEM",
          kind: "HANDOFF",
          body: "자동 답변이 답하지 못했어요. 직접 답해 주세요",
          sentAt: at(60 * 2 - 3),
        },
      ],
      { wholesaler: 0, retailer: 7 },
      102,
    ),
  );

  return list;
}

function seedIdempotency() {
  idempotency.clear();
  const r = rooms.find((x) => x.roomId === 6);
  const message = r?.messages.find(
    (m) => m.clientMessageId === CHAT_SEED_REPLAY_KEY,
  );
  if (r === undefined || message === undefined) return;
  const result: ChatSendResult = {
    message,
    generatedMessages: [],
    generation: "NONE",
  };
  idempotency.set(keyOf(r.roomId, CHAT_SEED_REPLAY_KEY), {
    bodyHash: hashOf({ body: message.body, inquiry: null }),
    ready: Promise.resolve(),
    result,
  });
}

/* --- 계산 (계약 §5-2 계산 규칙) ---------------------------------------- */

function codePoints(text: string): number {
  return [...text].length;
}

function maxSequence(r: MockRoom): number {
  return r.messages.at(-1)?.sequence ?? 0;
}

/** 도매 기준 미확인 = RETAILER가 보낸 것 중 읽음 위치 초과분. SYSTEM은 세지 않는다 */
function unreadCount(r: MockRoom): number {
  return r.messages.filter(
    (m) => m.sender === "RETAILER" && m.sequence > r.wholesalerLastRead,
  ).length;
}

/** HANDOFF 뒤 WHOLESALER TEXT가 없다. AUTO_REPLY, CLARIFY로는 닫히지 않는다 */
function openHandoff(r: MockRoom): boolean {
  let open = false;
  for (const m of r.messages) {
    if (m.kind === "HANDOFF") open = true;
    else if (m.sender === "WHOLESALER" && m.kind === "TEXT") open = false;
  }
  return open;
}

function lastActivityAt(r: MockRoom): string {
  return r.messages.at(-1)?.sentAt ?? r.createdAt;
}

function summaryOf(r: MockRoom): ChatRoomSummary {
  const last = r.messages.at(-1);
  const handoff = openHandoff(r);
  return {
    roomId: r.roomId,
    counterpart: { id: r.retailerId, name: r.retailerName },
    lastMessage:
      last === undefined
        ? null
        : {
            sequence: last.sequence,
            sender: last.sender,
            kind: last.kind,
            preview: [...last.body.replace(/\s*\n\s*/g, " ")]
              .slice(0, PREVIEW_MAX)
              .join(""),
            sentAt: last.sentAt,
          },
    lastActivityAt: lastActivityAt(r),
    unreadCount: unreadCount(r),
    myLastReadSequence: r.wholesalerLastRead,
    needsReply:
      handoff || (last?.sender === "RETAILER" && last.kind === "TEXT"),
    openHandoff: handoff,
  };
}

function detailOf(r: MockRoom): ChatRoomDetail {
  return {
    ...summaryOf(r),
    counterpartLastReadSequence: r.retailerLastRead,
  };
}

/** 정렬 `lastActivityAt` desc, `roomId` desc. 커서는 이 순서의 한 지점이다 */
function compareRooms(a: MockRoom, b: MockRoom): number {
  const diff = Date.parse(lastActivityAt(b)) - Date.parse(lastActivityAt(a));
  return diff !== 0 ? diff : b.roomId - a.roomId;
}

/** 불투명 커서. FE는 열지 않는다 — 모양이 바뀌어도 FE가 깨지지 않게 base64로 감싼다 */
function encodeCursor(r: MockRoom): string {
  return btoa(`${Date.parse(lastActivityAt(r))}|${r.roomId}`);
}

function decodeCursor(
  cursor: string,
): { activityMs: number; roomId: number } | null {
  let raw: string;
  try {
    raw = atob(cursor);
  } catch {
    return null;
  }
  const match = /^(\d+)\|(\d+)$/.exec(raw);
  if (match === null) return null;
  return { activityMs: Number(match[1]), roomId: Number(match[2]) };
}

function myRoom(roomId: number): MockRoom | undefined {
  return rooms.find(
    (r) => r.roomId === roomId && r.wholesalerId === CHAT_ME_WHOLESALER_ID,
  );
}

function keyOf(roomId: number, key: string): string {
  return `${roomId}:WHOLESALER:${key}`;
}

/** 키 재사용 판정(`IDEMPOTENCY_KEY_REUSED`)에만 쓴다. 본문과 문맥을 같이 본다 */
function hashOf(body: { body: unknown; inquiry: unknown }): string {
  return JSON.stringify([body.body, body.inquiry ?? null]);
}

/* --- 자동 답 (loop-05b) -------------------------------------------------- */

/** 판정이 읽는 상품. 상품 목 시드 + 채팅 목 전용 게시글(`../chat/extraListings.ts`) */
function chatCatalog(listingId: number): InquiryListing | null {
  return (
    chatStockListing(listingId) ??
    CHAT_EXTRA_LISTINGS.find((l) => l.listingId === listingId) ??
    null
  );
}

function settingsFor(wholesalerId: number): AutoReplySettings {
  return wholesalerId === CHAT_ME_WHOLESALER_ID
    ? autoReplySettings
    : DEFAULT_AUTO_REPLY_SETTINGS;
}

/**
 * 방금 넣은 소매 메시지에 자동 답을 붙인다. 소매 목 보내기와 도매 `incoming` 주입이 같이 부른다.
 * 판정은 `../chat/inquiry.ts`(순수), 여기는 저장소에 줄을 넣기만 한다.
 *
 * 넘김 줄은 방에 이미 열린 넘김이 있으면 또 넣지 않는다 — 사장이 답하기 전까지 소매가 쓰는 글마다
 * "사장님께 전달했어요"가 쌓이면 대화가 그 줄로 덮인다. 자동 답(재고 구간)은 그래도 붙는다.
 * 단 답 + 넘김 두 줄(재고 0, loop-06의 미송 입고일 미정과 지남)의 넘김 줄은 예외로 늘 붙인다(D34, 디자인 결정 27,
 * loop-06 §4-2 6) — 소매 카드는 바로 아래 넘김 줄이
 * 있어야 "사장님이 미송 여부를 답한다"가 보이고, 그 줄이 없으면 담기도 막힌 채 답이 끝난 것처럼 보인다.
 *
 * 판정이 던지면(목 버그) 오류가 아니라 넘김이다(§5-2): 소매는 답 대신 "전달했어요"를 본다.
 */
function runAutoReply(r: MockRoom, message: ChatMessage): ChatMessage[] {
  const now = Date.now();
  const history = r.messages.filter((m) => m.sequence < message.sequence);
  const alreadyOpen = openHandoff({ ...r, messages: history });
  let lines: ReturnType<typeof generatedLines>;
  try {
    lines = generatedLines(
      decideInquiry({
        body: message.body,
        inquiry: message.inquiry,
        now,
        wholesalerId: r.wholesalerId,
        retailerId: r.retailerId,
        today: seoulDate(now),
        settings: settingsFor(r.wholesalerId),
        context: r.context,
        history,
        catalog: chatCatalog,
        backorders: inquiryBackorders,
      }),
      message.sequence,
      now,
    );
  } catch {
    lines = generatedLines(
      { kind: "HANDOFF", reason: "NO_INTENT", intent: null },
      message.sequence,
      now,
    );
  }
  const sentAt = new Date(now).toISOString();
  // 답 + 넘김 두 줄(재고 0, 미송 입고일 미정, 지남)은 넘김 줄이 답의 일부다 — 열린 넘김이 있어도 붙인다
  const answerWithHandoff =
    lines.some((line) => line.kind === "AUTO_REPLY") &&
    lines.some((line) => line.kind === "HANDOFF");
  return lines
    .filter(
      (line) => !(line.kind === "HANDOFF" && alreadyOpen && !answerWithHandoff),
    )
    .map((line) =>
      append(r, {
        sender: line.sender,
        kind: line.kind,
        body: line.body,
        sentAt,
        clientMessageId: null,
        autoReply: line.autoReply,
      }),
    );
}

function setContext(r: MockRoom, listingId: number | null, ageMinutes = 0) {
  r.context =
    listingId === null
      ? null
      : { listingId, at: Date.now() - ageMinutes * MINUTE_MS };
}

/** PUT 본문 검사. 부분 수정이 없어서 칸이 하나라도 빠지면 400이다 */
function settingsErrors(input: unknown) {
  const errors: { field: string; code: string; message: string }[] = [];
  const body = (input ?? {}) as Partial<{
    enabled: unknown;
    intents: Record<string, unknown> | null;
  }>;
  if (typeof body.enabled !== "boolean")
    errors.push({
      field: "enabled",
      code: "NOT_BOOLEAN",
      message: "켜짐, 꺼짐 값이 필요합니다.",
    });
  if (
    typeof body.intents !== "object" ||
    body.intents === null ||
    Array.isArray(body.intents)
  ) {
    errors.push({
      field: "intents",
      code: "NOT_NULL",
      message: "의도별 설정이 필요합니다.",
    });
  } else {
    for (const key of ["STOCK", "BACKORDER", "RECEIVABLE"] as const) {
      if (typeof body.intents[key] !== "boolean")
        errors.push({
          field: `intents.${key}`,
          code: "NOT_BOOLEAN",
          message: "켜짐, 꺼짐 값이 필요합니다.",
        });
    }
  }
  return errors;
}

/**
 * 도매, 소매 목이 같이 올리는 손잡이(스펙에 없음). 둘 다 같은 저장소를 바꾼다.
 * - `POST /__mock/chat/rooms/{roomId}/context {listingId, ageMinutes = 0}` 방 상품 문맥을 박는다.
 *   `ageMinutes: 31`이면 지난 문맥(넘김), `listingId: null`이면 문맥 없음, 2901/2902는 목 전용 경계 상품
 * - `POST /__mock/chat/auto-reply {enabled, intents?}` 자동 답 켜고 끄기. 소매 탭은 도매 탭 스위치와
 *   상태를 나누지 않아서(브라우저마다 목) 이걸로 따로 맞춘다
 */
export const chatSharedKnobs = [
  http.post(
    "*/__mock/chat/rooms/:roomId/context",
    async ({ params, request }) => {
      const r = rooms.find((x) => x.roomId === Number(params.roomId));
      if (r === undefined) return fail(404);
      const input = (await request.json().catch(() => ({}))) as {
        listingId?: number | null;
        ageMinutes?: number;
      };
      if (input.listingId === undefined)
        return invalid("listingId", "NOT_NULL", "listingId가 필요합니다.");
      setContext(r, input.listingId, input.ageMinutes ?? 0);
      return HttpResponse.json({
        data: { roomId: r.roomId, context: r.context },
      });
    },
  ),

  http.post("*/__mock/chat/auto-reply", async ({ request }) => {
    const input = (await request
      .json()
      .catch(() => ({}))) as Partial<AutoReplySettings>;
    if (typeof input.enabled !== "boolean")
      return invalid("enabled", "NOT_BOOLEAN", "enabled(불린)가 필요합니다.");
    autoReplySettings = {
      enabled: input.enabled,
      intents: { ...autoReplySettings.intents, ...input.intents },
    };
    return HttpResponse.json({ data: autoReplySettings });
  }),
];

/* --- 응답 --------------------------------------------------------------- */

const CODE_BY_STATUS: Record<number, string> = {
  400: "VALIDATION_FAILED",
  401: "UNAUTHENTICATED",
  403: "NOT_APPROVED",
  404: "RESOURCE_NOT_FOUND",
  409: "IDEMPOTENCY_KEY_REUSED",
};

const MESSAGE_BY_STATUS: Record<number, string> = {
  400: "입력한 내용을 다시 확인해 주세요.",
  401: "로그인이 필요합니다.",
  403: "승인된 계정만 사용할 수 있습니다.",
  404: "대화를 찾을 수 없습니다.",
  409: "같은 Idempotency-Key로 다른 요청이 왔습니다.",
};

function fail(
  status: number,
  errors: { field: string; code: string; message: string }[] = [],
) {
  return HttpResponse.json(
    {
      code: CODE_BY_STATUS[status] ?? "INTERNAL_ERROR",
      message: MESSAGE_BY_STATUS[status] ?? "서버 오류가 발생했습니다.",
      errors,
      traceId: null,
    },
    { status },
  );
}

function invalid(field: string, code: string, message: string) {
  return fail(400, [{ field, code, message }]);
}

/** `/__mock/chat/fail`로 걸어 둔 실패. 걸려 있으면 1회 소모하고 그 응답을 돌려준다 */
function plannedFailure(op: ChatFailOp) {
  const plan = failPlan.get(op);
  if (plan === undefined || plan.times <= 0) return null;
  plan.times -= 1;
  if (plan.times === 0) failPlan.delete(op);
  return fail(plan.status);
}

/** 쿼리 정수. 없으면 `fallback`, 정수가 아니면 `NaN` */
function intParam(url: URL, name: string, fallback: number | null) {
  const raw = url.searchParams.get(name);
  if (raw === null || raw === "") return fallback;
  return /^-?\d+$/.test(raw) ? Number(raw) : Number.NaN;
}

/** `size` 쿼리. 없으면 기본값, 1~100 밖이거나 정수가 아니면 null(→ 400) */
function sizeOf(url: URL, fallback: number): number | null {
  const size = intParam(url, "size", fallback) ?? fallback;
  return Number.isNaN(size) || size < 1 || size > SIZE_MAX ? null : size;
}

function sizeInvalid() {
  return invalid("size", "OUT_OF_RANGE", "size는 1~100이어야 합니다.");
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/* --- 핸들러 ------------------------------------------------------------- */

/** 스펙 자동 핸들러 **앞에** 놓는다. 같은 경로면 이쪽이 이긴다 */
export const chatHandlers = [
  /** 자동 답 설정(초안 op `autoReplySettings`). 처음엔 전부 켜짐 */
  http.get("*/api/wholesale/chat/auto-reply-settings", () => {
    const planned = plannedFailure("settings");
    if (planned) return planned;
    return HttpResponse.json({ data: autoReplySettings });
  }),

  /**
   * 설정 바꾸기(초안 op `updateAutoReplySettings`). 통째로 바꾼다. 실패 손잡이는
   * `/__mock/chat/fail {op: "settings", status}` — GET, PUT이 같은 계획을 쓴다
   */
  http.put("*/api/wholesale/chat/auto-reply-settings", async ({ request }) => {
    const planned = plannedFailure("settings");
    if (planned) return planned;
    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return invalid("body", "INVALID_FORMAT", "JSON 본문이 아닙니다.");
    }
    const errors = settingsErrors(raw);
    if (errors.length > 0) return fail(400, errors);
    const input = raw as AutoReplySettings;
    autoReplySettings = {
      enabled: input.enabled,
      intents: {
        STOCK: input.intents.STOCK,
        BACKORDER: input.intents.BACKORDER,
        RECEIVABLE: input.intents.RECEIVABLE,
      },
    };
    await delay(CHAT_SEND_DELAY_MS);
    return HttpResponse.json({ data: autoReplySettings });
  }),

  http.get("*/api/wholesale/chat/rooms", ({ request }) => {
    const planned = plannedFailure("rooms");
    if (planned) return planned;
    const url = new URL(request.url);
    const size = sizeOf(url, ROOM_PAGE_DEFAULT);
    if (size === null) return sizeInvalid();

    const cursorRaw = url.searchParams.get("cursor");
    const cursor = cursorRaw === null ? null : decodeCursor(cursorRaw);
    if (cursorRaw !== null && cursor === null)
      return invalid("cursor", "INVALID_CURSOR", "cursor가 올바르지 않습니다.");

    const sorted = rooms
      .filter((r) => r.wholesalerId === CHAT_ME_WHOLESALER_ID)
      .sort(compareRooms);
    // 키셋: 커서 지점보다 정렬상 뒤에 오는 것부터. 그사이 순서가 바뀌어도 중복이 안 난다
    const rest =
      cursor === null
        ? sorted
        : sorted.filter((r) => {
            const ms = Date.parse(lastActivityAt(r));
            return (
              ms < cursor.activityMs ||
              (ms === cursor.activityMs && r.roomId < cursor.roomId)
            );
          });
    const page = rest.slice(0, size);
    const last = page.at(-1);
    const meta: WholesaleSchema<"CursorPageMeta"> = {
      nextCursor:
        rest.length > size && last !== undefined ? encodeCursor(last) : null,
    };
    return HttpResponse.json({ data: page.map(summaryOf), meta });
  }),

  http.get("*/api/wholesale/chat/rooms/:roomId", ({ params }) => {
    const planned = plannedFailure("room");
    if (planned) return planned;
    const r = myRoom(Number(params.roomId));
    if (r === undefined) return fail(404);
    return HttpResponse.json({ data: detailOf(r) });
  }),

  http.get(
    "*/api/wholesale/chat/rooms/:roomId/messages",
    ({ params, request }) => {
      const planned = plannedFailure("messages");
      if (planned) return planned;
      const r = myRoom(Number(params.roomId));
      if (r === undefined) return fail(404);

      const url = new URL(request.url);
      const size = sizeOf(url, MESSAGE_PAGE_DEFAULT);
      if (size === null) return sizeInvalid();
      const after = intParam(url, "afterSequence", null);
      const before = intParam(url, "beforeSequence", null);
      if (after !== null && before !== null)
        return invalid(
          "afterSequence",
          "MUTUALLY_EXCLUSIVE",
          "afterSequence와 beforeSequence는 같이 쓸 수 없습니다.",
        );
      if (after !== null && (Number.isNaN(after) || after < 0))
        return invalid("afterSequence", "OUT_OF_RANGE", "0 이상이어야 합니다.");
      if (before !== null && (Number.isNaN(before) || before < 1))
        return invalid(
          "beforeSequence",
          "OUT_OF_RANGE",
          "1 이상이어야 합니다.",
        );

      let data: ChatMessage[];
      let hasMore: boolean;
      if (after !== null) {
        const newer = r.messages.filter((m) => m.sequence > after);
        data = newer.slice(0, size);
        hasMore = newer.length > size;
      } else {
        const older =
          before === null
            ? r.messages
            : r.messages.filter((m) => m.sequence < before);
        data = older.slice(Math.max(older.length - size, 0));
        hasMore = older.length > size;
      }
      const meta: WholesaleSchema<"ChatMessagePageMeta"> = {
        hasMore,
        maxSequence: maxSequence(r),
        counterpartLastReadSequence: r.retailerLastRead,
      };
      return HttpResponse.json({ data, meta });
    },
  ),

  /**
   * 보내기. 검사 순서: 키 헤더(400) → 본문 형식(400) → 인증 손잡이(401, 403) → 방(404) →
   * 멱등(200 replay, 409) → 글자 수(400) → 500 손잡이 → 만들기 → `failAfterCommit` → 지연 → 201.
   *
   * 멱등을 글자 수보다 먼저 보는 이유: 같은 키에 다른 본문이면 그 본문이 규칙에 맞든 아니든 409가
   * 계약이다. 실서버라면 인증이 맨 앞이지만 목은 본문을 읽어야 손잡이를 알 수 있다.
   */
  http.post(
    "*/api/wholesale/chat/rooms/:roomId/messages",
    async ({ params, request }) => {
      const planned = plannedFailure("send");
      if (planned) return planned;
      const key = request.headers.get("Idempotency-Key");
      if (key === null || !UUID_PATTERN.test(key))
        return invalid(
          "Idempotency-Key",
          "INVALID_FORMAT",
          "Idempotency-Key 헤더(uuid)가 필요합니다.",
        );

      let raw: unknown;
      try {
        raw = await request.json();
      } catch {
        return invalid("body", "INVALID_FORMAT", "JSON 본문이 아닙니다.");
      }
      const input = (raw ?? {}) as Partial<
        WholesaleSchema<"SendChatMessageRequest">
      >;
      if (typeof input.body !== "string")
        return invalid("body", "NOT_BLANK", "메시지를 입력해 주세요.");
      const text = input.body.trim();

      if (text.includes(CHAT_BODY_HOOK.AUTH_401)) return fail(401);
      if (text.includes(CHAT_BODY_HOOK.AUTH_403)) return fail(403);

      const r = myRoom(Number(params.roomId));
      if (r === undefined) return fail(404);

      const storeKey = keyOf(r.roomId, key);
      const bodyHash = hashOf({ body: input.body, inquiry: input.inquiry });
      const known = idempotency.get(storeKey);
      if (known !== undefined) {
        if (known.bodyHash !== bodyHash) return fail(409);
        // 처음 요청이 아직 처리 중이면 끝날 때까지 기다린다 — 동시 요청도 1건만 만든다
        await known.ready;
        if (known.result !== null)
          return HttpResponse.json({ data: known.result }, { status: 200 });
      }

      if (text.length === 0)
        return invalid("body", "NOT_BLANK", "메시지를 입력해 주세요.");
      if (codePoints(text) > CHAT_BODY_MAX)
        return invalid("body", "TOO_LONG", "1,000자까지 보낼 수 있어요.");

      if (text.includes(CHAT_BODY_HOOK.FAIL_500_ONCE)) {
        if (!failedOnceKeys.has(storeKey)) {
          failedOnceKeys.add(storeKey);
          return fail(500);
        }
      } else if (
        !text.includes(CHAT_BODY_HOOK.FAIL_AFTER_COMMIT) &&
        text.includes(CHAT_BODY_HOOK.FAIL_500)
      ) {
        return fail(500);
      }

      // 여기부터 저장. await 없이 기록부터 남겨 같은 키 동시 요청이 이 기록을 보게 한다
      let settle: () => void = () => undefined;
      const record: IdempotencyRecord = {
        bodyHash,
        ready: new Promise<void>((resolve) => {
          settle = resolve;
        }),
        result: null,
      };
      idempotency.set(storeKey, record);

      const message = append(r, {
        sender: "WHOLESALER",
        kind: "TEXT",
        body: text,
        sentAt: new Date().toISOString(),
        clientMessageId: key,
        inquiry: input.inquiry ?? null,
      });
      // 내가 보낸 것까지는 읽은 것이다
      r.wholesalerLastRead = Math.max(r.wholesalerLastRead, message.sequence);
      record.result = { message, generatedMessages: [], generation: "NONE" };

      await delay(
        text.includes(CHAT_BODY_HOOK.SLOW_5S)
          ? CHAT_SLOW_MS
          : CHAT_SEND_DELAY_MS,
      );
      settle();
      if (text.includes(CHAT_BODY_HOOK.FAIL_AFTER_COMMIT)) return fail(500);
      return HttpResponse.json({ data: record.result }, { status: 201 });
    },
  ),

  http.post(
    "*/api/wholesale/chat/rooms/:roomId/read",
    async ({ params, request }) => {
      const planned = plannedFailure("read");
      if (planned) return planned;
      const r = myRoom(Number(params.roomId));
      if (r === undefined) return fail(404);
      const input = (await request.json().catch(() => ({}))) as Partial<
        WholesaleSchema<"MarkChatReadRequest">
      >;
      const seq = input.lastReadSequence;
      if (
        typeof seq !== "number" ||
        !Number.isInteger(seq) ||
        seq < 0 ||
        seq > maxSequence(r)
      )
        return invalid(
          "lastReadSequence",
          "OUT_OF_RANGE",
          "방에 없는 sequence입니다.",
        );
      // 내려가지 않는다. 계산과 저장 사이에 await가 없어 원자적이다
      r.wholesalerLastRead = Math.max(r.wholesalerLastRead, seq);
      const data: WholesaleSchema<"ChatReadResult"> = {
        roomId: r.roomId,
        lastReadSequence: r.wholesalerLastRead,
        unreadCount: unreadCount(r),
      };
      return HttpResponse.json({ data });
    },
  ),

  /* --- 시험 손잡이 (목 전용, 스펙에 없음) ------------------------------- */

  /**
   * 소매 메시지 주입. `{body, count?, intent?, contextListingId?}` → count개를 이어서 넣는다. e2e가 polling을 만드는 입구.
   *
   * `contextListingId`가 있으면(숫자 또는 null) 방 문맥을 그 값으로 바꾸고, 넣은 메시지에 **자동 답을 붙인다**
   * (count 1일 때만, loop-05b S9-3 장면 5, 6). 없으면 예전처럼 메시지만 넣는다 — loop-04 e2e가 세는 메시지 수를
   * 바꾸지 않으려고 자동 답을 켜는 쪽을 명시로 두었다
   */
  http.post(
    "*/__mock/chat/rooms/:roomId/incoming",
    async ({ params, request }) => {
      const r = rooms.find((x) => x.roomId === Number(params.roomId));
      if (r === undefined) return fail(404);
      const input = (await request.json().catch(() => ({}))) as {
        body?: string;
        count?: number;
        intent?: ChatIntent;
        contextListingId?: number | null;
        autoReply?: boolean;
        inquiry?: Partial<ChatInquiry> & { intent: ChatIntent };
      };
      const count = Math.max(1, Math.min(input.count ?? 1, 500));
      const base = input.body ?? "새 문의예요";
      // `autoReply: true`는 방 문맥을 안 바꾸고 판정만 돌린다(loop-06 §5-4 5, 미송은 상품 문맥이 필요 없다)
      const generate =
        (input.contextListingId !== undefined || input.autoReply === true) &&
        count === 1;
      if (input.contextListingId !== undefined)
        setContext(r, input.contextListingId);
      // `inquiry`는 칩 주입(미송 칩 `{intent: BACKORDER, backorderId}`, `{notListed: true}`). 없으면 예전처럼 intent만
      const inquiry: ChatInquiry | null =
        input.inquiry !== undefined
          ? {
              intent: input.inquiry.intent,
              listingId: input.inquiry.listingId ?? null,
              variantId: input.inquiry.variantId ?? null,
              backorderId: input.inquiry.backorderId ?? null,
              label: input.inquiry.label ?? null,
              ...(input.inquiry.notListed === undefined
                ? {}
                : { notListed: input.inquiry.notListed }),
            }
          : input.intent === undefined
            ? null
            : {
                intent: input.intent,
                listingId: null,
                variantId: null,
                backorderId: null,
                label: null,
              };
      const created: ChatMessage[] = [];
      for (let i = 1; i <= count; i++) {
        created.push(
          append(r, {
            sender: "RETAILER",
            body: count === 1 ? base : `${base} ${i}`,
            sentAt: new Date().toISOString(),
            inquiry,
          }),
        );
      }
      const first = created[0];
      if (generate && first !== undefined)
        created.push(...runAutoReply(r, first));
      return HttpResponse.json({ data: created }, { status: 201 });
    },
  ),

  /** 다음 n회 실패. `{op, status = 500, times = 1}`. 메시지 조회 500(S3-9), backoff(S3-6)용 */
  http.post("*/__mock/chat/fail", async ({ request }) => {
    const input = (await request.json().catch(() => ({}))) as {
      op?: string;
      status?: number;
      times?: number;
    };
    const op = CHAT_FAIL_OPS.find((o) => o === input.op);
    if (op === undefined)
      return invalid("op", "INVALID", `op는 ${CHAT_FAIL_OPS.join(" | ")}`);
    failPlan.set(op, { status: input.status ?? 500, times: input.times ?? 1 });
    return HttpResponse.json({ data: { op, ...failPlan.get(op) } });
  }),

  /** 시드로 되돌린다. `{rooms: 0}`이면 내 방을 비운다(빈 상태), `{rooms: n}`이면 최근 n개만 */
  http.post("*/__mock/chat/reset", async ({ request }) => {
    const input = (await request.json().catch(() => ({}))) as {
      rooms?: number;
      noBackorders?: boolean;
    };
    resetChatMock(input.rooms, { noBackorders: input.noBackorders === true });
    return HttpResponse.json({
      data: {
        rooms: rooms.filter((r) => r.wholesalerId === CHAT_ME_WHOLESALER_ID)
          .length,
      },
    });
  }),

  ...chatSharedKnobs,
];

/** 시드로 되돌린다. `keepRooms`를 주면 내 방은 최근 그 개수만 남긴다. 테스트와 `/__mock/chat/reset`이 부른다 */
export function resetChatMock(
  keepRooms?: number,
  options: { noBackorders?: boolean } = {},
) {
  rooms = seedRooms();
  // 미송 자동 답의 후보 원본도 시드로. 입고 예정일이 reset 시각 기준 상대값이라 같이 돌린다(loop-06 §5-4 3)
  resetBackorderMock({ empty: options.noBackorders === true });
  if (keepRooms !== undefined) {
    const keep = new Set(
      rooms
        .filter((r) => r.wholesalerId === CHAT_ME_WHOLESALER_ID)
        .sort(compareRooms)
        .slice(0, Math.max(keepRooms, 0))
        .map((r) => r.roomId),
    );
    rooms = rooms.filter(
      (r) => r.wholesalerId !== CHAT_ME_WHOLESALER_ID || keep.has(r.roomId),
    );
  }
  seedIdempotency();
  failedOnceKeys.clear();
  failPlan.clear();
  autoReplySettings = structuredClone(DEFAULT_AUTO_REPLY_SETTINGS);
  // 방 1은 빈티지 플라워 셔츠(2001)에서 연 방이다. 문맥 시각은 reset 시각 — 시드 메시지 시각(10/28 고정)으로
  // 박으면 늘 30분이 지나 시연 장면 2가 넘김으로 끝난다
  const first = rooms.find((r) => r.roomId === 1);
  if (first !== undefined) setContext(first, 2001);
}

resetChatMock();

/**
 * 내 방 중 `needsReply`가 true인 방 수. 알림 목(`./notification`)의 `chatsNeedingReply`가 부른다 —
 * 방 목록 `needsReply`와 같은 `summaryOf`를 지나게 해 두 숫자가 갈라지지 않게 한다(loop-05b2 §5-4 2)
 */
export function chatsNeedingReplyCount(): number {
  return rooms.filter(
    (r) => r.wholesalerId === CHAT_ME_WHOLESALER_ID && summaryOf(r).needsReply,
  ).length;
}

/* --- 소매 목이 같이 쓰는 것 (README "채팅 목": 방 id 체계는 하나다) -------- */

export type { MockRoom as ChatMockRoom, IdempotencyRecord };

/**
 * 소매 핸들러(`../retail/chat.ts`)가 읽고 쓰는 저장소 입구. 시드를 두 벌 짓지 않으려고 여기서 꺼낸다.
 * `rooms`는 reset마다 새 배열이라 값이 아니라 함수로 준다.
 */
export const chatStore = {
  rooms: () => rooms,
  /** 새 방. 번호는 지금 가장 큰 roomId + 1(시드 뒤 첫 방은 34) */
  addRoom(wholesalerId: number, retailerId: number): MockRoom {
    const roomId = rooms.reduce((max, r) => Math.max(max, r.roomId), 0) + 1;
    const r = room(
      roomId,
      retailerId - 1,
      new Date().toISOString(),
      [],
      { wholesaler: 0, retailer: null },
      wholesalerId,
    );
    rooms.push(r);
    return r;
  },
  /** 그 소매처의 방을 지운다. 소매 `reset {empty}`(목록 빈 상태, loop-06 S2-4)용 */
  removeRetailerRooms(retailerId: number) {
    rooms = rooms.filter((r) => r.retailerId !== retailerId);
  },
  append,
  runAutoReply,
  setContext,
  catalog: chatCatalog,
  maxSequence,
  openHandoff,
  lastActivityAt,
  codePoints,
  hashOf,
  intParam,
  sizeOf,
  sizeInvalid,
  idempotency,
  UUID_PATTERN,
  MESSAGE_PAGE_DEFAULT,
} as const;
