import { setupServer } from "msw/node";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import type { RetailSchema } from "../../retail";
import { GOLDEN_T0 } from "../chat/golden.testkit";
import { resetRetailChatMock, retailChatHandlers } from "./chat";
import {
  RETAIL_UNKNOWN_NOTIFICATION_TYPE,
  resetRetailNotificationMock,
  retailNotificationHandlers,
} from "./notification";

/**
 * 소매 알림 계약 테스트(loop-06b S1-1 ~ S1-3, S1-5 ~ S1-7). 브라우저 소매 worker와 같은 구성(알림 + 채팅 핸들러)을
 * `msw/node`로 띄워 실제 HTTP로 부른다. 헤더 종(#305)과 나중의 BE가 같은 약속을 본다.
 *
 * 시계: `Date`만 T0(2026-10-29 14:20 서울)로 고정한다. 시드 시각과 미송 입고일이 reset 시각 기준이라서다.
 * msw `delay`(setTimeout)는 진짜다.
 */

const ORIGIN = "http://mock.test";
const API = `${ORIGIN}/api/retail`;
const KNOB = `${ORIGIN}/__mock/notifications`;

type Notification = RetailSchema<"Notification">;
type Page = { data: Notification[]; meta: RetailSchema<"CursorPageMeta"> };
type Count = { data: RetailSchema<"RetailUnreadCount"> };
type ReadResult = { data: RetailSchema<"MarkNotificationsReadResult"> };
type Incoming = { data: { created: number; notifications: Notification[] } };
interface ErrorBody {
  code: string;
  errors: { field: string; code: string }[];
}

const server = setupServer(
  ...retailNotificationHandlers,
  ...retailChatHandlers,
);
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterAll(() => server.close());
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(GOLDEN_T0);
  resetRetailChatMock();
  resetRetailNotificationMock();
});
afterEach(() => {
  vi.useRealTimers();
});

let keySeq = 0;
async function call<T>(method: string, url: string, json?: unknown) {
  keySeq += 1;
  const res = await fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": `00000000-0000-4000-b000-${String(keySeq).padStart(12, "0")}`,
    },
    body: json === undefined ? undefined : JSON.stringify(json),
  });
  const text = await res.text();
  return { status: res.status, text, body: JSON.parse(text) as T };
}

const list = (query = "") =>
  call<Page & ErrorBody>("GET", `${API}/notifications${query}`);
const read = (json: unknown) =>
  call<ReadResult & ErrorBody>("POST", `${API}/notifications/read`, json);
const count = () => call<Count>("GET", `${API}/notifications/unread-count`);
const knob = (path: string, json: unknown = {}) =>
  call<Incoming & ErrorBody>("POST", `${KNOB}${path}`, json);

/** 시연 장면 2: 3019 입고일을 R+10(10/29 기준 11/8)으로 */
const LINEN_D = "2026-11-08";
const dateChange = (extra: Record<string, unknown> = {}) =>
  knob("/incoming", {
    type: "BACKORDER_DATE_CHANGED",
    variantId: 3019,
    expectedInboundDate: LINEN_D,
    expectedInboundReason: "원단 수급 지연",
    ...extra,
  });

async function all(): Promise<Notification[]> {
  const first = await list("?size=100");
  return first.body.data;
}

/** JSON 안의 모든 키 */
function keysOf(value: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(value)) for (const v of value) keysOf(v, out);
  else if (value !== null && typeof value === "object")
    for (const [k, v] of Object.entries(value)) {
      out.add(k);
      keysOf(v, out);
    }
  return out;
}

describe("S1-1 계약 모양: target 갈래, 섞인 read 400", () => {
  it("codegen 타입: OrderTarget 에 wholesalerId 0, BackordersTarget 에 orderId 0 (typecheck 가 본다)", () => {
    const order: RetailSchema<"OrderTarget"> = { kind: "ORDER", orderId: 7001 };
    const backorders: RetailSchema<"BackordersTarget"> = {
      kind: "BACKORDERS",
      wholesalerId: 101,
    };
    const wrongOrder: RetailSchema<"OrderTarget"> = {
      kind: "ORDER",
      orderId: 7001,
      // @ts-expect-error OrderTarget 은 kind, orderId 뿐이다(additionalProperties false). 칸이 생기면 이 줄이 typecheck 를 깬다
      wholesalerId: 101,
    };
    const wrongBackorders: RetailSchema<"BackordersTarget"> = {
      kind: "BACKORDERS",
      wholesalerId: 101,
      // @ts-expect-error BackordersTarget 은 kind, wholesalerId 뿐이다
      orderId: 7001,
    };
    // @ts-expect-error ORDER 갈래인데 orderId 가 없으면 NotificationTarget 이 아니다
    const missing: RetailSchema<"NotificationTarget"> = { kind: "ORDER" };
    expect([
      order,
      backorders,
      wrongOrder,
      wrongBackorders,
      missing,
    ]).toHaveLength(5);
  });

  it("시드 target 은 kind 별 id 하나씩만 싣는다", async () => {
    for (const n of await all()) {
      const keys = Object.keys(n.target).sort();
      expect(keys).toEqual(
        n.target.kind === "ORDER"
          ? ["kind", "orderId"]
          : ["kind", "wholesalerId"],
      );
    }
  });

  it("orderId 없는 주문 알림({kind: ORDER}만)은 목이 안 만든다 → 400. {ids, all} 섞인 read → 400", async () => {
    const noId = await knob("/incoming", { type: "ORDER_CONFIRMED" });
    expect(noId.status).toBe(400);
    expect(noId.body.errors[0]?.field).toBe("orderId");
    const mixed = await read({ ids: [2022], all: true, expectedUnread: 2 });
    expect(mixed.status).toBe(400);
    expect(mixed.body.code).toBe("VALIDATION_FAILED");
  });
});

describe("S1-2 목록 cursor", () => {
  it("size 20 첫 장 20 + nextCursor, 둘째 장 2, 겹침 0. 정렬 createdAt desc, 같으면 id desc", async () => {
    const first = await list("?size=20");
    expect(first.status).toBe(200);
    expect(first.body.data).toHaveLength(20);
    expect(first.body.meta.nextCursor).not.toBeNull();
    const second = await list(
      `?size=20&cursor=${encodeURIComponent(first.body.meta.nextCursor ?? "")}`,
    );
    expect(second.body.data).toHaveLength(2);
    expect(second.body.meta.nextCursor).toBeNull();
    const ids = [...first.body.data, ...second.body.data].map((n) => n.id);
    expect(new Set(ids).size).toBe(22);

    const rows = [...first.body.data, ...second.body.data];
    for (let i = 1; i < rows.length; i++) {
      const a = rows[i - 1];
      const b = rows[i];
      if (a === undefined || b === undefined) continue;
      const diff = Date.parse(a.createdAt) - Date.parse(b.createdAt);
      expect(diff > 0 || (diff === 0 && a.id > b.id)).toBe(true);
    }
    // 20, 21번째는 createdAt 이 같다(tie). 21번째가 둘째 장 첫 행이다
    const twentieth = first.body.data[19];
    const twentyFirst = second.body.data[0];
    expect(twentieth?.createdAt).toBe(twentyFirst?.createdAt);
    expect((twentieth?.id ?? 0) > (twentyFirst?.id ?? 0)).toBe(true);
  });

  it("type 구성: 입고일 변경 8, 확정 6, 배분 4, 출고 3, 모르는 type 1. 시각은 reset 기준 1~3일 전", async () => {
    const rows = await all();
    const byType = new Map<string, number>();
    for (const n of rows) byType.set(n.type, (byType.get(n.type) ?? 0) + 1);
    expect(Object.fromEntries(byType)).toEqual({
      BACKORDER_DATE_CHANGED: 8,
      ORDER_CONFIRMED: 6,
      BACKORDER_ALLOCATED: 4,
      SHIPPED: 3,
      [RETAIL_UNKNOWN_NOTIFICATION_TYPE]: 1,
    });
    const now = GOLDEN_T0;
    for (const n of rows) {
      const age = now - Date.parse(n.createdAt);
      expect(age).toBeGreaterThanOrEqual(24 * 3_600_000);
      expect(age).toBeLessThanOrEqual(3 * 24 * 3_600_000);
    }
    expect(rows[0]).toMatchObject({
      type: "BACKORDER_DATE_CHANGED",
      title: "무드온 미송 입고일 변경",
      body: "린넨 셋업 자켓 베이지/L 남은 2장, 11/3(화) → 11/5(목)",
      target: { kind: "BACKORDERS", wholesalerId: 101 },
      readAt: null,
    });
  });

  it("첫 장 뒤 incoming 1건 → 같은 cursor 둘째 장 그대로(새 알림은 첫 장 앞에 붙는다)", async () => {
    const first = await list("?size=20");
    const cursor = encodeURIComponent(first.body.meta.nextCursor ?? "");
    const before = (await list(`?size=20&cursor=${cursor}`)).body.data;
    expect((await dateChange()).body.data.created).toBe(1);
    const after = (await list(`?size=20&cursor=${cursor}`)).body.data;
    expect(after.map((n) => n.id)).toEqual(before.map((n) => n.id));
    expect((await list("?size=1")).body.data[0]?.body).toBe(
      "린넨 셋업 자켓 베이지/L 남은 2장, 11/5(목) → 11/8(일)",
    );
  });

  it("잘못된 cursor, size 0, 101, 글자 → 400 VALIDATION_FAILED", async () => {
    for (const q of [
      "?cursor=%%%",
      `?cursor=${btoa("abc")}`,
      "?size=0",
      "?size=101",
      "?size=a",
    ]) {
      const res = await list(q);
      expect(res.status, q).toBe(400);
      expect(res.body.code).toBe("VALIDATION_FAILED");
    }
    expect((await list("?size=100")).status).toBe(200);
  });
});

describe("S1-3 읽음", () => {
  it("{ids:[a]} → 1, 다시 → 1(readAt 그대로), 없는 id 는 무시", async () => {
    const one = await read({ ids: [2022] });
    expect(one.body.data.notifications).toBe(1);
    const readAt = (await all()).find((n) => n.id === 2022)?.readAt;
    expect(readAt).not.toBeNull();

    vi.setSystemTime(GOLDEN_T0 + 60_000);
    const again = await read({ ids: [2022, 999_999] });
    expect(again.status).toBe(200);
    expect(again.body.data.notifications).toBe(1);
    expect((await all()).find((n) => n.id === 2022)?.readAt).toBe(readAt);
  });

  it("{all, expectedUnread: 2} → 0. 둘째 장(21번째) 안 읽음까지 읽는다", async () => {
    const res = await read({ all: true, expectedUnread: 2 });
    expect(res.status).toBe(200);
    expect(res.body.data.notifications).toBe(0);
    expect((await all()).every((n) => n.readAt !== null)).toBe(true);
  });

  it("incoming 뒤 같은 요청(expectedUnread 2) → 409 UNREAD_CHANGED, 안 읽음 3 그대로", async () => {
    await dateChange();
    const res = await read({ all: true, expectedUnread: 2 });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("UNREAD_CHANGED");
    expect((await count()).body.data.notifications).toBe(3);
    expect((await all()).filter((n) => n.readAt === null)).toHaveLength(3);
  });

  it("400 6종(도매 S10-5와 같다) + 중복 ids, 남는 칸", async () => {
    const cases: [unknown, string][] = [
      [{ ids: [2022], all: true, expectedUnread: 2 }, "all"],
      [{}, "ids"],
      [{ ids: [] }, "ids"],
      [{ ids: Array.from({ length: 101 }, (_, i) => i + 1) }, "ids"],
      [{ all: true }, "expectedUnread"],
      [{ all: true, expectedUnread: 0 }, "expectedUnread"],
      [{ ids: [2022, 2022] }, "ids"],
      [{ ids: [2022], extra: 1 }, "extra"],
    ];
    for (const [body, field] of cases) {
      const res = await read(body);
      expect(res.status, JSON.stringify(body)).toBe(400);
      expect(res.body.code).toBe("VALIDATION_FAILED");
      expect(res.body.errors[0]?.field, JSON.stringify(body)).toBe(field);
    }
    // 아무것도 안 바뀌었다
    expect((await count()).body.data.notifications).toBe(2);
  });
});

describe("S1-5 count", () => {
  it("시드 {notifications 2, latestNotificationId = 첫 행 id}. id 최대값(2031)이 아니다", async () => {
    const first = (await list("?size=1")).body.data[0];
    const c = (await count()).body.data;
    expect(c.notifications).toBe(2);
    expect(c.latestNotificationId).toBe(first?.id);
    expect(c.latestNotificationId).toBe(2022);
    expect(Math.max(...(await all()).map((n) => n.id))).toBe(2031);
  });

  it("incoming 뒤 3 과 새 id(목록 첫 행), read 뒤 감소, chats 는 채팅 목 값 그대로", async () => {
    const chatsBefore = (await count()).body.data.chats;
    const injected = (await dateChange()).body.data.notifications[0];
    const c = (await count()).body.data;
    expect(c.notifications).toBe(3);
    expect(c.latestNotificationId).toBe(injected?.id);
    expect((await list("?size=1")).body.data[0]?.id).toBe(injected?.id);
    expect(c.chats).toBe(chatsBefore);

    await read({ ids: [injected?.id ?? 0] });
    const after = (await count()).body.data;
    expect(after.notifications).toBe(2);
    // 읽어도 최신 알림은 그대로다(새 알림 판단은 읽음과 무관)
    expect(after.latestNotificationId).toBe(injected?.id);
  });

  it("reset {empty} → 0, null. 빈 목록", async () => {
    const res = await knob("/reset", { empty: true });
    expect(res.status).toBe(200);
    const c = (await count()).body.data;
    expect(c.notifications).toBe(0);
    expect(c.latestNotificationId).toBeNull();
    const page = await list();
    expect(page.body.data).toEqual([]);
    expect(page.body.meta.nextCursor).toBeNull();
  });
});

describe("S1-6 incoming 과 손잡이", () => {
  it("입고일 변경 주입 뒤 소매 '린넨 자켓 베이지 L 언제 와요?' → 미송 답 날짜 D(옛 날짜 0), 사유 그대로", async () => {
    await dateChange();
    const res = await call<{ data: RetailSchema<"ChatSendResult"> }>(
      "POST",
      `${API}/chat/rooms/1/messages`,
      { body: "린넨 자켓 베이지 L 언제 와요?", inquiry: null },
    );
    expect(res.status).toBe(201);
    const reply = res.body.data.generatedMessages[0];
    expect(reply?.kind).toBe("AUTO_REPLY");
    expect(reply?.autoReply?.facts.backorder).toEqual({
      qty: 2,
      expectedInboundDate: LINEN_D,
      expectedInboundReason: "원단 수급 지연",
    });
    expect(reply?.body).toContain("11월 8일");
    expect(reply?.body).not.toContain("11월 5일");
  });

  it("사유를 빼고 주입하면 사유 null(전체 대체), 날짜 null 주입이면 사유도 null + '… → 입고일 미정'", async () => {
    const ask = () =>
      call<{ data: RetailSchema<"ChatSendResult"> }>(
        "POST",
        `${API}/chat/rooms/1/messages`,
        { body: "린넨 자켓 베이지 L 언제 와요?", inquiry: null },
      );
    await dateChange({ expectedInboundReason: undefined });
    const noReason = (await ask()).body.data.generatedMessages[0];
    expect(noReason?.autoReply?.facts.backorder?.expectedInboundReason).toBe(
      null,
    );
    expect(noReason?.body).not.toContain("원단 수급 지연");

    const cleared = await knob("/incoming", {
      type: "BACKORDER_DATE_CHANGED",
      variantId: 3019,
      expectedInboundDate: null,
      expectedInboundReason: "남으면 안 되는 사유",
    });
    expect(cleared.body.data.notifications[0]?.body).toBe(
      "린넨 셋업 자켓 베이지/L 남은 2장, 11/8(일) → 입고일 미정",
    );
    const none = (await ask()).body.data.generatedMessages[0];
    expect(none?.autoReply?.facts.backorder).toMatchObject({
      expectedInboundDate: null,
      expectedInboundReason: null,
    });
  });

  it("같은 날짜(사유만 바꿈) → created 0, 미송 목 사유는 바뀐다", async () => {
    const same = await knob("/incoming", {
      type: "BACKORDER_DATE_CHANGED",
      variantId: 3019,
      expectedInboundDate: "2026-11-05",
      expectedInboundReason: "입고 확인",
    });
    expect(same.status).toBe(200);
    expect(same.body.data.created).toBe(0);
    expect((await count()).body.data.notifications).toBe(2);
  });

  it("주문 알림 주입: 확정, 출고, 배분(qty)은 ORDER target 1건. 배분에 qty 없음 → 400", async () => {
    for (const [type, extra] of [
      ["ORDER_CONFIRMED", {}],
      ["SHIPPED", {}],
      ["BACKORDER_ALLOCATED", { qty: 2 }],
    ] as const) {
      const res = await knob("/incoming", { type, orderId: 7001, ...extra });
      expect(res.status, type).toBe(200);
      expect(res.body.data.notifications[0]).toMatchObject({
        type,
        target: { kind: "ORDER", orderId: 7001 },
        readAt: null,
      });
    }
    expect(
      (
        await knob("/incoming", {
          type: "BACKORDER_ALLOCATED",
          orderId: 7001,
        })
      ).status,
    ).toBe(400);
  });

  it("없는 variantId, 모르는 type(PAYMENT_DUE 포함), 날짜 형식 오류, 날짜 칸 없음 → 400", async () => {
    const bad = [
      {
        type: "BACKORDER_DATE_CHANGED",
        variantId: 9999,
        expectedInboundDate: LINEN_D,
      },
      { type: "BACKORDER_DATE_CHANGED", expectedInboundDate: LINEN_D },
      {
        type: "BACKORDER_DATE_CHANGED",
        variantId: 3019,
        expectedInboundDate: "11/8",
      },
      { type: "BACKORDER_DATE_CHANGED", variantId: 3019 },
      { type: RETAIL_UNKNOWN_NOTIFICATION_TYPE, orderId: 7001 },
      { type: "NEW_ORDER", orderId: 7001 },
    ];
    for (const body of bad) {
      const res = await knob("/incoming", body);
      expect(res.status, JSON.stringify(body)).toBe(400);
      expect(res.body.code).toBe("VALIDATION_FAILED");
    }
    expect((await count()).body.data.notifications).toBe(2);
  });

  it("fail {list, 500} 다음 1회만, fail {read, 401} 은 UNAUTHORIZED, 403 은 ACCOUNT_NOT_APPROVED", async () => {
    await knob("/fail", { op: "list", status: 500 });
    expect((await list()).status).toBe(500);
    expect((await list()).status).toBe(200);

    await knob("/fail", { op: "read", status: 401 });
    const r401 = await read({ ids: [2022] });
    expect(r401.status).toBe(401);
    expect(r401.body.code).toBe("UNAUTHORIZED");
    // 실패한 read 는 아무것도 안 읽었다
    expect((await count()).body.data.notifications).toBe(2);

    await knob("/fail", { op: "list", status: 403 });
    expect((await list()).body.code).toBe("ACCOUNT_NOT_APPROVED");
  });

  it("delay {read, 3000} → 3초 뒤 응답, 값은 요청 시점 것. count 손잡이는 06a 것(/__mock/chat)이라 여기선 400", async () => {
    await knob("/delay", { op: "read", ms: 3000 });
    const started = performance.now();
    const res = await read({ ids: [2022] });
    expect(performance.now() - started).toBeGreaterThanOrEqual(2900);
    expect(res.body.data.notifications).toBe(1);

    expect((await knob("/delay", { op: "count", ms: 10 })).status).toBe(400);
    expect((await knob("/fail", { op: "count" })).status).toBe(400);
  }, 10_000);

  it("reset 은 fail 과 delay 를 지우고 시드(안 읽음 2)로", async () => {
    await read({ all: true, expectedUnread: 2 });
    await knob("/fail", { op: "list", status: 500, times: 3 });
    await knob("/reset");
    expect((await list()).status).toBe(200);
    expect((await count()).body.data.notifications).toBe(2);
  });
});

describe("S1-7 누출", () => {
  it("3003 주입 뒤 목록과 count JSON 에 retailerName availableQty retailerId 키 0, 대기상회 몫(9장) 0", async () => {
    const res = await knob("/incoming", {
      type: "BACKORDER_DATE_CHANGED",
      variantId: 3003,
      expectedInboundDate: "2026-11-02",
    });
    // 규칙은 봄봄, 대기상회 2건을 내지만 "나"(봄봄) 몫 1건만 저장한다
    expect(res.body.data.created).toBe(1);
    expect(res.body.data.notifications[0]?.body).toBe(
      "빈티지 플라워 셔츠 레드/L 남은 6장, 10/26(월) → 11/2(월)",
    );

    const texts = [
      (await list("?size=100")).text,
      (await count()).text,
      res.text,
    ];
    for (const text of texts) {
      const keys = keysOf(JSON.parse(text));
      for (const k of ["retailerName", "availableQty", "retailerId"])
        expect(keys.has(k), k).toBe(false);
      expect(text).not.toMatch(/(?<![~\d])9장/);
      expect(text).not.toMatch(/(?<![~\d])15장/);
      expect(text).not.toContain("대기상회");
    }
  });
});
