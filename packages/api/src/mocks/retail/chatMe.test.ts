import { setupServer } from "msw/node";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { RetailSchema } from "../../retail";
import {
  chatMeRetailerId,
  resetRetailChatMock,
  retailChatHandlers,
} from "./chat";

/**
 * 소매 목의 "나" 바꾸기와 지연된 실패(loop-08c S1-3 소매, S1-4, S1-5 소매, #338). 소매 브라우저 worker와 같은
 * 구성(소매 핸들러만)으로 띄운다 — 도매 핸들러를 같이 올리면 `/__mock/chat/fail`, `delay`를 도매 것이 먼저 잡는다.
 *
 * 무엇을 지키나: 공용 단말에서 다음 소매처가 로그인한 장면(#342 S7)을 이 손잡이로 만든다. "나"가 한 곳이라도
 * 안 바뀌면 e2e가 앞 계정 방을 보고도 통과한다. 지연은 기획의 3초 대신 600ms로 잰다.
 */

const ORIGIN = "http://mock.test";
const API = `${ORIGIN}/api/retail/chat`;
const KNOB = `${ORIGIN}/__mock/chat`;
const SLOW_MS = 600;
const FAST_MS = 300;

type Page = {
  data: RetailSchema<"ChatRoomSummary">[];
  meta: RetailSchema<"CursorPageMeta">;
};
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
const roomIds = async () =>
  (await call<Page>("GET", `${API}/rooms`)).body.data.map((r) => r.roomId);

describe("S1-4 me {retailerId}", () => {
  it("2 → 목록에 소매처 2 방(2)만, 소매처 1 방(1, 33)은 방, 메시지, 보내기, 읽음 404", async () => {
    const set = await knob("/me", { retailerId: 2 });
    expect(set.status).toBe(200);
    expect(set.body.data).toEqual({ retailerId: 2, rooms: 1 });
    expect(chatMeRetailerId()).toBe(2);
    expect(await roomIds()).toEqual([2]);

    for (const roomId of [1, 33]) {
      expect((await call("GET", `${API}/rooms/${roomId}`)).status).toBe(404);
      expect(
        (await call("GET", `${API}/rooms/${roomId}/messages`)).status,
      ).toBe(404);
      expect(
        (
          await call(
            "POST",
            `${API}/rooms/${roomId}/messages`,
            { body: "안녕하세요", inquiry: null },
            { "Idempotency-Key": crypto.randomUUID() },
          )
        ).status,
      ).toBe(404);
      expect(
        (
          await call("POST", `${API}/rooms/${roomId}/read`, {
            lastReadSequence: 1,
          })
        ).status,
      ).toBe(404);
    }
    // 내 방이 된 방 2는 열리고 보낼 수 있다
    expect((await call("GET", `${API}/rooms/2`)).status).toBe(200);
    expect(
      (
        await call(
          "POST",
          `${API}/rooms/2/messages`,
          { body: "안녕하세요", inquiry: null },
          { "Idempotency-Key": crypto.randomUUID() },
        )
      ).status,
    ).toBe(201);
  });

  it("방이 없는 소매처 → 빈 목록", async () => {
    await knob("/me", { retailerId: 9999 });
    expect(await roomIds()).toEqual([]);
  });

  it("reset → 1로 돌아와 방 1, 33이 다시 보인다", async () => {
    await knob("/me", { retailerId: 2 });
    await knob("/reset");
    expect(chatMeRetailerId()).toBe(1);
    expect(await roomIds()).toEqual([1, 33]);
  });

  it('retailerId "x", 1.5, 0, 빠짐 → 400 VALIDATION_FAILED(retailerId), "나"는 그대로', async () => {
    for (const json of [
      { retailerId: "x" },
      { retailerId: 1.5 },
      { retailerId: 0 },
      {},
    ]) {
      const res = await knob("/me", json);
      expect(res.status, JSON.stringify(json)).toBe(400);
      expect(res.body.code).toBe("VALIDATION_FAILED");
      expect(res.body.errors[0]?.field).toBe("retailerId");
    }
    expect(chatMeRetailerId()).toBe(1);
  });
});

describe("S1-3 지연된 실패(소매)", () => {
  it("fail 401 + delay → 401이 지연 뒤 도착, 다음은 바로 200", async () => {
    await knob("/fail", { op: "messages", status: 401 });
    await knob("/delay", { op: "messages", ms: SLOW_MS });
    const res = await call("GET", `${API}/rooms/1/messages`);
    expect(res.status).toBe(401);
    expect(res.ms).toBeGreaterThanOrEqual(SLOW_MS - 50);
    const next = await call("GET", `${API}/rooms/1/messages`);
    expect(next.status).toBe(200);
    expect(next.ms).toBeLessThan(FAST_MS);
  });

  it("delay 없으면 401이 예전처럼 바로", async () => {
    await knob("/fail", { op: "messages", status: 401 });
    const res = await call("GET", `${API}/rooms/1/messages`);
    expect(res.status).toBe(401);
    expect(res.ms).toBeLessThan(FAST_MS);
  });
});

describe("S1-5 소매 기본 응답 변경 0", () => {
  it("me를 바꿨다 reset 한 뒤 목록, 방, 메시지 응답이 처음 reset 직후와 같다", async () => {
    const snapshot = async () => ({
      rooms: (await call("GET", `${API}/rooms`)).body,
      room: (await call("GET", `${API}/rooms/1`)).body,
      messages: (await call("GET", `${API}/rooms/1/messages`)).body,
      room33: (await call("GET", `${API}/rooms/33/messages`)).body,
    });
    const first = await snapshot();
    await knob("/me", { retailerId: 2 });
    await knob("/reset");
    expect(await snapshot()).toEqual(first);
  });
});
