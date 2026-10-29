import { delay, http, HttpResponse } from "msw";
import type { RetailSchema } from "../../retail";
import type { WholesaleSchema } from "../../wholesale";
import { orderableOf } from "../chat/inquiry";
import {
  CHAT_BODY_HOOK,
  CHAT_BODY_MAX,
  CHAT_SEND_DELAY_MS,
  CHAT_SLOW_MS,
  chatSharedKnobs,
  chatStore,
  resetChatMock,
  type ChatMockRoom,
  type IdempotencyRecord,
} from "../wholesale/chat";
import { recordMockPayment } from "../wholesale/settlement";

/**
 * 소매 채팅 목 — 초안 op 6개(#263, `openapi/retail.json` `x-ondo-draft`). loop-05a `01-plan.md` §5-2.
 *
 * **시드와 저장소는 도매 목(`../wholesale/chat.ts`)의 것을 그대로 쓴다**(README "채팅 목" — 방 id 체계는
 * 하나다). 이 파일은 같은 방을 소매 쪽에서 보는 창문이다. 다른 점은 셋:
 * - "나" = 봄봄상회(retailerId 1). 보이는 방은 1(도매처 101)과 33(도매처 102). 나머지는 남의 방이라 404
 * - 오류 코드가 소매 어휘다(401 `UNAUTHORIZED`, 403 `ACCOUNT_NOT_APPROVED`)
 * - 응답의 `autoReply.facts`는 `ChatRetailFacts`로 바꿔 싣는다. **정확 수량(`availableQty`)은 응답 JSON에
 *   나타나지 않는다**(D31②) — 화면에서 가리는 게 아니라 싣지 않는다
 *
 * 05b(loop-05b §4-2): 보내기가 자동 답을 붙인다. 판정은 `../chat/inquiry.ts`, 저장은 도매 목의
 * `chatStore.runAutoReply` — 도매 `incoming` 주입과 같은 함수다. 결과는 보내기 응답 `generatedMessages`에 실린다.
 *
 * 목은 앱마다 브라우저 안에 산다. 도매 탭과 소매 탭은 상태를 나누지 않는다 — "도매가 답한다"는
 * `/__mock/chat/rooms/{id}/incoming`(이 앱에선 sender=WHOLESALER)으로 흉내 낸다.
 */

type ChatMessage = RetailSchema<"ChatMessage">;
type WholesaleMessage = WholesaleSchema<"ChatMessage">;
type ChatRoomSummary = RetailSchema<"ChatRoomSummary">;
type ChatSendResult = RetailSchema<"ChatSendResult">;
type ChatRetailFacts = RetailSchema<"ChatRetailFacts">;
type ChatMessageKind = RetailSchema<"ChatMessageKind">;

/** 세션 없는 목의 "나". 주문, 미송 목과 같은 id */
export const CHAT_ME_RETAILER_ID = 1;

/**
 * 대화할 수 있는 도매처. 이름은 소매 e2e 가짜 API(`e2e/side-02/retail/stub-api.ts`)의 상품과 맞춘다.
 * 103은 30자 상호다 — 방 머리 말줄임(S5-15)을 이 방 하나로 본다. 이 표에 없는 id는 404(없는 도매처).
 */
export const CHAT_WHOLESALERS: Readonly<Record<number, string>> = {
  101: "무드온",
  102: "라온",
  103: "코튼클럽 동대문 신평화패션타운 삼층 본점 직영 도매상회",
};

/**
 * `/__mock/chat/fail`이 고르는 op. 도매 목과 같은 이름 + `create`(방 만들기) + `count`(헤더 배지
 * `notificationUnreadCount`, loop-06)
 */
export const RETAIL_CHAT_FAIL_OPS = [
  "rooms",
  "room",
  "messages",
  "send",
  "read",
  "create",
  "count",
  /** 미수 자동 답의 정산 원본 조회(loop-07 S1-9). 저장소가 하나라 도매 목 계획에 건다 */
  "receivable",
] as const;
type FailOp = (typeof RETAIL_CHAT_FAIL_OPS)[number];

/** `/__mock/chat/delay`가 고르는 op. 응답 순서 역전(늦은 count가 읽음 뒤에 도착)을 만드는 둘 */
export const RETAIL_CHAT_DELAY_OPS = ["count", "read"] as const;
type DelayOp = (typeof RETAIL_CHAT_DELAY_OPS)[number];

const failPlan = new Map<FailOp, { status: number; times: number }>();
const delayPlan = new Map<DelayOp, { ms: number; times: number }>();
const failedOnceKeys = new Set<string>();

/* --- 계산 --------------------------------------------------------------- */

function myRoom(roomId: number): ChatMockRoom | undefined {
  return chatStore
    .rooms()
    .find((r) => r.roomId === roomId && r.retailerId === CHAT_ME_RETAILER_ID);
}

function wholesalerName(wholesalerId: number): string {
  return CHAT_WHOLESALERS[wholesalerId] ?? `도매처 ${wholesalerId}`;
}

/** 소매 기준 미확인 = 도매 쪽이 보낸 것(사람 답, 자동 답) 중 내 읽음 위치 초과분. SYSTEM은 세지 않는다 */
function unreadCount(r: ChatMockRoom): number {
  const read = r.retailerLastRead ?? 0;
  return r.messages.filter(
    (m) => m.sender === "WHOLESALER" && m.sequence > read,
  ).length;
}

/**
 * 저장소의 도매 facts를 소매 응답 모양으로. 키를 골라 새 객체를 만든다 — 지우는 방식이면 새 필드가 샌다.
 * `orderable`은 수량과 무관하다(게시 중 + 게시된 옵션). 도매 facts에 그 칸이 없어 대상을 다시 찾는다
 */
function toRetailFacts(
  autoReply: NonNullable<WholesaleMessage["autoReply"]>,
): ChatRetailFacts {
  const facts = autoReply.facts;
  return {
    stock:
      facts.stock === null
        ? null
        : {
            band: facts.stock.band,
            orderLimit: facts.stock.orderLimit,
            orderable: orderableOf(chatStore.catalog, autoReply.subject),
          },
    backorder:
      facts.backorder === null
        ? null
        : {
            qty: facts.backorder.qty,
            expectedInboundDate: facts.backorder.expectedInboundDate,
            expectedInboundReason: facts.backorder.expectedInboundReason,
          },
    receivable:
      facts.receivable === null
        ? null
        : {
            outstandingAmount: facts.receivable.outstandingAmount,
            prepaidAmount: facts.receivable.prepaidAmount,
            overdue: { ...facts.receivable.overdue },
          },
  };
}

/**
 * 저장소 메시지 → 소매 응답. 키를 골라 새 객체를 만든다(`toRetailFacts`와 같은 이유). 넘김 이유(`handoff`)는 도매
 * 응답에만 있는 칸이라 싣지 않는다(loop-07 §3 out 4, D31②와 같은 방식: 화면에서 가리는 게 아니라 안 싣는다)
 */
function toRetailMessage(m: WholesaleMessage): ChatMessage {
  return {
    id: m.id,
    roomId: m.roomId,
    sequence: m.sequence,
    clientMessageId: m.clientMessageId,
    sender: m.sender,
    kind: m.kind,
    body: m.body,
    sentAt: m.sentAt,
    inquiry: m.inquiry,
    autoReply:
      m.autoReply === null
        ? null
        : {
            ...m.autoReply,
            facts: toRetailFacts(m.autoReply),
            choices: m.autoReply.choices ?? null,
          },
  };
}

function summaryOf(r: ChatMockRoom): ChatRoomSummary {
  const last = r.messages.at(-1);
  const handoff = chatStore.openHandoff(r);
  return {
    roomId: r.roomId,
    counterpart: { id: r.wholesalerId, name: wholesalerName(r.wholesalerId) },
    lastMessage:
      last === undefined
        ? null
        : {
            sequence: last.sequence,
            sender: last.sender,
            kind: last.kind,
            preview: [...last.body.replace(/\s*\n\s*/g, " ")]
              .slice(0, 80)
              .join(""),
            sentAt: last.sentAt,
          },
    lastActivityAt: chatStore.lastActivityAt(r),
    unreadCount: unreadCount(r),
    myLastReadSequence: r.retailerLastRead ?? 0,
    needsReply:
      handoff || (last?.sender === "RETAILER" && last.kind === "TEXT"),
    openHandoff: handoff,
  };
}

/** 키 범위는 (방, 보낸 사업체). 도매 목의 `${roomId}:WHOLESALER:${key}`와 겹치지 않는다 */
function keyOf(roomId: number, key: string): string {
  return `${roomId}:RETAILER:${key}`;
}

/* --- 응답 --------------------------------------------------------------- */

const CODE_BY_STATUS: Record<number, string> = {
  400: "VALIDATION_FAILED",
  401: "UNAUTHORIZED",
  403: "ACCOUNT_NOT_APPROVED",
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

function plannedFailure(op: FailOp) {
  const plan = failPlan.get(op);
  if (plan === undefined || plan.times <= 0) return null;
  plan.times -= 1;
  if (plan.times === 0) failPlan.delete(op);
  return fail(plan.status);
}

/**
 * 걸어 둔 지연. **응답 값을 정한 뒤에** 기다린다 — 그래야 "먼저 시작한 count가 읽음 뒤에 옛 숫자로 도착"을
 * 만들 수 있다(S2-6). 도매 알림 목(`../wholesale/notification.ts`)과 같은 규칙
 */
async function plannedDelay(op: DelayOp) {
  const plan = delayPlan.get(op);
  if (plan === undefined || plan.times <= 0) return;
  plan.times -= 1;
  if (plan.times === 0) delayPlan.delete(op);
  await delay(plan.ms);
}

/** 헤더 채팅 배지 = 내 방 unreadCount 합. 방 목록과 같은 `unreadCount`를 지나 두 숫자가 갈라지지 않는다 */
function myUnreadChats(): number {
  return chatStore
    .rooms()
    .filter((r) => r.retailerId === CHAT_ME_RETAILER_ID)
    .reduce((sum, r) => sum + unreadCount(r), 0);
}

/* --- 핸들러 ------------------------------------------------------------- */

/**
 * 소매 브라우저 worker(`../browser.ts` `startRetailChatWorker`)에 이것만 올린다. 다른 소매 요청은
 * 서버 컴포넌트가 부르거나 프록시를 지나 실서버(e2e에선 가짜 API 3199)로 간다.
 */
export const retailChatHandlers = [
  /**
   * 헤더 배지 둘(초안 op `notificationUnreadCount`, loop-06). `notifications`는 알림 목이 06b라 늘 0.
   * 소매 worker에 올라가야 해서 알림 목이 아니라 여기 둔다(`../browser.ts`는 채팅 핸들러만 올린다)
   */
  http.get("*/api/retail/notifications/unread-count", async () => {
    const planned = plannedFailure("count");
    if (planned) return planned;
    const data: RetailSchema<"RetailUnreadCount"> = {
      notifications: 0,
      chats: myUnreadChats(),
      // 06b 가 새 알림을 이 id 로 안다. 06a 목에는 알림이 없다
      latestNotificationId: null,
    };
    await plannedDelay("count");
    return HttpResponse.json({ data });
  }),

  /** 목록. 05a 화면은 안 부른다(방 목록은 05b). "나"의 방이 두세 개라 한 장으로 끝낸다(nextCursor null) */
  http.get("*/api/retail/chat/rooms", ({ request }) => {
    const planned = plannedFailure("rooms");
    if (planned) return planned;
    const size = chatStore.sizeOf(new URL(request.url), 30);
    if (size === null) return chatStore.sizeInvalid();
    const mine = chatStore
      .rooms()
      .filter((r) => r.retailerId === CHAT_ME_RETAILER_ID)
      .sort((a, b) => {
        const diff =
          Date.parse(chatStore.lastActivityAt(b)) -
          Date.parse(chatStore.lastActivityAt(a));
        return diff !== 0 ? diff : b.roomId - a.roomId;
      });
    return HttpResponse.json({
      data: mine.slice(0, size).map(summaryOf),
      meta: { nextCursor: null },
    });
  }),

  /**
   * 방 만들기(멱등). 쌍이 있으면 그 방 200, 없으면 다음 번호로 201(계약 §5-1). `listingId`는 방을
   * 가르지 않는다 — 다른 상품에서 같은 도매처에 물어도 같은 방이다(01-plan §4-1 3).
   * 대신 방의 상품 문맥을 이 값과 지금 시각으로 바꾼다(200, 201 둘 다, null이면 지운다. loop-05b S7-12)
   */
  http.post("*/api/retail/chat/rooms", async ({ request }) => {
    const planned = plannedFailure("create");
    if (planned) return planned;
    const input = (await request.json().catch(() => ({}))) as Partial<
      RetailSchema<"CreateChatRoomRequest">
    >;
    const wholesalerId = input.wholesalerId;
    if (typeof wholesalerId !== "number" || !Number.isInteger(wholesalerId))
      return invalid("wholesalerId", "NOT_NULL", "도매처를 골라 주세요.");
    if (input.listingId === undefined)
      return invalid("listingId", "NOT_NULL", "listingId가 필요합니다.");
    if (CHAT_WHOLESALERS[wholesalerId] === undefined) return fail(404);

    const known = chatStore
      .rooms()
      .find(
        (r) =>
          r.wholesalerId === wholesalerId &&
          r.retailerId === CHAT_ME_RETAILER_ID,
      );
    if (known !== undefined) {
      chatStore.setContext(known, input.listingId);
      return HttpResponse.json(
        {
          data: {
            ...summaryOf(known),
            counterpartLastReadSequence: known.wholesalerLastRead,
          },
        },
        { status: 200 },
      );
    }
    const created = chatStore.addRoom(wholesalerId, CHAT_ME_RETAILER_ID);
    chatStore.setContext(created, input.listingId);
    return HttpResponse.json(
      { data: { ...summaryOf(created), counterpartLastReadSequence: 0 } },
      { status: 201 },
    );
  }),

  http.get("*/api/retail/chat/rooms/:roomId", ({ params }) => {
    const planned = plannedFailure("room");
    if (planned) return planned;
    const r = myRoom(Number(params.roomId));
    if (r === undefined) return fail(404);
    return HttpResponse.json({
      data: {
        ...summaryOf(r),
        counterpartLastReadSequence: r.wholesalerLastRead,
      },
    });
  }),

  http.get(
    "*/api/retail/chat/rooms/:roomId/messages",
    ({ params, request }) => {
      const planned = plannedFailure("messages");
      if (planned) return planned;
      const r = myRoom(Number(params.roomId));
      if (r === undefined) return fail(404);

      const url = new URL(request.url);
      const size = chatStore.sizeOf(url, chatStore.MESSAGE_PAGE_DEFAULT);
      if (size === null) return chatStore.sizeInvalid();
      const after = chatStore.intParam(url, "afterSequence", null);
      const before = chatStore.intParam(url, "beforeSequence", null);
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

      let page: WholesaleMessage[];
      let hasMore: boolean;
      if (after !== null) {
        const newer = r.messages.filter((m) => m.sequence > after);
        page = newer.slice(0, size);
        hasMore = newer.length > size;
      } else {
        const older =
          before === null
            ? r.messages
            : r.messages.filter((m) => m.sequence < before);
        page = older.slice(Math.max(older.length - size, 0));
        hasMore = older.length > size;
      }
      return HttpResponse.json({
        data: page.map(toRetailMessage),
        meta: {
          hasMore,
          maxSequence: chatStore.maxSequence(r),
          counterpartLastReadSequence: r.wholesalerLastRead,
        },
      });
    },
  ),

  /**
   * 보내기. 검사 순서는 도매 목과 같다: 키 헤더 → 본문 형식 → 인증 손잡이 → 방 → 멱등 → 글자 수 →
   * 500 손잡이 → 만들기 → 자동 답 → `failAfterCommit` → 지연 → 201.
   *
   * 자동 답은 요청 안에서 동기로 만든다(`generation: DONE`, §4-3). 멱등 replay는 처음 결과를 그대로
   * 돌려준다 — 자동 답의 id, sequence, `checkedAt`도 처음 값이다(S7-10). 넘김이 이미 열려 있어 붙일 줄이
   * 없으면 `NONE`.
   */
  http.post(
    "*/api/retail/chat/rooms/:roomId/messages",
    async ({ params, request }) => {
      const planned = plannedFailure("send");
      if (planned) return planned;
      const key = request.headers.get("Idempotency-Key");
      if (key === null || !chatStore.UUID_PATTERN.test(key))
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
        RetailSchema<"SendChatMessageRequest">
      >;
      if (typeof input.body !== "string")
        return invalid("body", "NOT_BLANK", "메시지를 입력해 주세요.");
      const text = input.body.trim();

      if (text.includes(CHAT_BODY_HOOK.AUTH_401)) return fail(401);
      if (text.includes(CHAT_BODY_HOOK.AUTH_403)) return fail(403);

      const r = myRoom(Number(params.roomId));
      if (r === undefined) return fail(404);

      const storeKey = keyOf(r.roomId, key);
      const bodyHash = chatStore.hashOf({
        body: input.body,
        inquiry: input.inquiry,
      });
      const known = chatStore.idempotency.get(storeKey);
      if (known !== undefined) {
        if (known.bodyHash !== bodyHash) return fail(409);
        await known.ready;
        if (known.result !== null)
          return HttpResponse.json(
            { data: toRetailResult(known.result) },
            { status: 200 },
          );
      }

      if (text.length === 0)
        return invalid("body", "NOT_BLANK", "메시지를 입력해 주세요.");
      if (chatStore.codePoints(text) > CHAT_BODY_MAX)
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

      let settle: () => void = () => undefined;
      const record: IdempotencyRecord = {
        bodyHash,
        ready: new Promise<void>((resolve) => {
          settle = resolve;
        }),
        result: null,
      };
      chatStore.idempotency.set(storeKey, record);

      const message = chatStore.append(r, {
        sender: "RETAILER",
        kind: "TEXT",
        body: text,
        sentAt: new Date().toISOString(),
        clientMessageId: key,
        inquiry: input.inquiry ?? null,
      });
      // 내가 보낸 것까지는 읽은 것이다
      r.retailerLastRead = Math.max(r.retailerLastRead ?? 0, message.sequence);
      const generatedMessages = chatStore.runAutoReply(r, message);
      record.result = {
        message,
        generatedMessages,
        generation: generatedMessages.length > 0 ? "DONE" : "NONE",
      };

      await delay(
        text.includes(CHAT_BODY_HOOK.SLOW_5S)
          ? CHAT_SLOW_MS
          : CHAT_SEND_DELAY_MS,
      );
      settle();
      if (text.includes(CHAT_BODY_HOOK.FAIL_AFTER_COMMIT)) return fail(500);
      return HttpResponse.json(
        { data: toRetailResult(record.result) },
        { status: 201 },
      );
    },
  ),

  /** 읽음. 05a 화면은 부르지 않는다(05b). 계약대로 받기만 한다 */
  http.post(
    "*/api/retail/chat/rooms/:roomId/read",
    async ({ params, request }) => {
      const planned = plannedFailure("read");
      if (planned) return planned;
      const r = myRoom(Number(params.roomId));
      if (r === undefined) return fail(404);
      const input = (await request.json().catch(() => ({}))) as Partial<
        RetailSchema<"MarkChatReadRequest">
      >;
      const seq = input.lastReadSequence;
      if (
        typeof seq !== "number" ||
        !Number.isInteger(seq) ||
        seq < 0 ||
        seq > chatStore.maxSequence(r)
      )
        return invalid(
          "lastReadSequence",
          "OUT_OF_RANGE",
          "방에 없는 sequence입니다.",
        );
      r.retailerLastRead = Math.max(r.retailerLastRead ?? 0, seq);
      const data = {
        roomId: r.roomId,
        lastReadSequence: r.retailerLastRead,
        unreadCount: unreadCount(r),
      };
      await plannedDelay("read");
      return HttpResponse.json({ data });
    },
  ),

  /* --- 시험 손잡이 (목 전용, 스펙에 없음). 도매 목과 같은 이름 ------------- */

  /**
   * 도매 쪽 메시지 주입 `{body, count?, kind?}`. 소매 앱에선 sender=WHOLESALER다 — "도매가 답했다"를 만든다.
   * `kind`는 모르는 kind(S5-6, 예: `ORDER_LINK`) 화면을 보려고 받는다. 스펙 enum 밖 값이 와도 그대로 싣는다.
   */
  http.post(
    "*/__mock/chat/rooms/:roomId/incoming",
    async ({ params, request }) => {
      const r = chatStore
        .rooms()
        .find((x) => x.roomId === Number(params.roomId));
      if (r === undefined) return fail(404);
      const input = (await request.json().catch(() => ({}))) as {
        body?: string;
        count?: number;
        kind?: string;
      };
      const count = Math.max(1, Math.min(input.count ?? 1, 500));
      const base = input.body ?? "새 답이에요";
      const created: ChatMessage[] = [];
      for (let i = 1; i <= count; i++) {
        created.push(
          toRetailMessage(
            chatStore.append(r, {
              sender: "WHOLESALER",
              // 모르는 kind 시험용. 화면이 enum 밖 값을 TEXT처럼 그리는지 본다
              kind: (input.kind ?? "TEXT") as ChatMessageKind,
              body: count === 1 ? base : `${base} ${i}`,
              sentAt: new Date().toISOString(),
            }),
          ),
        );
      }
      return HttpResponse.json({ data: created }, { status: 201 });
    },
  ),

  /** 다음 n회 실패. `{op, status = 500, times = 1}` */
  http.post("*/__mock/chat/fail", async ({ request }) => {
    const input = (await request.json().catch(() => ({}))) as {
      op?: string;
      status?: number;
      times?: number;
    };
    const op = RETAIL_CHAT_FAIL_OPS.find((o) => o === input.op);
    if (op === undefined)
      return invalid(
        "op",
        "INVALID",
        `op는 ${RETAIL_CHAT_FAIL_OPS.join(" | ")}`,
      );
    if (op === "receivable") chatStore.failReceivable(input.times ?? 1);
    else
      failPlan.set(op, {
        status: input.status ?? 500,
        times: input.times ?? 1,
      });
    return HttpResponse.json({ data: { op, ...failPlan.get(op) } });
  }),

  /**
   * 정산 장부에 입금 한 건 `{amount, allocations: [{orderId, amount}]}`(loop-07 M5). "나"(봄봄상회)의 도매처 101
   * 장부다. 소매 화면에서 미수 답 C(갚을 돈 0), D(선수금)를 보려고 둔다 — 소매 번들엔 정산 핸들러가 없다.
   * reset이 정산 목까지 되돌린다
   */
  http.post("*/__mock/chat/payment", async ({ request }) => {
    const input = (await request.json().catch(() => ({}))) as {
      amount?: number;
      allocations?: { orderId: number; amount: number }[];
    };
    if (typeof input.amount !== "number" || input.amount <= 0)
      return invalid("amount", "INVALID", "amount(1 이상 숫자)가 필요합니다.");
    try {
      recordMockPayment({
        retailerId: CHAT_ME_RETAILER_ID,
        amount: input.amount,
        allocations: input.allocations ?? [],
      });
    } catch (e) {
      return invalid("allocations", "INVALID", String(e));
    }
    return HttpResponse.json({ data: { ok: true } }, { status: 201 });
  }),

  /** 다음 n회 응답을 ms 늦춘다. `{op: count|read, ms, times = 1}`. 값은 요청 시점에 정한다 */
  http.post("*/__mock/chat/delay", async ({ request }) => {
    const input = (await request.json().catch(() => ({}))) as {
      op?: string;
      ms?: number;
      times?: number;
    };
    const op = RETAIL_CHAT_DELAY_OPS.find((o) => o === input.op);
    if (op === undefined)
      return invalid(
        "op",
        "INVALID",
        `op는 ${RETAIL_CHAT_DELAY_OPS.join(" | ")}`,
      );
    if (typeof input.ms !== "number" || input.ms < 0)
      return invalid("ms", "INVALID", "ms(0 이상 숫자)가 필요합니다.");
    delayPlan.set(op, { ms: input.ms, times: input.times ?? 1 });
    return HttpResponse.json({ data: { op, ...delayPlan.get(op) } });
  }),

  /**
   * 시드로 되돌린다(도매 목의 시드와 미송 목도 같이). 소매 쪽 실패, 지연 계획도 비운다.
   * `{empty: true}` 내 방 0개(목록 빈 상태), `{noBackorders: true}` 미송 0건(자동 답 후보 0개)
   */
  http.post("*/__mock/chat/reset", async ({ request }) => {
    const input = (await request.json().catch(() => ({}))) as {
      empty?: boolean;
      noBackorders?: boolean;
    };
    resetRetailChatMock({
      empty: input.empty === true,
      noBackorders: input.noBackorders === true,
    });
    return HttpResponse.json({
      data: {
        rooms: chatStore
          .rooms()
          .filter((r) => r.retailerId === CHAT_ME_RETAILER_ID).length,
      },
    });
  }),

  ...chatSharedKnobs,
];

function toRetailResult(
  result: NonNullable<IdempotencyRecord["result"]>,
): ChatSendResult {
  return {
    message: toRetailMessage(result.message),
    generatedMessages: result.generatedMessages.map(toRetailMessage),
    generation: result.generation,
  };
}

export function resetRetailChatMock(
  options: { empty?: boolean; noBackorders?: boolean } = {},
) {
  resetChatMock(undefined, { noBackorders: options.noBackorders === true });
  if (options.empty === true)
    chatStore.removeRetailerRooms(CHAT_ME_RETAILER_ID);
  failPlan.clear();
  delayPlan.clear();
  failedOnceKeys.clear();
}
