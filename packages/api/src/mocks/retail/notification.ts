import { delay, http, HttpResponse } from "msw";
import type { RetailSchema } from "../../retail";
import { addDays, seoulDate } from "../chat/backorderCandidates";
import { backorderSku, replaceExpectedInbound } from "../wholesale/backorder";
import { dateChangeBody, dateChangeNotifications } from "./dateChangeNotice";
import { RETAIL_ME_RETAILER_ID, RETAIL_WHOLESALERS } from "./parties";

/**
 * 소매 알림 목 — 초안 op 2개(#304, 스냅샷 `x-ondo-draft`). 계약은 loop-06b `01-plan.md` §5-2, 목은 §5-4.
 * 도매 알림 목(`../wholesale/notification.ts`, 05b-2)을 소매 어휘로 복제했다. 다른 점:
 *  - 오류 코드가 소매 어휘다(401 `UNAUTHORIZED`, 403 `ACCOUNT_NOT_APPROVED`)
 *  - target 이 kind 별로 갈린다(ORDER → orderId, BACKORDERS → wholesalerId)
 *  - read `{ids}`의 중복 id 는 400(스펙 `uniqueItems`)
 *  - unread-count 핸들러는 06a 그대로 채팅 목(`./chat.ts`)에 있고, 이 저장소를 {@link retailNotificationCount}로 읽는다
 *
 * BE에 알림 코드가 없다(D10). 시드는 경계를 만드는 게 목적이다:
 *  - 22개 = size 20 첫 장 + 둘째 장 2개
 *  - 20, 21번째가 createdAt이 같다 → id desc로 갈리는지
 *  - 안 읽음 2개 중 하나가 21번째(둘째 장) → `모두 읽음`이 받지 않은 장까지 읽는지
 *  - 5, 6번째는 id가 가장 크다 → id 최대값으로 "최신"을 정하면 틀린다(`latestNotificationId`는 첫 행 id)
 *  - 모르는 type `PAYMENT_DUE` 1개 → 화면이 title만 그리고 이동하지 않는지
 *
 * 세션이 없는 목이라 알림은 전부 "나"(봄봄상회, 소매처 1) 것이다. 다른 소매처 몫은 만들어도 저장하지 않는다.
 * 새로고침하면 시드로 돌아간다. 미송 저장소(`../wholesale/backorder.ts`)는 이 reset 이 아니라
 * `/__mock/chat/reset`이 되돌린다(입고일 시드가 그 reset 시각 기준이다).
 */

type Notification = RetailSchema<"Notification">;
type NotificationType = RetailSchema<"NotificationType">;
type NotificationTarget = RetailSchema<"NotificationTarget">;

const PAGE_DEFAULT = 20;
const SIZE_MAX = 100;
const IDS_MAX = 100;
const HOUR_MS = 3_600_000;
const KST_OFFSET_MS = 9 * HOUR_MS;

/** 시드 알림의 도매처. stub 의 무드온(101), 주문 7001 과 같다 */
const SEED_WHOLESALER_ID = 101;
const SEED_ORDER_ID = 7001;

/** `/__mock/notifications/{fail,delay}`가 고르는 op. count 는 06a 손잡이(`/__mock/chat/{fail,delay}`)를 쓴다 */
export const RETAIL_NOTIFICATION_MOCK_OPS = ["list", "read"] as const;
type MockOp = (typeof RETAIL_NOTIFICATION_MOCK_OPS)[number];

/** 스펙에 없는 type. 화면의 "모르는 type" 분기를 시험하려고 시드에 1개 넣는다 */
export const RETAIL_UNKNOWN_NOTIFICATION_TYPE = "PAYMENT_DUE";

/** `incoming`이 받는 type. 모르는 type 주입은 400(§5-4 3) */
const INCOMING_TYPES = [
  "BACKORDER_DATE_CHANGED",
  "ORDER_CONFIRMED",
  "SHIPPED",
  "BACKORDER_ALLOCATED",
] as const satisfies readonly NotificationType[];

/* --- 상태 --------------------------------------------------------------- */

let notifications: Notification[] = [];
const failPlan = new Map<MockOp, { status: number; times: number }>();
const delayPlan = new Map<MockOp, { ms: number; times: number }>();

/* --- 문구 --------------------------------------------------------------- */

function kstIso(ms: number): string {
  return new Date(ms + KST_OFFSET_MS).toISOString().replace("Z", "+09:00");
}

function wholesalerName(id: number): string {
  return RETAIL_WHOLESALERS[id] ?? `도매처 ${id}`;
}

/** 주문 알림 문구. 수량은 이 소매처 자기 주문 값이다 */
function orderText(
  type: Exclude<NotificationType, "BACKORDER_DATE_CHANGED">,
  wholesalerId: number,
  orderId: number,
  qty: number | null,
): { title: string; body: string } {
  const name = wholesalerName(wholesalerId);
  if (type === "ORDER_CONFIRMED")
    return { title: `${name} 주문 확정`, body: `주문 #${orderId}` };
  if (type === "SHIPPED")
    return { title: `${name} 출고 완료`, body: `주문 #${orderId}` };
  return {
    title: `${name} 미송 배분`,
    body: `주문 #${orderId}, ${qty ?? 0}장 출고 준비`,
  };
}

/* --- 시드 --------------------------------------------------------------- */

/** 시드 입고일 변경 알림의 SKU 와 그때 날짜(시드 날짜 기준 상대). 남은 수량은 지금 미송 목의 봄봄 몫 */
const SEED_DATE_CHANGES = [
  {
    variant: { productName: "린넨 셋업 자켓", color: "베이지", size: "L" },
    qty: 2,
    before: 5,
    after: 7,
  },
  {
    variant: { productName: "빈티지 플라워 셔츠", color: "레드", size: "L" },
    qty: 6,
    before: -6,
    after: -3,
  },
  {
    variant: { productName: "와이드 데님 팬츠", color: "소라", size: "M" },
    qty: 1,
    before: 2,
    after: null,
  },
] as const;

/** 시드 자리(1부터, 1 = 가장 최근)마다 type. 입고일 변경 8, 확정 6, 배분 4, 출고 3, 모르는 type 1 */
const SEED_TYPES: readonly (NotificationType | "PAYMENT_DUE")[] = [
  "BACKORDER_DATE_CHANGED",
  "ORDER_CONFIRMED",
  "SHIPPED",
  "BACKORDER_DATE_CHANGED",
  "BACKORDER_ALLOCATED",
  "ORDER_CONFIRMED",
  "BACKORDER_DATE_CHANGED",
  "BACKORDER_ALLOCATED",
  "BACKORDER_DATE_CHANGED",
  "ORDER_CONFIRMED",
  "SHIPPED",
  "PAYMENT_DUE",
  "BACKORDER_DATE_CHANGED",
  "ORDER_CONFIRMED",
  "BACKORDER_ALLOCATED",
  "BACKORDER_DATE_CHANGED",
  "ORDER_CONFIRMED",
  "SHIPPED",
  "BACKORDER_DATE_CHANGED",
  "ORDER_CONFIRMED",
  "BACKORDER_DATE_CHANGED",
  "BACKORDER_ALLOCATED",
];
/** 안 읽은 자리. 21은 둘째 장이다 */
const UNREAD_AT = new Set([1, 21]);
/** createdAt을 앞 자리와 같게 둔다(tie) */
const TIE_WITH_PREVIOUS_AT = 21;

/**
 * 22개. 시각은 reset 시점 기준 24시간 전부터 2시간 간격(가장 오래된 것 66시간 전). 고정 날짜로 박으면
 * 날이 지나 "어제" 경계를 못 본다. id = 2000 + (23 − 자리)라 대체로 최신이 크고, 5, 6번째만 2030, 2031이다.
 */
function seedNotifications(now: number): Notification[] {
  const today = seoulDate(now);
  const seeded: Notification[] = [];
  let previousMs = now;
  let dateChangeAt = 0;
  SEED_TYPES.forEach((type, index) => {
    const at = index + 1;
    const ms =
      at === TIE_WITH_PREVIOUS_AT
        ? previousMs
        : now - 24 * HOUR_MS - (at - 1) * 2 * HOUR_MS;
    previousMs = ms;
    const id = at === 5 ? 2030 : at === 6 ? 2031 : 2000 + (23 - at);
    const base = {
      id,
      createdAt: kstIso(ms),
      readAt: UNREAD_AT.has(at) ? null : kstIso(ms + HOUR_MS),
    };
    if (type === "PAYMENT_DUE") {
      seeded.push({
        ...base,
        // 스펙 enum 밖 값이다. 계약이 "값이 늘 수 있다"고 적어 두어 일부러 넣는다
        type: RETAIL_UNKNOWN_NOTIFICATION_TYPE as unknown as NotificationType,
        title: "결제 기한이 다가와요",
        body: null,
        target: { kind: "ORDER", orderId: SEED_ORDER_ID },
      });
      return;
    }
    if (type === "BACKORDER_DATE_CHANGED") {
      const change =
        SEED_DATE_CHANGES[dateChangeAt % SEED_DATE_CHANGES.length] ??
        SEED_DATE_CHANGES[0];
      dateChangeAt += 1;
      seeded.push({
        ...base,
        type,
        title: `${wholesalerName(SEED_WHOLESALER_ID)} 미송 입고일 변경`,
        body: dateChangeBody(
          change.variant,
          change.qty,
          addDays(today, change.before),
          change.after === null ? null : addDays(today, change.after),
          today,
        ),
        target: { kind: "BACKORDERS", wholesalerId: SEED_WHOLESALER_ID },
      });
      return;
    }
    seeded.push({
      ...base,
      type,
      ...orderText(
        type,
        SEED_WHOLESALER_ID,
        SEED_ORDER_ID,
        type === "BACKORDER_ALLOCATED" ? 2 : null,
      ),
      target: { kind: "ORDER", orderId: SEED_ORDER_ID },
    });
  });
  return seeded;
}

/* --- 규칙 --------------------------------------------------------------- */

/** createdAt desc, id desc. 커서는 이 순서의 한 지점이다 */
function compare(a: Notification, b: Notification): number {
  const diff = Date.parse(b.createdAt) - Date.parse(a.createdAt);
  return diff !== 0 ? diff : b.id - a.id;
}

/** 불투명 커서. FE는 열지 않는다 — 도매 알림 목과 같은 모양(base64 `ms|id`) */
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

function nextId(): number {
  return notifications.reduce((max, n) => Math.max(max, n.id), 0) + 1;
}

/**
 * 헤더 count 의 알림 몫(06a 핸들러가 부른다). `latestNotificationId` = 목록 첫 행(createdAt desc, id desc)의 id.
 * id 최대값이 아니다 — 시드 5, 6번째가 그 둘을 가른다. 알림이 없으면 null
 */
export function retailNotificationCount(): {
  notifications: number;
  latestNotificationId: number | null;
} {
  const first = [...notifications].sort(compare)[0];
  return { notifications: unread(), latestNotificationId: first?.id ?? null };
}

const CODE_BY_STATUS: Record<number, string> = {
  400: "VALIDATION_FAILED",
  401: "UNAUTHORIZED",
  403: "ACCOUNT_NOT_APPROVED",
  409: "UNREAD_CHANGED",
};

const MESSAGE_BY_STATUS: Record<number, string> = {
  400: "입력한 내용을 다시 확인해 주세요.",
  401: "로그인이 필요합니다.",
  403: "승인된 계정만 사용할 수 있습니다.",
  409: "그 사이 안 읽은 알림 수가 바뀌었습니다.",
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

/** 걸어 둔 실패. 걸려 있으면 1회 소모하고 그 응답을 돌려준다 */
function plannedFailure(op: MockOp) {
  const plan = failPlan.get(op);
  if (plan === undefined || plan.times <= 0) return null;
  plan.times -= 1;
  if (plan.times === 0) failPlan.delete(op);
  return fail(plan.status);
}

/** 걸어 둔 지연. **응답 값을 정한 뒤에** 기다린다 — 늦게 온 응답이 요청 시점 값을 들고 오게(경쟁 시험) */
async function plannedDelay(op: MockOp) {
  const plan = delayPlan.get(op);
  if (plan === undefined || plan.times <= 0) return;
  plan.times -= 1;
  if (plan.times === 0) delayPlan.delete(op);
  await delay(plan.ms);
}

function isPositiveInt(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

/** 정수 배열이면 그대로, 아니면 null */
function intArray(value: unknown): number[] | null {
  if (!Array.isArray(value)) return null;
  return value.every((v) => Number.isInteger(v)) ? (value as number[]) : null;
}

/**
 * read 본문 검사. 스펙 `oneOf`({ids} | {all, expectedUnread}, 둘 다 additionalProperties false, ids uniqueItems)를
 * 흉내 낸다. 통과하면 고른 쪽을, 아니면 400 응답을 돌려준다
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
    if (new Set(ids).size !== ids.length)
      return invalid("ids", "DUPLICATE", "ids에 같은 id가 두 번 있습니다.");
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
  if (!isPositiveInt(expected))
    return invalid(
      "expectedUnread",
      "OUT_OF_RANGE",
      "expectedUnread는 1 이상 정수여야 합니다.",
    );
  return { kind: "all", expectedUnread: expected };
}

function isWireDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function push(
  type: NotificationType,
  text: { title: string; body: string | null },
  target: NotificationTarget,
  now: number,
): Notification {
  const notification: Notification = {
    id: nextId(),
    type,
    ...text,
    target,
    createdAt: kstIso(now),
    readAt: null,
  };
  notifications.push(notification);
  return notification;
}

/**
 * 입고일 변경 주입. 소매 탭 안의 미송 목 그 SKU 를 도매 PUT 과 **같은 함수**(전체 대체)로 바꾸고,
 * 규칙 함수가 낸 소매처별 알림 중 "나" 몫만 저장한다. 날짜가 같으면(사유만 바뀜) 0건
 */
function injectDateChange(input: Record<string, unknown>, now: number) {
  const variantId = input.variantId;
  if (!isPositiveInt(variantId))
    return invalid("variantId", "REQUIRED", "variantId가 필요합니다.");
  const sku = backorderSku(variantId);
  if (sku === null) return invalid("variantId", "NOT_FOUND", "없는 SKU입니다.");
  if (!("expectedInboundDate" in input))
    return invalid(
      "expectedInboundDate",
      "REQUIRED",
      "expectedInboundDate가 필요합니다(해제는 null).",
    );
  const date = input.expectedInboundDate;
  if (date !== null && !isWireDate(date))
    return invalid(
      "expectedInboundDate",
      "INVALID",
      "날짜 형식이 올바르지 않습니다(YYYY-MM-DD).",
    );
  const reason = input.expectedInboundReason ?? null;
  if (reason !== null && typeof reason !== "string")
    return invalid(
      "expectedInboundReason",
      "INVALID",
      "사유는 문자열이어야 합니다.",
    );

  const changed = replaceExpectedInbound(variantId, date, reason);
  if (changed === null)
    return invalid("variantId", "NOT_FOUND", "없는 SKU입니다.");
  const notices = dateChangeNotifications({
    variant: sku,
    before: changed.before,
    after: changed.after,
    backorders: sku.backorders,
    wholesaler: {
      id: sku.wholesalerId,
      name: wholesalerName(sku.wholesalerId),
    },
    today: seoulDate(now),
  });
  const created = notices
    .filter((n) => n.retailerId === RETAIL_ME_RETAILER_ID)
    .map((n) =>
      push(
        "BACKORDER_DATE_CHANGED",
        { title: n.title, body: n.body },
        n.target,
        now,
      ),
    );
  return HttpResponse.json({
    data: { created: created.length, notifications: created },
  });
}

/** 주문 알림 주입. 주문 상태는 stub 이 갖고 있어 안 바꾼다. orderId 없는 ORDER 알림은 만들지 않는다(400) */
function injectOrderNotice(
  type: Exclude<NotificationType, "BACKORDER_DATE_CHANGED">,
  input: Record<string, unknown>,
  now: number,
) {
  const orderId = input.orderId;
  if (!isPositiveInt(orderId))
    return invalid("orderId", "REQUIRED", "orderId가 필요합니다.");
  const wholesalerId = input.wholesalerId ?? SEED_WHOLESALER_ID;
  if (
    !isPositiveInt(wholesalerId) ||
    RETAIL_WHOLESALERS[wholesalerId] === undefined
  )
    return invalid("wholesalerId", "NOT_FOUND", "없는 도매처입니다.");
  const qty = input.qty;
  if (type === "BACKORDER_ALLOCATED" && !isPositiveInt(qty))
    return invalid("qty", "REQUIRED", "배분 알림에는 qty가 필요합니다.");
  const notification = push(
    type,
    orderText(type, wholesalerId, orderId, isPositiveInt(qty) ? qty : null),
    { kind: "ORDER", orderId },
    now,
  );
  return HttpResponse.json({
    data: { created: 1, notifications: [notification] },
  });
}

function knobOp(value: unknown): MockOp | undefined {
  return RETAIL_NOTIFICATION_MOCK_OPS.find((o) => o === value);
}

const KNOB_OP_MESSAGE = `op는 ${RETAIL_NOTIFICATION_MOCK_OPS.join(" | ")}. count 는 /__mock/chat/{fail,delay}`;

/* --- 핸들러 ------------------------------------------------------------- */

/**
 * 소매 브라우저 worker(`../browser.ts` `startRetailChatWorker`)에 채팅 핸들러와 같이 올린다.
 * `unread-count`는 채팅 목에 있다. 경로가 달라 이 목록 GET 과 겹치지 않는다
 */
export const retailNotificationHandlers = [
  http.get("*/api/retail/notifications", async ({ request }) => {
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

  http.post("*/api/retail/notifications/read", async ({ request }) => {
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
    const data: RetailSchema<"MarkNotificationsReadResult"> = {
      notifications: unread(),
    };
    await plannedDelay("read");
    return HttpResponse.json({ data });
  }),

  /* --- 시험 손잡이 (목 전용, 스펙에 없음) --------------------------------- */

  /**
   * 알림 주입(§5-4 3). 응답 `{data: {created, notifications}}`.
   *  - `{type: BACKORDER_DATE_CHANGED, variantId, expectedInboundDate (null 가능), expectedInboundReason?}`
   *  - `{type: ORDER_CONFIRMED | SHIPPED, orderId, wholesalerId?}`, `{type: BACKORDER_ALLOCATED, orderId, qty, wholesalerId?}`
   * 모르는 type, 없는 variantId, orderId 없는 주문 알림 → 400
   */
  http.post("*/__mock/notifications/incoming", async ({ request }) => {
    const raw: unknown = await request.json().catch(() => null);
    if (raw === null || typeof raw !== "object" || Array.isArray(raw))
      return invalid("type", "REQUIRED", "type이 필요합니다.");
    const input = raw as Record<string, unknown>;
    const type = INCOMING_TYPES.find((t) => t === input.type);
    if (type === undefined)
      return invalid("type", "INVALID", `type은 ${INCOMING_TYPES.join(" | ")}`);
    const now = Date.now();
    if (type === "BACKORDER_DATE_CHANGED") return injectDateChange(input, now);
    return injectOrderNotice(type, input, now);
  }),

  /** 다음 n회 실패. `{op: list|read, status = 500, times = 1}` */
  http.post("*/__mock/notifications/fail", async ({ request }) => {
    const input = (await request.json().catch(() => ({}))) as {
      op?: string;
      status?: number;
      times?: number;
    };
    const op = knobOp(input.op);
    if (op === undefined) return invalid("op", "INVALID", KNOB_OP_MESSAGE);
    failPlan.set(op, { status: input.status ?? 500, times: input.times ?? 1 });
    return HttpResponse.json({ data: { op, ...failPlan.get(op) } });
  }),

  /** 다음 n회 응답을 ms만큼 늦춘다. `{op: list|read, ms, times = 1}`. 값은 요청 시점 것 */
  http.post("*/__mock/notifications/delay", async ({ request }) => {
    const input = (await request.json().catch(() => ({}))) as {
      op?: string;
      ms?: number;
      times?: number;
    };
    const op = knobOp(input.op);
    if (op === undefined) return invalid("op", "INVALID", KNOB_OP_MESSAGE);
    if (typeof input.ms !== "number" || input.ms < 0)
      return invalid("ms", "INVALID", "ms는 0 이상 숫자여야 합니다.");
    delayPlan.set(op, { ms: input.ms, times: input.times ?? 1 });
    return HttpResponse.json({ data: { op, ...delayPlan.get(op) } });
  }),

  /** 시드로 되돌린다. `{empty: true}`면 0개. 미송, 채팅 목은 건드리지 않는다(`/__mock/chat/reset`) */
  http.post("*/__mock/notifications/reset", async ({ request }) => {
    const input = (await request.json().catch(() => ({}))) as {
      empty?: boolean;
    };
    resetRetailNotificationMock(input.empty === true);
    return HttpResponse.json({
      data: { notifications: notifications.length, unread: unread() },
    });
  }),
];

/** 시드로 되돌린다. 테스트와 `/__mock/notifications/reset`이 부른다 */
export function resetRetailNotificationMock(empty = false) {
  notifications = empty ? [] : seedNotifications(Date.now());
  failPlan.clear();
  delayPlan.clear();
}

resetRetailNotificationMock();
