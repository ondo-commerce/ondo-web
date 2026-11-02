import { setupServer } from "msw/node";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { chatHandlers, resetChatMock, type PlannedFailureLog } from "./chat";

/**
 * 도매 messages 손잡이를 요청 종류별로(loop-08c S1-1 ~ S1-3, #338). 목을 `msw/node`로 띄워 실제 HTTP로 부른다.
 *
 * 무엇을 지키나: 이전 메시지(before)와 polling(after)의 응답 순서, 로그아웃을 넘는 늦은 401을 e2e(#339, #342)가
 * 이 손잡이로 만든다. 손잡이가 종류를 못 가르면 e2e가 엉뚱한 요청을 늦추고도 통과한다.
 *
 * 지연은 기획의 3초 대신 600ms로 잰다 — 뜻(그 요청만 늦다)은 같고 테스트가 9초 늘지 않는다.
 * 방 3은 메시지 120개(최신 장 71~120, 이전 장 21~70)
 */

const ORIGIN = "http://mock.test";
const MESSAGES = `${ORIGIN}/api/wholesale/chat/rooms/3/messages`;
const KNOB = `${ORIGIN}/__mock/chat`;
const SLOW_MS = 600;
/** 지연 없는 요청이 이보다 빨리 와야 한다. 지연 판정은 SLOW_MS − 50 이상 */
const FAST_MS = 300;

const LATEST = MESSAGES;
const BEFORE = `${MESSAGES}?beforeSequence=71&size=50`;
const AFTER = `${MESSAGES}?afterSequence=120`;

const server = setupServer(...chatHandlers);
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterAll(() => server.close());
beforeEach(() => resetChatMock());

interface ErrorBody {
  code: string;
  errors: { field: string }[];
}

async function knob(path: string, json: unknown) {
  const res = await fetch(`${KNOB}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(json),
  });
  return {
    status: res.status,
    body: (await res.json()) as { data: Record<string, unknown> } & ErrorBody,
  };
}

/** 상태 코드와 걸린 시간(ms) */
async function timed(url: string) {
  const start = performance.now();
  const res = await fetch(url);
  await res.json();
  return { status: res.status, ms: performance.now() - start };
}

describe("S1-1 fail {op: messages, page}", () => {
  it("page before 500 → before 500, 그 뒤 after와 latest 200, before도 다음엔 200", async () => {
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
    // 종류가 다른 요청은 계획을 쓰지 않는다
    expect((await timed(AFTER)).status).toBe(200);
    expect((await timed(LATEST)).status).toBe(200);
    expect((await timed(BEFORE)).status).toBe(500);
    expect((await timed(BEFORE)).status).toBe(200);
  });

  it("page 없이 걸면 다음 messages 1회가 종류 상관없이 500(after가 먼저 와도)", async () => {
    await knob("/fail", { op: "messages", status: 500 });
    expect((await timed(AFTER)).status).toBe(500);
    expect((await timed(BEFORE)).status).toBe(200);
    expect((await timed(LATEST)).status).toBe(200);
  });

  it("page가 맞는 계획을 먼저 쓴다: page 없는 401 + page before 500 → before 500, latest 401", async () => {
    await knob("/fail", { op: "messages", status: 401 });
    await knob("/fail", { op: "messages", page: "before", status: 500 });
    expect((await timed(BEFORE)).status).toBe(500);
    expect((await timed(LATEST)).status).toBe(401);
    expect((await timed(LATEST)).status).toBe(200);
  });

  it("빈 쿼리 값(beforeSequence=)은 없는 것으로 본다 → latest", async () => {
    await knob("/fail", { op: "messages", page: "latest", status: 500 });
    expect((await timed(`${MESSAGES}?beforeSequence=`)).status).toBe(500);
  });
});

describe("S1-2 delay {op: messages, page}", () => {
  it("page after → after 1회만 늦고 before, latest는 바로", async () => {
    const set = await knob("/delay", {
      op: "messages",
      page: "after",
      ms: SLOW_MS,
    });
    expect(set.body.data).toEqual({
      op: "messages",
      page: "after",
      ms: SLOW_MS,
      times: 1,
    });
    const before = await timed(BEFORE);
    expect(before.ms).toBeLessThan(FAST_MS);
    expect((await timed(LATEST)).ms).toBeLessThan(FAST_MS);
    const after = await timed(AFTER);
    expect(after.status).toBe(200);
    expect(after.ms).toBeGreaterThanOrEqual(SLOW_MS - 50);
    expect((await timed(AFTER)).ms).toBeLessThan(FAST_MS);
  });

  it('page "x" → 400 VALIDATION_FAILED(page). fail에도, messages 밖 op에 page를 붙여도 400', async () => {
    for (const [path, json] of [
      ["/delay", { op: "messages", page: "x", ms: 10 }],
      ["/fail", { op: "messages", page: "x" }],
      ["/delay", { op: "room", page: "before", ms: 10 }],
      ["/fail", { op: "send", page: "latest" }],
    ] as const) {
      const res = await knob(path, json);
      expect(res.status, `${path} ${JSON.stringify(json)}`).toBe(400);
      expect(res.body.code).toBe("VALIDATION_FAILED");
      expect(res.body.errors[0]?.field).toBe("page");
    }
    // 400 뒤엔 아무 계획도 없다
    expect((await timed(BEFORE)).status).toBe(200);
  });

  it("page 없는 delay는 예전처럼 종류 상관없이 다음 1회(응답 data 모양도 예전 그대로)", async () => {
    const set = await knob("/delay", { op: "messages", ms: SLOW_MS });
    expect(set.body.data).toEqual({ op: "messages", ms: SLOW_MS, times: 1 });
    expect((await timed(BEFORE)).ms).toBeGreaterThanOrEqual(SLOW_MS - 50);
    expect((await timed(BEFORE)).ms).toBeLessThan(FAST_MS);
  });
});

describe("S1-3 지연된 실패(도매)", () => {
  it("fail 401 + delay → 401이 지연 뒤 도착하고 지연 계획도 1회 쓴다", async () => {
    await knob("/fail", { op: "messages", status: 401 });
    await knob("/delay", { op: "messages", ms: SLOW_MS });
    const res = await timed(AFTER);
    expect(res.status).toBe(401);
    expect(res.ms).toBeGreaterThanOrEqual(SLOW_MS - 50);
    // 실패가 지연을 썼으니 다음은 바로 200
    const next = await timed(AFTER);
    expect(next.status).toBe(200);
    expect(next.ms).toBeLessThan(FAST_MS);
  });

  it("delay 없으면 401이 예전처럼 바로", async () => {
    await knob("/fail", { op: "messages", status: 401 });
    const res = await timed(AFTER);
    expect(res.status).toBe(401);
    expect(res.ms).toBeLessThan(FAST_MS);
  });

  it("종류가 다른 지연은 실패를 늦추지 않는다: fail before 500 + delay after → before 500 바로", async () => {
    await knob("/fail", { op: "messages", page: "before", status: 500 });
    await knob("/delay", { op: "messages", page: "after", ms: SLOW_MS });
    const before = await timed(BEFORE);
    expect(before.status).toBe(500);
    expect(before.ms).toBeLessThan(FAST_MS);
    expect((await timed(AFTER)).ms).toBeGreaterThanOrEqual(SLOW_MS - 50);
  });

  it("reset이 page 계획까지 지운다", async () => {
    await knob("/fail", { op: "messages", page: "after", status: 500 });
    await knob("/delay", { op: "messages", page: "before", ms: SLOW_MS });
    resetChatMock();
    expect((await timed(AFTER)).status).toBe(200);
    expect((await timed(BEFORE)).ms).toBeLessThan(FAST_MS);
  });
});

/* --- loop-08d S1-2 S1-3 (#350): 보내기 지연된 실패, 응답 기록, retail-history 시드 ------------- */

const SEND = `${ORIGIN}/api/wholesale/chat/rooms/1/messages`;
const SEND_KEY = "33333333-3333-4333-8333-333333333333";

/** 상태 코드, 걸린 시간, 본문 */
async function sendTimed(body: string, key: string) {
  const start = performance.now();
  const res = await fetch(SEND, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Idempotency-Key": key },
    body: JSON.stringify({ body }),
  });
  const json = (await res.json()) as { code?: string };
  return { status: res.status, code: json.code, ms: performance.now() - start };
}

async function failureLog() {
  const res = await fetch(`${KNOB}/log`);
  return ((await res.json()) as { data: PlannedFailureLog[] }).data;
}

describe("loop-08d S1-2 도매 보내기 지연된 실패와 응답 기록", () => {
  it("fail {op: send, 401} + delay {op: send} → 401이 지연 뒤, 기록 1건(delayMs). 다시 보내면 201", async () => {
    await knob("/fail", { op: "send", status: 401 });
    await knob("/delay", { op: "send", ms: SLOW_MS });
    const res = await sendTimed("늦은 401", SEND_KEY);
    expect(res.status).toBe(401);
    expect(res.code).toBe("UNAUTHENTICATED");
    expect(res.ms).toBeGreaterThanOrEqual(SLOW_MS - 50);
    expect(await failureLog()).toMatchObject([
      { op: "send", page: null, status: 401, delayMs: SLOW_MS },
    ]);
    expect((await sendTimed("늦은 401", SEND_KEY)).status).toBe(201);
  });

  it("messages 지연된 401도 기록에 page와 같이 남는다. reset이 기록을 비운다", async () => {
    await knob("/fail", { op: "messages", page: "latest", status: 401 });
    await knob("/delay", { op: "messages", page: "latest", ms: SLOW_MS });
    expect((await timed(LATEST)).status).toBe(401);
    expect(await failureLog()).toMatchObject([
      { op: "messages", page: "latest", status: 401, delayMs: SLOW_MS },
    ]);
    await knob("/reset", {});
    expect(await failureLog()).toEqual([]);
  });
});

describe('loop-08d S1-3 도매 reset {seed: "retail-history"}', () => {
  it("저장소가 하나라 도매 reset도 받는다: 도매 방 1 = 1~120, 첫 장 71~120 hasMore, 도매 읽음 끝까지", async () => {
    const res = await knob("/reset", { seed: "retail-history" });
    expect(res.status).toBe(200);
    const page = await fetch(`${ORIGIN}/api/wholesale/chat/rooms/1/messages`);
    const body = (await page.json()) as {
      data: { sequence: number; sender: string; kind: string }[];
      meta: { hasMore: boolean };
    };
    expect(body.data.map((m) => m.sequence)).toEqual(
      Array.from({ length: 50 }, (_, i) => 71 + i),
    );
    expect(body.meta.hasMore).toBe(true);
    expect(body.data.every((m) => m.kind === "TEXT")).toBe(true);
    const head = await fetch(`${ORIGIN}/api/wholesale/chat/rooms/1`);
    const detail = (await head.json()) as {
      data: { myLastReadSequence: number; unreadCount: number };
    };
    expect(detail.data.myLastReadSequence).toBe(120);
    expect(detail.data.unreadCount).toBe(0);
  });

  it("모르는 seed → 400(seed), 메시지에 세 이름", async () => {
    const res = await knob("/reset", { seed: "nope" });
    expect(res.status).toBe(400);
    expect(res.body.errors[0]?.field).toBe("seed");
  });
});
