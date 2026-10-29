import { setupServer } from "msw/node";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { WholesaleSchema } from "../../wholesale";
import { chatHandlers, resetChatMock } from "./chat";
import {
  notificationHandlers,
  resetNotificationMock,
  UNKNOWN_NOTIFICATION_TYPE,
} from "./notification";
import { mockOrders, orderHandlers, resetOrderMock } from "./order";

/**
 * 알림 계약 테스트(S10-2 ~ S10-7). 목을 `msw/node`로 띄워 실제 HTTP로 부른다.
 *
 * 무엇을 지키나: 헤더 종 화면(#295)과 나중의 BE가 같은 약속을 본다 — cursor 경계, 페이지 사이 신규 삽입,
 * 읽음 멱등, 모두 읽음 409, 배지 둘의 숫자. 이 테스트가 깨지면 목이 계약에서 벗어난 것이다.
 */

const ORIGIN = "http://mock.test";
const API = `${ORIGIN}/api/wholesale`;
const KNOB = `${ORIGIN}/__mock/notifications`;

type Notification = WholesaleSchema<"Notification">;
type Page = { data: Notification[]; meta: WholesaleSchema<"CursorPageMeta"> };
type Count = { data: WholesaleSchema<"NotificationUnreadCount"> };
type ReadResult = { data: WholesaleSchema<"MarkNotificationsReadResult"> };
interface ErrorBody {
  code: string;
  errors: { field: string }[];
}

const server = setupServer(
  ...chatHandlers,
  ...notificationHandlers,
  ...orderHandlers,
);
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterAll(() => server.close());
beforeEach(() => {
  resetChatMock();
  resetOrderMock();
  resetNotificationMock();
});

async function get<T>(url: string) {
  const res = await fetch(url);
  return { status: res.status, body: (await res.json()) as T };
}

async function post<T>(url: string, json: unknown) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(json),
  });
  return { status: res.status, body: (await res.json()) as T };
}

const list = (query = "") =>
  get<Page & ErrorBody>(`${API}/notifications${query}`);
const count = () => get<Count>(`${API}/notifications/unread-count`);
const read = (json: unknown) =>
  post<ReadResult & ErrorBody>(`${API}/notifications/read`, json);
const incoming = (json: unknown = { type: "NEW_ORDER" }) =>
  post<{ data: { notification: Notification; orderId: number } } & ErrorBody>(
    `${KNOB}/incoming`,
    json,
  );
const nextPage = (cursor: string | null) =>
  list(`?cursor=${encodeURIComponent(cursor ?? "")}`);

/** createdAt desc, 같으면 id desc 인지 */
function expectSorted(rows: Notification[]) {
  for (let i = 1; i < rows.length; i++) {
    const prev = rows[i - 1];
    const cur = rows[i];
    if (prev === undefined || cur === undefined) continue;
    const diff = Date.parse(prev.createdAt) - Date.parse(cur.createdAt);
    expect(diff).toBeGreaterThanOrEqual(0);
    if (diff === 0) expect(prev.id).toBeGreaterThan(cur.id);
  }
}

describe("S10-2 목록 cursor", () => {
  it("첫 장 20 + nextCursor, 둘째 장 5 + null, 겹침 0, createdAt desc → id desc", async () => {
    const first = await list();
    expect(first.status).toBe(200);
    expect(first.body.data).toHaveLength(20);
    expect(first.body.meta.nextCursor).not.toBeNull();

    const second = await nextPage(first.body.meta.nextCursor);
    expect(second.status).toBe(200);
    expect(second.body.data).toHaveLength(5);
    expect(second.body.meta.nextCursor).toBeNull();

    const all = [...first.body.data, ...second.body.data];
    expect(new Set(all.map((n) => n.id)).size).toBe(25);
    expectSorted(all);
  });

  it("같은 createdAt 인 21, 22번째는 id desc 로 갈리고 cursor 경계(20번째 뒤)에서 둘 다 둘째 장에 온다", async () => {
    const first = await list();
    const second = await nextPage(first.body.meta.nextCursor);
    const [n21, n22] = second.body.data;
    expect(n21).toBeDefined();
    expect(n22).toBeDefined();
    expect(n21?.createdAt).toBe(n22?.createdAt);
    expect(n21?.id ?? 0).toBeGreaterThan(n22?.id ?? 0);
  });

  it("cursor 가 tie 한가운데(21번째 뒤)여도 22번째를 빠뜨리거나 되풀이하지 않는다", async () => {
    const head = await list("?size=21");
    expect(head.body.data).toHaveLength(21);
    const tail = await nextPage(head.body.meta.nextCursor);
    expect(tail.body.data).toHaveLength(4);
    const ids = [...head.body.data, ...tail.body.data].map((n) => n.id);
    expect(new Set(ids).size).toBe(25);
  });

  it("id 만으로 정렬하면 순서가 달라진다(id 는 순서 의미 없음)", async () => {
    const first = await list();
    const ids = first.body.data.map((n) => n.id);
    expect(ids).not.toEqual([...ids].sort((a, b) => b - a));
  });

  it("첫 장 뒤에 새 알림이 와도 같은 cursor 의 둘째 장은 그대로 5개(중복 0, 누락 0)", async () => {
    const first = await list();
    const before = await nextPage(first.body.meta.nextCursor);
    const added = await incoming();
    expect(added.status).toBe(201);

    const after = await nextPage(first.body.meta.nextCursor);
    expect(after.body.data.map((n) => n.id)).toEqual(
      before.body.data.map((n) => n.id),
    );
    // 새 알림은 첫 장 맨 앞에 붙는다
    const again = await list();
    expect(again.body.data[0]?.id).toBe(added.body.data.notification.id);
  });

  it("잘못된 cursor, size 0, size 101, 정수 아닌 size → 400 VALIDATION_FAILED", async () => {
    for (const [query, field] of [
      ["?cursor=%%%", "cursor"],
      [`?cursor=${btoa("abc")}`, "cursor"],
      ["?size=0", "size"],
      ["?size=101", "size"],
      ["?size=2.5", "size"],
    ] as const) {
      const res = await list(query);
      expect(res.status, query).toBe(400);
      expect(res.body.code).toBe("VALIDATION_FAILED");
      expect(res.body.errors[0]?.field).toBe(field);
    }
  });
});

describe("S10-3 unread-count", () => {
  it("시드: notifications 3, chatsNeedingReply = 채팅 목 내 방 중 needsReply 방 수", async () => {
    const res = await count();
    expect(res.status).toBe(200);
    expect(res.body.data.notifications).toBe(3);

    const rooms = await get<{ data: WholesaleSchema<"ChatRoomSummary">[] }>(
      `${API}/chat/rooms?size=100`,
    );
    const needsReply = rooms.body.data.filter((r) => r.needsReply).length;
    expect(needsReply).toBeGreaterThan(0);
    expect(res.body.data.chatsNeedingReply).toBe(needsReply);
  });

  it("답 필요 방에 도매 답을 보내면 chatsNeedingReply 가 1 준다", async () => {
    const before = (await count()).body.data.chatsNeedingReply;
    const rooms = await get<{ data: WholesaleSchema<"ChatRoomSummary">[] }>(
      `${API}/chat/rooms?size=100`,
    );
    const target = rooms.body.data.find((r) => r.needsReply);
    expect(target).toBeDefined();

    const sent = await fetch(`${API}/chat/rooms/${target?.roomId}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": "0b7a4d2e-1c3f-4e5a-9b6c-7d8e9f0a1b2c",
      },
      body: JSON.stringify({ body: "네 있어요", inquiry: null }),
    });
    expect(sent.status).toBe(201);
    expect((await count()).body.data.chatsNeedingReply).toBe(before - 1);
  });

  it("incoming 1건 → notifications +1", async () => {
    await incoming();
    expect((await count()).body.data.notifications).toBe(4);
  });
});

describe("S10-4 ids 읽음", () => {
  it("{ids: [a]} → 2, 다시 → 2 이고 readAt 은 처음 값 그대로. 없는 id 가 섞여도 200", async () => {
    const first = await list();
    const target = first.body.data.find((n) => n.readAt === null);
    expect(target).toBeDefined();
    const id = target?.id ?? 0;

    const once = await read({ ids: [id] });
    expect(once.status).toBe(200);
    expect(once.body.data.notifications).toBe(2);
    const readAt = (await list()).body.data.find((n) => n.id === id)?.readAt;
    expect(readAt).not.toBeNull();

    const twice = await read({ ids: [id] });
    expect(twice.status).toBe(200);
    expect(twice.body.data.notifications).toBe(2);
    expect((await list()).body.data.find((n) => n.id === id)?.readAt).toBe(
      readAt,
    );

    const mixed = await read({ ids: [id, 999_999] });
    expect(mixed.status).toBe(200);
    expect(mixed.body.data.notifications).toBe(2);
  });

  it("이미 읽은 알림만 보내도 200 이고 수가 그대로", async () => {
    const first = await list();
    const done = first.body.data.find((n) => n.readAt !== null);
    const res = await read({ ids: [done?.id ?? 0] });
    expect(res.status).toBe(200);
    expect(res.body.data.notifications).toBe(3);
  });
});

describe("S10-5 모두 읽음", () => {
  it("{all, expectedUnread: 3} → 0, 둘째 장의 안 읽음까지 읽는다", async () => {
    const res = await read({ all: true, expectedUnread: 3 });
    expect(res.status).toBe(200);
    expect(res.body.data.notifications).toBe(0);
    const first = await list();
    const second = await nextPage(first.body.meta.nextCursor);
    const rows = [...first.body.data, ...second.body.data];
    expect(rows.filter((n) => n.readAt === null)).toHaveLength(0);
  });

  it("incoming 뒤 expectedUnread: 3 → 409 UNREAD_CHANGED, 안 읽음 4 그대로. 4 로 다시 → 0", async () => {
    await incoming();
    const stale = await read({ all: true, expectedUnread: 3 });
    expect(stale.status).toBe(409);
    expect(stale.body.code).toBe("UNREAD_CHANGED");
    expect((await count()).body.data.notifications).toBe(4);

    const fresh = await read({ all: true, expectedUnread: 4 });
    expect(fresh.status).toBe(200);
    expect(fresh.body.data.notifications).toBe(0);
  });

  it("다른 탭이 1개 읽은 뒤 expectedUnread: 3 → 409", async () => {
    const target = (await list()).body.data.find((n) => n.readAt === null);
    await read({ ids: [target?.id ?? 0] });
    const res = await read({ all: true, expectedUnread: 3 });
    expect(res.status).toBe(409);
    expect((await count()).body.data.notifications).toBe(2);
  });

  it("400: {}, {ids: []}, ids 101개, ids 와 all 같이, all 만, expectedUnread 0, 섞인 칸", async () => {
    const ids101 = Array.from({ length: 101 }, (_, i) => i + 1);
    for (const [body, field] of [
      [{}, "ids"],
      [{ ids: [] }, "ids"],
      [{ ids: ids101 }, "ids"],
      [{ ids: ["a"] }, "ids"],
      [{ ids: [1], all: true, expectedUnread: 3 }, "all"],
      [{ all: true }, "expectedUnread"],
      [{ all: true, expectedUnread: 0 }, "expectedUnread"],
      [{ all: false, expectedUnread: 3 }, "all"],
      [{ ids: [1], expectedUnread: 3 }, "expectedUnread"],
    ] as const) {
      const res = await read(body);
      expect(res.status, JSON.stringify(body)).toBe(400);
      expect(res.body.code).toBe("VALIDATION_FAILED");
      expect(res.body.errors[0]?.field, JSON.stringify(body)).toBe(field);
    }
    // 400 은 아무것도 바꾸지 않는다
    expect((await count()).body.data.notifications).toBe(3);
  });
});

describe("S10-6 incoming 손잡이", () => {
  it("NEW_ORDER → 주문 목 첫 행이 새 신규 주문(봄봄상회), 상세 200, 첫 알림 target 이 그 주문, 안 읽음 +1", async () => {
    const res = await incoming({ type: "NEW_ORDER" });
    expect(res.status).toBe(201);
    const { notification, orderId } = res.body.data;
    expect(orderId).toBe(7006);

    const orders = await get<{
      data: WholesaleSchema<"OrderSummaryResponse">[];
    }>(`${API}/orders`);
    const top = orders.body.data[0];
    expect(top?.id).toBe(orderId);
    expect(top?.status.key).toBe("NEW");
    expect(top?.retailerName).toBe("봄봄상회");

    const detail = await get<{ data: WholesaleSchema<"OrderDetailResponse"> }>(
      `${API}/orders/${orderId}`,
    );
    expect(detail.status).toBe(200);

    const first = (await list()).body.data[0];
    expect(first?.id).toBe(notification.id);
    expect(first?.type).toBe("NEW_ORDER");
    expect(first?.title).toBe("봄봄상회 새 주문");
    expect(first?.body).toBe("빈티지 플라워 셔츠 레드 / M, 1장");
    expect(first?.target).toEqual({ kind: "ORDER", id: orderId });
    expect(first?.readAt).toBeNull();
    expect((await count()).body.data.notifications).toBe(4);
  });

  it("ORDER_CANCELLED + 신규 주문 id → 그 주문 취소 + 알림. 신규가 아니면 409", async () => {
    const created = await incoming();
    const orderId = created.body.data.orderId;
    const cancelled = await incoming({ type: "ORDER_CANCELLED", orderId });
    expect(cancelled.status).toBe(201);
    expect(cancelled.body.data.notification.title).toBe("봄봄상회 주문 취소");
    expect(mockOrders().find((o) => o.id === orderId)?.status).toBe(
      "CANCELLED",
    );

    const again = await incoming({ type: "ORDER_CANCELLED", orderId });
    expect(again.status).toBe(409);
  });

  it("없는 orderId, 취소인데 orderId 없음, 그 밖의 type → 400", async () => {
    for (const body of [
      { type: "NEW_ORDER", orderId: 99_999 },
      { type: "ORDER_CANCELLED", orderId: 99_999 },
      { type: "ORDER_CANCELLED" },
      { type: "REFUNDED" },
    ]) {
      const res = await incoming(body);
      expect(res.status, JSON.stringify(body)).toBe(400);
    }
    expect(mockOrders()).toHaveLength(5);
  });

  it("PAYMENT_RECEIVED → 주문 없이 안 읽은 모르는 type 알림 1개, 안 읽음 +1", async () => {
    const res = await incoming({ type: UNKNOWN_NOTIFICATION_TYPE });
    expect(res.status).toBe(201);
    const first = (await list()).body.data[0];
    expect(first?.id).toBe(res.body.data.notification.id);
    expect(first?.type as string).toBe(UNKNOWN_NOTIFICATION_TYPE);
    expect(first?.readAt).toBeNull();
    expect(mockOrders()).toHaveLength(5);
    expect((await count()).body.data.notifications).toBe(4);
  });

  it("시드에 모르는 type 1개, ORDER_CANCELLED 2개가 있다", async () => {
    const first = await list();
    const second = await nextPage(first.body.meta.nextCursor);
    const rows = [...first.body.data, ...second.body.data];
    const types = rows.map((n) => n.type as string);
    expect(types.filter((t) => t === UNKNOWN_NOTIFICATION_TYPE)).toHaveLength(
      1,
    );
    expect(types.filter((t) => t === "ORDER_CANCELLED")).toHaveLength(2);
  });
});

describe("S10-7 fail, delay, reset 손잡이", () => {
  it("fail {count, 500} → 다음 1회만 500", async () => {
    await post(`${KNOB}/fail`, { op: "count", status: 500 });
    expect((await count()).status).toBe(500);
    expect((await count()).status).toBe(200);
  });

  it("fail {read, 500} → 읽음이 안 바뀐다", async () => {
    await post(`${KNOB}/fail`, { op: "read", status: 500 });
    const target = (await list()).body.data.find((n) => n.readAt === null);
    expect((await read({ ids: [target?.id ?? 0] })).status).toBe(500);
    expect((await count()).body.data.notifications).toBe(3);
  });

  it("fail {list, 401, times 2} → 2회 401 UNAUTHENTICATED 뒤 200", async () => {
    await post(`${KNOB}/fail`, { op: "list", status: 401, times: 2 });
    const a = await list();
    expect(a.status).toBe(401);
    expect(a.body.code).toBe("UNAUTHENTICATED");
    expect((await list()).status).toBe(401);
    expect((await list()).status).toBe(200);
  });

  it("delay {count} → 다음 1회만 늦고, 값은 요청 시점 것이다(늦은 응답이 read 뒤 옛 숫자로 도착)", async () => {
    await post(`${KNOB}/delay`, { op: "count", ms: 300 });
    const started = Date.now();
    const slow = count();
    // 지연된 count 가 도는 동안 읽음 1개 → read 응답은 2
    const target = (await list()).body.data.find((n) => n.readAt === null);
    const done = await read({ ids: [target?.id ?? 0] });
    expect(done.body.data.notifications).toBe(2);

    const late = await slow;
    expect(Date.now() - started).toBeGreaterThanOrEqual(290);
    expect(late.body.data.notifications).toBe(3);

    const quick = Date.now();
    expect((await count()).body.data.notifications).toBe(2);
    expect(Date.now() - quick).toBeLessThan(290);
  });

  it("reset {empty} → 0개, nextCursor null, 안 읽음 0. reset {} → 시드 25", async () => {
    await post(`${KNOB}/reset`, { empty: true });
    const empty = await list();
    expect(empty.body.data).toHaveLength(0);
    expect(empty.body.meta.nextCursor).toBeNull();
    expect((await count()).body.data.notifications).toBe(0);

    await post(`${KNOB}/reset`, {});
    const first = await list();
    const second = await nextPage(first.body.meta.nextCursor);
    expect(first.body.data.length + second.body.data.length).toBe(25);
  });

  it("reset 은 걸어 둔 fail 을 지운다", async () => {
    await post(`${KNOB}/fail`, { op: "count", status: 500, times: 5 });
    await post(`${KNOB}/reset`, {});
    expect((await count()).status).toBe(200);
  });

  it("모르는 op → 400", async () => {
    expect((await post(`${KNOB}/fail`, { op: "rooms" })).status).toBe(400);
    expect((await post(`${KNOB}/delay`, { op: "x", ms: 1 })).status).toBe(400);
  });
});

describe("chatsNeedingReply 정의는 채팅 목과 하나다", () => {
  it("채팅 목에서 내 방을 비우면 0(다른 도매처 방 33은 세지 않는다)", async () => {
    resetChatMock(0);
    expect((await count()).body.data.chatsNeedingReply).toBe(0);
  });
});
