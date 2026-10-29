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

/**
 * 소매 목의 미송 답 누출과 헤더 배지 op 계약(loop-06 S1-4, S1-5). **소매 핸들러만** 올린다 — 브라우저 소매
 * worker와 같은 구성이고, 소매 전용 손잡이(`fail {count}`, `delay`, `reset {empty}`)가 도매 손잡이에 먹히지 않는다.
 *
 * 시계: `Date`만 T0(2026-10-29 14:20 서울)로 고정한다. 미송 입고일이 reset 시각 기준이라서다. msw `delay`는 진짜다.
 */

const ORIGIN = "http://mock.test";
const RETAIL = `${ORIGIN}/api/retail`;

type SendResult = RetailSchema<"ChatSendResult">;
type Message = RetailSchema<"ChatMessage">;
type UnreadCount = RetailSchema<"RetailUnreadCount">;

const server = setupServer(...retailChatHandlers);
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterAll(() => server.close());
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(GOLDEN_T0);
  resetRetailChatMock();
});
afterEach(() => {
  vi.useRealTimers();
});

async function call<T>(method: string, url: string, json?: unknown) {
  const res = await fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": newKey(),
    },
    body: json === undefined ? undefined : JSON.stringify(json),
  });
  const text = await res.text();
  return { status: res.status, text, body: JSON.parse(text) as T };
}

let keySeq = 0;
function newKey() {
  keySeq += 1;
  return `00000000-0000-4000-a000-${String(keySeq).padStart(12, "0")}`;
}

const knob = (path: string, json: unknown = {}) =>
  call<unknown>("POST", `${ORIGIN}/__mock/chat${path}`, json);

function send(
  body: string,
  inquiry: Partial<RetailSchema<"ChatInquiry">> | null = null,
  roomId = 1,
) {
  return call<{ data: SendResult }>(
    "POST",
    `${RETAIL}/chat/rooms/${roomId}/messages`,
    {
      body,
      inquiry:
        inquiry === null
          ? null
          : {
              intent: "BACKORDER",
              listingId: null,
              variantId: null,
              backorderId: null,
              label: null,
              ...inquiry,
            },
    },
  );
}

const count = () =>
  call<{ data: UnreadCount }>("GET", `${RETAIL}/notifications/unread-count`);

/** 정확 수량 글자. 앞이 숫자나 `~`면 다른 수(19장, 10~49장)라 뺀다 */
const EXACT_9 = /(?<![~\d])9장/;
const EXACT_15 = /(?<![~\d])15장/;
const EXACT_20 = /(?<![~\d])20장/;

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

describe("S1-4 미송 답 누출(소매 응답 전부)", () => {
  it("미송 답 2건 뒤 send, messages, rooms, rooms/1, unread-count 에 availableQty remainingQty retailerName 키 0, 남의 수량 9장, SKU 합 15장 글자 0", async () => {
    const texts: string[] = [];
    const ask = await send("지난주 주문한 거 언제 와요?");
    texts.push(ask.text);
    const clarify = ask.body.data.generatedMessages[0];
    expect(clarify?.kind).toBe("CLARIFY");
    const label = (id: number) =>
      clarify?.autoReply?.choices?.find((c) => c.backorderId === id)?.label ??
      "";

    const a9006 = await send(label(9006), {
      backorderId: 9006,
      variantId: 3003,
    });
    const a9003 = await send(label(9003), {
      backorderId: 9003,
      variantId: 3019,
    });
    texts.push(a9006.text, a9003.text);
    // 빈 검사 방지: 미송 자동 답이 실제로 2건 나갔다
    const answers = [a9006, a9003].map((r) => r.body.data.generatedMessages[0]);
    expect(answers.map((m) => m?.autoReply?.facts.backorder?.qty)).toEqual([
      2, 2,
    ]);

    texts.push(
      (await call("GET", `${RETAIL}/chat/rooms/1/messages?size=100`)).text,
    );
    texts.push((await call("GET", `${RETAIL}/chat/rooms`)).text);
    texts.push((await call("GET", `${RETAIL}/chat/rooms/1`)).text);
    texts.push((await count()).text);

    const all = texts.join("\n");
    const keys = keysOf(texts.map((t) => JSON.parse(t) as unknown));
    for (const k of ["availableQty", "remainingQty", "retailerName"])
      expect(keys.has(k), k).toBe(false);
    // 9005(대기상회) 9장, SKU 3003 미송 합 4 + 9 + 2 = 15장. 재고 구간 글자 "10~49장"의 9장은 세지 않는다
    expect(all).not.toMatch(EXACT_9);
    expect(all).not.toMatch(EXACT_15);
    expect(all).toContain("10~49장");
    // 9006 답에는 원래 수량(4장)이 없다. 9001 칩 글자 "남은 4장"은 봄봄상회 자기 미송이라 되묻기에는 있다
    expect(a9006.text).not.toMatch(/(?<![~\d])4장/);
    expect(answers[0]?.body).toBe(
      "빈티지 플라워 셔츠 레드 L 남은 미송 2장은 등록된 입고 예정일 10월 26일이 지났어요",
    );
    expect(answers[1]?.body).toBe(
      "린넨 셋업 자켓 베이지 L 남은 미송 2장은 11월 5일 도매 입고 예정이에요(원단 수급 지연)",
    );
  });

  it("남의 미송: 방 1에 backorderId 9005(대기상회), 801(도매처 102) 직접 POST → 넘김만, facts 없음", async () => {
    for (const [id, variantId] of [
      [9005, 3003],
      [801, 3801],
    ] as const) {
      resetRetailChatMock();
      await send("미송 언제 와요?");
      const res = await send("이거요", { backorderId: id, variantId });
      expect(
        res.body.data.generatedMessages.map((m) => m.kind),
        `${id}`,
      ).toEqual(["HANDOFF"]);
      expect(res.text).not.toMatch(EXACT_9);
      expect(res.text).not.toMatch(EXACT_20);
    }
  });

  it("방 33(라온 102)에서는 봄봄상회의 801 이 후보다 — 소유 필터가 방의 도매처로 갈린다", async () => {
    const one = await send("미송 언제 와요?", null, 33);
    // 방 33 시드에 사람 넘김이 열려 있어도 되묻기는 붙는다
    expect(
      one.body.data.generatedMessages[0]?.autoReply?.choices?.map(
        (c) => c.backorderId,
      ),
    ).toEqual([801, null]);
    // 후보 1개 + 색상과 사이즈 둘 다 → 확정 답(넘김 없음, 입고일 T0+5)
    const sure = await send("블랙 L 미송 언제 와요?", null, 33);
    const [reply] = sure.body.data.generatedMessages;
    expect(reply?.autoReply?.subject.backorderId).toBe(801);
    expect(reply?.autoReply?.facts.backorder).toEqual({
      qty: 20,
      expectedInboundDate: "2026-11-03",
      expectedInboundReason: null,
    });
  });
});

describe("S1-5 unread-count", () => {
  async function roomsUnreadSum() {
    const rooms = await call<{ data: { unreadCount: number }[] }>(
      "GET",
      `${RETAIL}/chat/rooms`,
    );
    return rooms.body.data.reduce((s, r) => s + r.unreadCount, 0);
  }

  it("시드 {notifications 0, chats = 방 1과 33 unreadCount 합}, 도매 답 주입 +1, 읽음 뒤 감소", async () => {
    const seed = await count();
    expect(seed.status).toBe(200);
    expect(seed.body.data).toEqual({
      notifications: 0,
      chats: await roomsUnreadSum(),
      latestNotificationId: null,
    });
    const before = seed.body.data.chats;

    await knob("/rooms/1/incoming", { body: "네 확인해 볼게요" });
    expect((await count()).body.data.chats).toBe(before + 1);

    const messages = await call<{ meta: { maxSequence: number } }>(
      "GET",
      `${RETAIL}/chat/rooms/1/messages`,
    );
    await call("POST", `${RETAIL}/chat/rooms/1/read`, {
      lastReadSequence: messages.body.meta.maxSequence,
    });
    const after = (await count()).body.data.chats;
    expect(after).toBeLessThan(before + 1);
    expect(after).toBe(await roomsUnreadSum());
  });

  it("fail {count, 401} → 다음 1회 401 UNAUTHORIZED, fail {count, 403} → 403 ACCOUNT_NOT_APPROVED, 그다음 200", async () => {
    await knob("/fail", { op: "count", status: 401 });
    const u = await call<{ code: string }>(
      "GET",
      `${RETAIL}/notifications/unread-count`,
    );
    expect([u.status, u.body.code]).toEqual([401, "UNAUTHORIZED"]);
    await knob("/fail", { op: "count", status: 403 });
    const f = await call<{ code: string }>(
      "GET",
      `${RETAIL}/notifications/unread-count`,
    );
    expect([f.status, f.body.code]).toEqual([403, "ACCOUNT_NOT_APPROVED"]);
    expect((await count()).status).toBe(200);
  });

  it("delay {count, 300} → 늦게 오고 값은 요청 시점 것(그사이 읽음이 끝나도 옛 수). delay {read} 도 늦는다", async () => {
    await knob("/rooms/1/incoming", { body: "답이에요" });
    const old = (await count()).body.data.chats;
    await knob("/delay", { op: "count", ms: 300 });
    const started = performance.now();
    const slow = count();
    const messages = await call<{ meta: { maxSequence: number } }>(
      "GET",
      `${RETAIL}/chat/rooms/1/messages`,
    );
    await call("POST", `${RETAIL}/chat/rooms/1/read`, {
      lastReadSequence: messages.body.meta.maxSequence,
    });
    const fresh = (await count()).body.data.chats;
    const late = await slow;
    expect(performance.now() - started).toBeGreaterThanOrEqual(290);
    expect(late.body.data.chats).toBe(old);
    expect(fresh).toBeLessThan(old);

    await knob("/delay", { op: "read", ms: 300 });
    const t = performance.now();
    const read = await call<{ data: { lastReadSequence: number } }>(
      "POST",
      `${RETAIL}/chat/rooms/1/read`,
      { lastReadSequence: 1 },
    );
    expect(performance.now() - t).toBeGreaterThanOrEqual(290);
    // 내려가지 않는다(max)
    expect(read.body.data.lastReadSequence).toBe(
      messages.body.meta.maxSequence,
    );
  });

  it("모르는 delay op → 400, reset 은 fail 과 delay 를 지운다", async () => {
    expect((await knob("/delay", { op: "send", ms: 10 })).status).toBe(400);
    await knob("/fail", { op: "count", status: 500, times: 3 });
    await knob("/reset");
    expect((await count()).status).toBe(200);
  });
});

describe("소매 reset 손잡이", () => {
  it("{empty: true} → 내 방 0개, chats 0", async () => {
    await knob("/reset", { empty: true });
    const rooms = await call<{ data: unknown[] }>(
      "GET",
      `${RETAIL}/chat/rooms`,
    );
    expect(rooms.body.data).toEqual([]);
    expect((await count()).body.data).toEqual({
      notifications: 0,
      chats: 0,
      latestNotificationId: null,
    });
  });

  it('{noBackorders: true} → "미송 언제 와요?" 넘김(후보 0개), 다시 reset 하면 되묻기', async () => {
    await knob("/reset", { noBackorders: true });
    const none = await send("미송 언제 와요?");
    expect(
      none.body.data.generatedMessages.map((m: Message) => m.kind),
    ).toEqual(["HANDOFF"]);
    await knob("/reset");
    const some = await send("미송 언제 와요?");
    expect(some.body.data.generatedMessages[0]?.kind).toBe("CLARIFY");
  });

  it("`다른 주문이에요`(notListed) → 넘김. 같은 글자를 손으로 치면 새 판정(되묻기 계승 → 넘김이지만 notListed 가 아니다)", async () => {
    const ask = await send("미송 언제 와요?");
    const last = ask.body.data.generatedMessages[0]?.autoReply?.choices?.at(-1);
    expect(last).toMatchObject({
      kind: "NOT_LISTED",
      label: "다른 주문이에요",
    });
    const picked = await send("다른 주문이에요", {
      variantId: 0,
      notListed: true,
    });
    expect(picked.body.data.generatedMessages.map((m) => m.kind)).toEqual([
      "HANDOFF",
    ]);
    // 손으로 친 같은 글자: 의도 키워드가 없어 계승만 보고, 보기 안에서 확정 못 해 넘김 — 판정 경로가 다르다(unit B10, B12)
    resetRetailChatMock();
    await send("미송 언제 와요?");
    const typed = await send("다른 주문이에요");
    expect(typed.body.data.generatedMessages.map((m) => m.kind)).toEqual([
      "HANDOFF",
    ]);
  });
});
