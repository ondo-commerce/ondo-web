import { setupServer } from "msw/node";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { RetailSchema } from "../../retail";
import type { PlannedFailureLog } from "../wholesale/chat";
import { resetRetailChatMock, retailChatHandlers } from "./chat";

/**
 * 소매 messages `page` 손잡이, 보내기 지연, 지연된 실패, 응답 기록, `retail-history` 시드(loop-08d S1-1 ~ S1-3, #350).
 * 소매 브라우저 worker와 같은 구성(소매 핸들러만)으로 띄운다 — 도매 핸들러를 같이 올리면 `/__mock/chat/fail`,
 * `delay`를 도매 것이 먼저 잡는다(`chatMe.test.ts`와 같은 이유).
 *
 * 무엇을 지키나: 소매 이전 메시지(#351), 새 메시지 N개(#352), 같은 계정 재로그인 경합의 소매 확인(#344) e2e가
 * 이 손잡이로 순서를 만든다. 손잡이가 종류를 못 가르면 e2e가 엉뚱한 요청을 늦추고도 통과한다.
 * 지연은 기획의 3초 대신 600ms로 잰다 — 뜻(그 요청만 늦다)은 같고 테스트가 늘지 않는다.
 */

const ORIGIN = "http://mock.test";
const API = `${ORIGIN}/api/retail/chat`;
const KNOB = `${ORIGIN}/__mock/chat`;
const SLOW_MS = 600;
/** 지연 없는 요청이 이보다 빨리 와야 한다. 지연 판정은 SLOW_MS − 50 이상 */
const FAST_MS = 300;

const MESSAGES = `${API}/rooms/1/messages`;
const LATEST = MESSAGES;
const BEFORE = `${MESSAGES}?beforeSequence=2&size=50`;
const AFTER = `${MESSAGES}?afterSequence=0`;

type ChatMessage = RetailSchema<"ChatMessage">;
interface MessagesPage {
  data: ChatMessage[];
  meta: { hasMore: boolean; maxSequence: number };
}
interface ErrorBody {
  code: string;
  errors: { field: string }[];
}

const server = setupServer(...retailChatHandlers);
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterAll(() => server.close());
beforeEach(() => resetRetailChatMock());

async function call<T>(
  method: string,
  url: string,
  json?: unknown,
  headers: Record<string, string> = {},
) {
  const start = performance.now();
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json", ...headers },
    body: json === undefined ? undefined : JSON.stringify(json),
  });
  const body = (await res.json()) as T;
  return { status: res.status, body, ms: performance.now() - start };
}

const knob = (path: string, json: unknown = {}) =>
  call<{ data: Record<string, unknown> } & ErrorBody>(
    "POST",
    `${KNOB}${path}`,
    json,
  );
const get = (url: string) => call<MessagesPage & ErrorBody>("GET", url);
const send = (body: string, key: string) =>
  call<{ data: RetailSchema<"ChatSendResult"> } & ErrorBody>(
    "POST",
    MESSAGES,
    { body },
    { "Idempotency-Key": key },
  );
const failureLog = async () =>
  (await call<{ data: PlannedFailureLog[] }>("GET", `${KNOB}/log`)).body.data;

const KEY_A = "11111111-1111-4111-8111-111111111111";
const KEY_B = "22222222-2222-4222-8222-222222222222";

describe("S1-1 소매 fail, delay {op: messages, page}", () => {
  it("fail page before 500 → before 500, 그 뒤 after와 latest 200, before도 다음엔 200", async () => {
    const set = await knob("/fail", {
      op: "messages",
      page: "before",
      status: 500,
    });
    expect(set.status).toBe(200);
    expect(set.body.data).toEqual({
      op: "messages",
      page: "before",
      status: 500,
      times: 1,
    });
    expect((await get(AFTER)).status).toBe(200);
    expect((await get(LATEST)).status).toBe(200);
    expect((await get(BEFORE)).status).toBe(500);
    expect((await get(BEFORE)).status).toBe(200);
  });

  it("delay page after → after 1회만 늦고 before, latest는 바로", async () => {
    await knob("/delay", { op: "messages", page: "after", ms: SLOW_MS });
    expect((await get(BEFORE)).ms).toBeLessThan(FAST_MS);
    expect((await get(LATEST)).ms).toBeLessThan(FAST_MS);
    const after = await get(AFTER);
    expect(after.status).toBe(200);
    expect(after.ms).toBeGreaterThanOrEqual(SLOW_MS - 50);
    expect((await get(AFTER)).ms).toBeLessThan(FAST_MS);
  });

  it('page "x" → 400 VALIDATION_FAILED(page). messages 밖 op에 page를 붙여도 400, 계획은 안 남는다', async () => {
    for (const [path, json] of [
      ["/delay", { op: "messages", page: "x", ms: 10 }],
      ["/fail", { op: "messages", page: "x" }],
      ["/delay", { op: "send", page: "before", ms: 10 }],
      ["/fail", { op: "room", page: "latest" }],
    ] as const) {
      const res = await knob(path, json);
      expect(res.status, `${path} ${JSON.stringify(json)}`).toBe(400);
      expect(res.body.code).toBe("VALIDATION_FAILED");
      expect(res.body.errors[0]?.field).toBe("page");
    }
    expect((await get(BEFORE)).status).toBe(200);
  });

  it("page 없이 걸면 예전처럼 종류 상관없이 다음 1회(응답 data 모양도 예전 그대로)", async () => {
    const failSet = await knob("/fail", { op: "messages", status: 500 });
    expect(failSet.body.data).toEqual({
      op: "messages",
      status: 500,
      times: 1,
    });
    expect((await get(AFTER)).status).toBe(500);
    expect((await get(BEFORE)).status).toBe(200);
    const delaySet = await knob("/delay", { op: "messages", ms: SLOW_MS });
    expect(delaySet.body.data).toEqual({
      op: "messages",
      ms: SLOW_MS,
      times: 1,
    });
    expect((await get(BEFORE)).ms).toBeGreaterThanOrEqual(SLOW_MS - 50);
    expect((await get(BEFORE)).ms).toBeLessThan(FAST_MS);
  });

  it("page가 맞는 계획을 먼저 쓴다: page 없는 401 + page before 500 → before 500, latest 401", async () => {
    await knob("/fail", { op: "messages", status: 401 });
    await knob("/fail", { op: "messages", page: "before", status: 500 });
    expect((await get(BEFORE)).status).toBe(500);
    const latest = await get(LATEST);
    expect(latest.status).toBe(401);
    expect(latest.body.code).toBe("UNAUTHORIZED");
    expect((await get(LATEST)).status).toBe(200);
  });
});

describe("S1-2 소매 보내기 지연, 지연된 실패, 응답 기록", () => {
  it("delay {op: send} → 메시지는 바로 저장(그 사이 latest에 보임), 응답만 늦다", async () => {
    await knob("/delay", { op: "send", ms: SLOW_MS });
    const pending = send("지연 보내기", KEY_A);
    // 저장은 요청 시점이다. 응답 전 조회에 그 메시지가 있다
    await new Promise((r) => setTimeout(r, 100));
    const mid = await get(LATEST);
    expect(mid.body.data.some((m) => m.clientMessageId === KEY_A)).toBe(true);
    const res = await pending;
    expect(res.status).toBe(201);
    expect(res.ms).toBeGreaterThanOrEqual(SLOW_MS - 50);
    expect(res.body.data.message.clientMessageId).toBe(KEY_A);
    // 지연은 1회. 다음 보내기는 기본 지연(300ms)만
    expect((await send("다음 보내기", KEY_B)).ms).toBeLessThan(SLOW_MS - 50);
  });

  it("fail {op: send, 401} + delay {op: send} → 401이 지연 뒤, 만들지 않는다, 응답 기록 1건", async () => {
    await knob("/fail", { op: "send", status: 401 });
    await knob("/delay", { op: "send", ms: SLOW_MS });
    const before = (await get(LATEST)).body.meta.maxSequence;
    const res = await send("늦은 401", KEY_A);
    expect(res.status).toBe(401);
    expect(res.body.code).toBe("UNAUTHORIZED");
    expect(res.ms).toBeGreaterThanOrEqual(SLOW_MS - 50);
    expect((await get(LATEST)).body.meta.maxSequence).toBe(before);
    const log = await failureLog();
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({
      op: "send",
      page: null,
      status: 401,
      delayMs: SLOW_MS,
    });
    // 같은 키로 다시 보내면 계획이 다 쓰여 201(다시 보내기 경로)
    expect((await send("늦은 401", KEY_A)).status).toBe(201);
  });

  it("fail {page: before, 500 | 401} + delay {page: before} → 그 결과가 늦게, 기록에 page before", async () => {
    for (const status of [500, 401]) {
      await knob("/fail", { op: "messages", page: "before", status });
      await knob("/delay", { op: "messages", page: "before", ms: SLOW_MS });
      const res = await get(BEFORE);
      expect(res.status).toBe(status);
      expect(res.ms).toBeGreaterThanOrEqual(SLOW_MS - 50);
    }
    const log = await failureLog();
    expect(log.map((e) => [e.op, e.page, e.status, e.delayMs])).toEqual([
      ["messages", "before", 500, SLOW_MS],
      ["messages", "before", 401, SLOW_MS],
    ]);
  });

  it("지연 없는 실패도 기록하되 delayMs 0. reset이 기록과 send 계획을 비운다", async () => {
    await knob("/fail", { op: "room", status: 500 });
    expect((await get(`${API}/rooms/1`)).status).toBe(500);
    expect(await failureLog()).toMatchObject([
      { op: "room", page: null, status: 500, delayMs: 0 },
    ]);
    await knob("/delay", { op: "send", ms: SLOW_MS });
    await knob("/fail", { op: "send", status: 401 });
    await knob("/reset", {});
    expect(await failureLog()).toEqual([]);
    const res = await send("reset 뒤", KEY_A);
    expect(res.status).toBe(201);
    expect(res.ms).toBeLessThan(SLOW_MS - 50);
  });

  it("incoming {kind: AUTO_REPLY} → 화면 렌더 칸(sender WHOLESALER, kind, body, sentAt, autoReply null)을 갖는다", async () => {
    const res = await call<{ data: ChatMessage[] }>(
      "POST",
      `${KNOB}/rooms/1/incoming`,
      { body: "자동 답이에요", kind: "AUTO_REPLY" },
    );
    expect(res.status).toBe(201);
    const [message] = res.body.data;
    expect(message).toMatchObject({
      roomId: 1,
      sender: "WHOLESALER",
      kind: "AUTO_REPLY",
      body: "자동 답이에요",
      autoReply: null,
      inquiry: null,
      clientMessageId: null,
    });
    expect(typeof message?.sentAt).toBe("string");
    // 조회 응답에도 같은 모양으로 실린다
    const latest = await get(LATEST);
    expect(latest.body.data.at(-1)).toEqual(message);
  });
});

describe('S1-3 reset {seed: "retail-history"}', () => {
  it("방 1 = 1~120 TEXT, 홀수 RETAILER 짝수 WHOLESALER, 장 나눔 71~120 → 21~70 → 1~20, 읽음 100", async () => {
    const set = await knob("/reset", { seed: "retail-history" });
    expect(set.status).toBe(200);

    const first = await get(LATEST);
    const seqs = first.body.data.map((m) => m.sequence);
    expect(seqs[0]).toBe(71);
    expect(seqs.at(-1)).toBe(120);
    expect(seqs).toHaveLength(50);
    expect(first.body.meta.hasMore).toBe(true);
    expect(first.body.meta.maxSequence).toBe(120);
    const bySeq = new Map(first.body.data.map((m) => [m.sequence, m]));
    expect(bySeq.get(71)?.sender).toBe("RETAILER");
    expect(bySeq.get(120)?.sender).toBe("WHOLESALER");

    const second = await get(`${MESSAGES}?beforeSequence=71&size=50`);
    expect(second.body.data.map((m) => m.sequence)).toEqual(
      Array.from({ length: 50 }, (_, i) => 21 + i),
    );
    expect(second.body.meta.hasMore).toBe(true);

    const third = await get(`${MESSAGES}?beforeSequence=21&size=50`);
    expect(third.body.data.map((m) => m.sequence)).toEqual(
      Array.from({ length: 20 }, (_, i) => 1 + i),
    );
    expect(third.body.meta.hasMore).toBe(false);

    const all = [...third.body.data, ...second.body.data, ...first.body.data];
    expect(all.every((m) => m.kind === "TEXT")).toBe(true);
    expect(
      all.every(
        (m) => m.sender === (m.sequence % 2 === 1 ? "RETAILER" : "WHOLESALER"),
      ),
    ).toBe(true);

    const head = await call<{ data: RetailSchema<"ChatRoomDetail"> }>(
      "GET",
      `${API}/rooms/1`,
    );
    expect(head.body.data.myLastReadSequence).toBe(100);
    // 안 읽은 것 = 101~120 중 도매 글(짝수) 10개
    expect(head.body.data.unreadCount).toBe(10);
  });

  it("방 33과 목록의 다른 방은 기본 시드 그대로. 다음 기본 reset은 방 1을 기본으로 되돌린다", async () => {
    const room33 = `${API}/rooms/33/messages`;
    const defaultRoom1 = (await get(LATEST)).body;
    const default33 = (await get(room33)).body;

    await knob("/reset", { seed: "retail-history" });
    expect((await get(room33)).body.data.map((m) => m.body)).toEqual(
      default33.data.map((m) => m.body),
    );

    await knob("/reset", {});
    expect((await get(LATEST)).body).toEqual(defaultRoom1);
    expect((await get(room33)).body).toEqual(default33);
  });

  it("모르는 seed → 400 VALIDATION_FAILED(seed)", async () => {
    const res = await knob("/reset", { seed: "nope" });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_FAILED");
    expect(res.body.errors[0]?.field).toBe("seed");
  });
});
