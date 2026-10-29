import { delay, http, HttpResponse } from "msw";
import type { WholesaleSchema } from "../../wholesale";
import { chatsNeedingReplyCount } from "./chat";
import {
  addMockOrder,
  cancelMockOrder,
  mockOrders,
  type MockOrder,
} from "./order";

/**
 * 도매 알림 목 — 초안 op 3개(#290, 스냅샷 `x-ondo-draft`). 계약은 `01-plan.md` §5-2, 목은 §5-4.
 *
 * BE에 알림 코드가 없다(D10). 시드를 여기서 지었고, 값이 그럴듯한 게 목적이 아니라 경계를 만드는 게 목적이다:
 *  - 25개 = size 20 첫 장 + 둘째 장 5개
 *  - 21, 22번째가 createdAt이 같다 → id desc로 갈리는지
 *  - 안 읽음 3개 중 하나가 22번째(둘째 장) → `모두 읽음`이 받지 않은 장까지 읽는지
 *  - 5, 6번째는 id가 시각과 거꾸로다 → id만으로 정렬하면 틀린다("id는 순서 의미 없음")
 *  - 모르는 type `PAYMENT_RECEIVED` 1개 → 화면이 title만 그리고 이동하지 않는지
 *
 * 문구(title, body)는 주문 목의 그 주문에서 만든다 — 주문 탭에서 열었을 때 알림과 글자가 맞게.
 * 시드의 ORDER_CANCELLED 2건은 실제로 취소되지 않은 시드 주문(7003, 7005)을 가리킨다. 주문 시드를 바꾸면
 * 다른 목(출고, 정산, 대시보드)의 숫자가 움직여서 그대로 뒀다. `incoming {ORDER_CANCELLED}`는 진짜 취소한다.
 *
 * `chatsNeedingReply`는 따로 세지 않고 채팅 목 저장소를 그때그때 읽는다(§5-4 2).
 * 세션이 없는 목이라 알림은 전부 "나"(도매처 101) 것이다. 새로고침하면 시드로 돌아간다.
 */

type Notification = WholesaleSchema<"Notification">;
type NotificationType = WholesaleSchema<"NotificationType">;

const PAGE_DEFAULT = 20;
const SIZE_MAX = 100;
const IDS_MAX = 100;
const HOUR_MS = 3_600_000;
const KST_OFFSET_MS = 9 * HOUR_MS;

/** `/__mock/notifications/{fail,delay}`가 고르는 op. list = 목록, count = unread-count, read = 읽음 */
export const NOTIFICATION_MOCK_OPS = ["list", "count", "read"] as const;
type NotificationMockOp = (typeof NOTIFICATION_MOCK_OPS)[number];

/** `incoming`이 주문을 새로 만들 때 쓰는 값. 시드 주문 7004(봄봄상회, 레드 / M 12,500원)와 같은 줄 */
export const INCOMING_ORDER = {
  retailerId: 1,
  retailerName: "봄봄상회",
  variantId: 3002,
  qty: 1,
  unitPrice: 12_500,
} as const;

/** 스펙에 없는 type. 화면의 "모르는 type" 분기를 시험하려고 시드에 1개 넣는다 */
export const UNKNOWN_NOTIFICATION_TYPE = "PAYMENT_RECEIVED";

/* --- 상태 --------------------------------------------------------------- */

let notifications: Notification[] = [];
const failPlan = new Map<
  NotificationMockOp,
  { status: number; times: number }
>();
const delayPlan = new Map<NotificationMockOp, { ms: number; times: number }>();

/* --- 시드 --------------------------------------------------------------- */

/** 표시 규칙(Asia/Seoul)과 같은 오프셋으로 적는다. 주문 목이 orderedAt을 글자로 정렬해서 형식을 맞춘다 */
function kstIso(ms: number): string {
  return new Date(ms + KST_OFFSET_MS).toISOString().replace("Z", "+09:00");
}

function bodyOf(order: MockOrder): string {
  const first = order.items[0];
  if (first === undefined) return "";
  const rest = order.items.length - 1;
  const qty = order.items.reduce((sum, l) => sum + l.qty, 0);
  return `${first.productName} ${first.color} / ${first.size}${rest > 0 ? ` 외 ${rest}건` : ""}, ${qty}장`;
}

function notificationOf(
  id: number,
  type: NotificationType,
  order: MockOrder,
  createdAt: string,
  readAt: string | null,
): Notification {
  return {
    id,
    type,
    title: `${order.retailerName} ${type === "ORDER_CANCELLED" ? "주문 취소" : "새 주문"}`,
    body: bodyOf(order),
    target: { kind: "ORDER", id: order.id },
    createdAt,
    readAt,
  };
}

/** 시드에서 type이 다른 자리(1부터, 1 = 가장 최근) */
const CANCELLED_AT = new Set([8, 15]);
const UNKNOWN_AT = 12;
/** 안 읽은 자리. 22는 둘째 장이다 */
const UNREAD_AT = new Set([1, 2, 22]);
/** createdAt을 앞 자리와 같게 둔다(tie) */
const TIE_WITH_PREVIOUS_AT = 22;

/**
 * 25개. 시각은 reset 시점 기준 어제(24시간 전)부터 2시간 간격으로 3일 전까지. 고정 날짜로 박으면
 * 시간이 지나 전부 "10/28 …"이 되고 "어제" 경계를 못 본다.
 * id = 1000 + (26 − 자리)라 대체로 최신이 크다. 5, 6번째만 바꿔 id 정렬과 시각 정렬이 갈리게 한다.
 */
function seedNotifications(now: number): Notification[] {
  const orders = mockOrders().filter((o) => o.id >= 7001 && o.id <= 7005);
  const seeded: Notification[] = [];
  let previousMs = now;
  for (let at = 1; at <= 25; at++) {
    const order = orders[(at - 1) % orders.length];
    if (order === undefined) continue;
    const ms =
      at === TIE_WITH_PREVIOUS_AT
        ? previousMs
        : now - 24 * HOUR_MS - (at - 1) * 2 * HOUR_MS;
    previousMs = ms;
    const id = at === 5 ? 1020 : at === 6 ? 1021 : 1000 + (26 - at);
    const readAt = UNREAD_AT.has(at) ? null : kstIso(ms + HOUR_MS);
    if (at === UNKNOWN_AT) {
      seeded.push({
        id,
        // 스펙 enum 밖 값이다. 계약이 "값이 늘 수 있다"고 적어 두어 일부러 넣는다(S11-16)
        type: UNKNOWN_NOTIFICATION_TYPE as unknown as NotificationType,
        title: "입금이 확인됐어요",
        body: null,
        target: { kind: "ORDER", id: order.id },
        createdAt: kstIso(ms),
        readAt,
      });
      continue;
    }
    seeded.push(
      notificationOf(
        id,
        CANCELLED_AT.has(at) ? "ORDER_CANCELLED" : "NEW_ORDER",
        order,
        kstIso(ms),
        readAt,
      ),
    );
  }
  return seeded;
}

/* --- 규칙 --------------------------------------------------------------- */

/** createdAt desc, id desc. 커서는 이 순서의 한 지점이다 */
function compare(a: Notification, b: Notification): number {
  const diff = Date.parse(b.createdAt) - Date.parse(a.createdAt);
  return diff !== 0 ? diff : b.id - a.id;
}

/** 불투명 커서. FE는 열지 않는다 — 채팅 방 목록 커서와 같은 모양(base64 `ms|id`) */
function encodeCursor(n: Notification): string {
  return btoa(`${Date.parse(n.createdAt)}|${n.id}`);
}

function decodeCursor(cursor: string): { ms: number; id: number } | null {
  let raw: string;
  try {
    raw = atob(cursor);
  } catch {
    return null;
  }
  const match = /^(\d+)\|(\d+)$/.exec(raw);
  if (match === null) return null;
  return { ms: Number(match[1]), id: Number(match[2]) };
}

/** 커서보다 뒤(더 오래됨)인가. keyset `(createdAt, id) < (cursor)` */
function isAfter(n: Notification, cursor: { ms: number; id: number }): boolean {
  const ms = Date.parse(n.createdAt);
  return ms < cursor.ms || (ms === cursor.ms && n.id < cursor.id);
}

function unread(): number {
  return notifications.filter((n) => n.readAt === null).length;
}

const CODE_BY_STATUS: Record<number, string> = {
  400: "VALIDATION_FAILED",
  401: "UNAUTHENTICATED",
  403: "NOT_APPROVED",
  404: "RESOURCE_NOT_FOUND",
  409: "UNREAD_CHANGED",
};

const MESSAGE_BY_STATUS: Record<number, string> = {
  400: "입력한 내용을 다시 확인해 주세요.",
  401: "로그인이 필요합니다.",
  403: "승인된 계정만 사용할 수 있습니다.",
  404: "찾을 수 없습니다.",
  409: "그 사이 안 읽은 알림 수가 바뀌었습니다.",
};

function fail(
  status: number,
  errors: { field: string; code: string; message: string }[] = [],
  code?: string,
) {
  return HttpResponse.json(
    {
      code: code ?? CODE_BY_STATUS[status] ?? "INTERNAL_ERROR",
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

/** 걸어 둔 실패. 걸려 있으면 1회 소모하고 그 응답을 돌려준다 */
function plannedFailure(op: NotificationMockOp) {
  const plan = failPlan.get(op);
  if (plan === undefined || plan.times <= 0) return null;
  plan.times -= 1;
  if (plan.times === 0) failPlan.delete(op);
  return fail(plan.status);
}

/**
 * 걸어 둔 지연. **응답 값을 정한 뒤에** 기다린다 — "먼저 시작한 count가 read 뒤에 옛 숫자로 도착"
 * (S11-12 역전)을 만들려면 값은 요청 시점 것이어야 한다
 */
async function plannedDelay(op: NotificationMockOp) {
  const plan = delayPlan.get(op);
  if (plan === undefined || plan.times <= 0) return;
  plan.times -= 1;
  if (plan.times === 0) delayPlan.delete(op);
  await delay(plan.ms);
}

/** 정수 배열이면 그대로, 아니면 null */
function intArray(value: unknown): number[] | null {
  if (!Array.isArray(value)) return null;
  return value.every((v) => Number.isInteger(v)) ? (value as number[]) : null;
}

/**
 * read 본문 검사. 스펙 `oneOf`({ids} | {all, expectedUnread}, 둘 다 additionalProperties false)를 흉내 낸다.
 * 통과하면 고른 쪽을, 아니면 400 응답을 돌려준다
 */
function parseReadBody(
  input: unknown,
):
  | { kind: "ids"; ids: number[] }
  | { kind: "all"; expectedUnread: number }
  | Response {
  if (input === null || typeof input !== "object" || Array.isArray(input))
    return invalid("ids", "REQUIRED", "ids 또는 all이 필요합니다.");
  const body = input as Record<string, unknown>;
  const hasIds = "ids" in body;
  const hasAll = "all" in body;
  if (hasIds && hasAll)
    return invalid("all", "CONFLICT", "ids와 all은 같이 보낼 수 없습니다.");
  if (!hasIds && !hasAll)
    return invalid("ids", "REQUIRED", "ids 또는 all이 필요합니다.");

  const allowed = hasIds ? ["ids"] : ["all", "expectedUnread"];
  const extra = Object.keys(body).find((k) => !allowed.includes(k));
  if (extra !== undefined)
    return invalid(extra, "UNKNOWN_FIELD", `${extra}는 받지 않습니다.`);

  if (hasIds) {
    const ids = intArray(body.ids);
    if (ids === null)
      return invalid("ids", "INVALID", "ids는 정수 배열이어야 합니다.");
    if (ids.length < 1 || ids.length > IDS_MAX)
      return invalid("ids", "SIZE", `ids는 1~${IDS_MAX}개여야 합니다.`);
    return { kind: "ids", ids };
  }
  if (body.all !== true)
    return invalid("all", "INVALID", "all은 true만 받습니다.");
  const expected = body.expectedUnread;
  if (expected === undefined)
    return invalid(
      "expectedUnread",
      "REQUIRED",
      "expectedUnread가 필요합니다.",
    );
  if (
    typeof expected !== "number" ||
    !Number.isInteger(expected) ||
    expected < 1
  )
    return invalid(
      "expectedUnread",
      "OUT_OF_RANGE",
      "expectedUnread는 1 이상 정수여야 합니다.",
    );
  return { kind: "all", expectedUnread: expected };
}

function nextId(): number {
  return notifications.reduce((max, n) => Math.max(max, n.id), 0) + 1;
}

/* --- 핸들러 ------------------------------------------------------------- */

/** 스펙 자동 핸들러 **앞에** 놓는다. `unread-count`, `read`가 목록보다 먼저 와도 경로가 달라 겹치지 않는다 */
export const notificationHandlers = [
  http.get("*/api/wholesale/notifications", async ({ request }) => {
    const url = new URL(request.url);
    const rawSize = url.searchParams.get("size");
    const size =
      rawSize === null || rawSize === ""
        ? PAGE_DEFAULT
        : /^\d+$/.test(rawSize)
          ? Number(rawSize)
          : Number.NaN;
    if (Number.isNaN(size) || size < 1 || size > SIZE_MAX)
      return invalid("size", "OUT_OF_RANGE", "size는 1~100이어야 합니다.");

    const rawCursor = url.searchParams.get("cursor");
    const cursor =
      rawCursor === null || rawCursor === "" ? null : decodeCursor(rawCursor);
    if (rawCursor !== null && rawCursor !== "" && cursor === null)
      return invalid("cursor", "INVALID", "cursor가 올바르지 않습니다.");

    const planned = plannedFailure("list");
    const rows = [...notifications]
      .sort(compare)
      .filter((n) => cursor === null || isAfter(n, cursor));
    const page = rows.slice(0, size).map((n) => ({ ...n }));
    const last = page.at(-1);
    const nextCursor =
      rows.length > size && last !== undefined ? encodeCursor(last) : null;
    await plannedDelay("list");
    if (planned) return planned;
    return HttpResponse.json({ data: page, meta: { nextCursor } });
  }),

  http.get("*/api/wholesale/notifications/unread-count", async () => {
    const planned = plannedFailure("count");
    const data: WholesaleSchema<"NotificationUnreadCount"> = {
      notifications: unread(),
      chatsNeedingReply: chatsNeedingReplyCount(),
    };
    await plannedDelay("count");
    if (planned) return planned;
    return HttpResponse.json({ data });
  }),

  http.post("*/api/wholesale/notifications/read", async ({ request }) => {
    const planned = plannedFailure("read");
    if (planned) {
      await plannedDelay("read");
      return planned;
    }
    const parsed = parseReadBody(await request.json().catch(() => null));
    if (parsed instanceof Response) return parsed;

    if (parsed.kind === "ids") {
      const now = kstIso(Date.now());
      const wanted = new Set(parsed.ids);
      for (const n of notifications) {
        // 처음 읽은 시각을 지킨다(멱등). 없는 id는 조용히 넘어간다
        if (wanted.has(n.id) && n.readAt === null) n.readAt = now;
      }
    } else {
      // 한 트랜잭션: 바뀔 행 수가 화면이 본 수와 다르면 아무것도 바꾸지 않는다
      if (unread() !== parsed.expectedUnread) {
        await plannedDelay("read");
        return fail(409);
      }
      const now = kstIso(Date.now());
      for (const n of notifications) if (n.readAt === null) n.readAt = now;
    }
    const data: WholesaleSchema<"MarkNotificationsReadResult"> = {
      notifications: unread(),
    };
    await plannedDelay("read");
    return HttpResponse.json({ data });
  }),

  /**
   * 소매 주문 접수(또는 취소)를 흉내 낸다. `{type = NEW_ORDER, orderId?}`.
   * NEW_ORDER + orderId 없음 → 주문 목에 신규 주문 1건(`INCOMING_ORDER`, 지금)을 만들고 그걸 target으로.
   * NEW_ORDER + orderId → 그 주문으로 알림만. ORDER_CANCELLED + orderId → 그 주문을 취소하고 알림.
   * `PAYMENT_RECEIVED`(스펙 밖 type) → 주문은 안 만들고 안 읽은 모르는 type 알림만(S11-16 읽음 경로 시험, 03-review M3).
   * 시드의 모르는 행은 읽은 행이라 누름 → 읽음 POST 경로를 못 본다.
   * 없는 orderId, ORDER_CANCELLED인데 orderId 없음, 그 밖의 type → 400. 신규가 아닌 주문 취소 → 409
   */
  http.post("*/__mock/notifications/incoming", async ({ request }) => {
    const input = (await request.json().catch(() => ({}))) as {
      type?: string;
      orderId?: number;
    };
    const type = input.type ?? "NEW_ORDER";
    const now = Date.now();
    if (type === UNKNOWN_NOTIFICATION_TYPE) {
      /* target은 필수 칸이라 아무 주문이나 건다. 화면은 모르는 type 의 target 을 보지 않는다 */
      const target = mockOrders()[0];
      if (target === undefined)
        return invalid("type", "NO_ORDER", "주문 목이 비어 있습니다.");
      const notification: Notification = {
        id: nextId(),
        type: UNKNOWN_NOTIFICATION_TYPE as unknown as NotificationType,
        title: "입금이 확인됐어요",
        body: null,
        target: { kind: "ORDER", id: target.id },
        createdAt: kstIso(now),
        readAt: null,
      };
      notifications.push(notification);
      return HttpResponse.json(
        { data: { notification, orderId: target.id } },
        { status: 201 },
      );
    }
    if (type !== "NEW_ORDER" && type !== "ORDER_CANCELLED")
      return invalid(
        "type",
        "INVALID",
        `type은 NEW_ORDER | ORDER_CANCELLED | ${UNKNOWN_NOTIFICATION_TYPE}`,
      );

    let order: MockOrder | undefined;
    if (input.orderId === undefined) {
      if (type === "ORDER_CANCELLED")
        return invalid("orderId", "REQUIRED", "취소에는 orderId가 필요합니다.");
      order = addMockOrder({ ...INCOMING_ORDER, orderedAt: kstIso(now) });
    } else {
      order = mockOrders().find((o) => o.id === input.orderId);
      if (order === undefined)
        return invalid("orderId", "NOT_FOUND", "없는 주문입니다.");
      if (type === "ORDER_CANCELLED" && !cancelMockOrder(order))
        return fail(409, [], "TRANSITION_NOT_ALLOWED");
    }
    const notification = notificationOf(
      nextId(),
      type,
      order,
      kstIso(now),
      null,
    );
    notifications.push(notification);
    return HttpResponse.json(
      { data: { notification, orderId: order.id } },
      { status: 201 },
    );
  }),

  /** 다음 n회 실패. `{op: list|count|read, status = 500, times = 1}` */
  http.post("*/__mock/notifications/fail", async ({ request }) => {
    const input = (await request.json().catch(() => ({}))) as {
      op?: string;
      status?: number;
      times?: number;
    };
    const op = NOTIFICATION_MOCK_OPS.find((o) => o === input.op);
    if (op === undefined)
      return invalid(
        "op",
        "INVALID",
        `op는 ${NOTIFICATION_MOCK_OPS.join(" | ")}`,
      );
    failPlan.set(op, { status: input.status ?? 500, times: input.times ?? 1 });
    return HttpResponse.json({ data: { op, ...failPlan.get(op) } });
  }),

  /** 다음 n회 응답을 ms만큼 늦춘다. `{op, ms, times = 1}`. 값은 요청 시점 것(역순 응답 시험) */
  http.post("*/__mock/notifications/delay", async ({ request }) => {
    const input = (await request.json().catch(() => ({}))) as {
      op?: string;
      ms?: number;
      times?: number;
    };
    const op = NOTIFICATION_MOCK_OPS.find((o) => o === input.op);
    if (op === undefined)
      return invalid(
        "op",
        "INVALID",
        `op는 ${NOTIFICATION_MOCK_OPS.join(" | ")}`,
      );
    if (typeof input.ms !== "number" || input.ms < 0)
      return invalid("ms", "INVALID", "ms는 0 이상 숫자여야 합니다.");
    delayPlan.set(op, { ms: input.ms, times: input.times ?? 1 });
    return HttpResponse.json({ data: { op, ...delayPlan.get(op) } });
  }),

  /** 시드로 되돌린다. `{empty: true}`면 0개(빈 상태). 주문 목, 채팅 목은 건드리지 않는다 */
  http.post("*/__mock/notifications/reset", async ({ request }) => {
    const input = (await request.json().catch(() => ({}))) as {
      empty?: boolean;
    };
    resetNotificationMock(input.empty === true);
    return HttpResponse.json({
      data: { notifications: notifications.length, unread: unread() },
    });
  }),
];

/** 시드로 되돌린다. 테스트와 `/__mock/notifications/reset`이 부른다 */
export function resetNotificationMock(empty = false) {
  notifications = empty ? [] : seedNotifications(Date.now());
  failPlan.clear();
  delayPlan.clear();
}

resetNotificationMock();
