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
import { resetRetailChatMock, retailChatHandlers } from "./chat";

/**
 * 소매 읽음 손잡이와 방 목록 cursor 계약(loop-08 S1-6 소매, S1-7). 소매 브라우저 worker 와 같은 구성(소매 핸들러만)을
 * `msw/node`로 띄워 실제 HTTP로 부른다 — 도매 핸들러를 같이 올리면 `/__mock/chat/*` 손잡이를 도매 것이 먼저 잡는다.
 *
 * 시계: `Date`만 가짜(10/28 14:00 서울). 시드 방 1, 33 의 마지막 메시지(10/28 아침)보다 뒤라 주입한 메시지가 맨 위로 간다.
 */

const ORIGIN = "http://mock.test";
const API = `${ORIGIN}/api/retail/chat`;
const KNOB = `${ORIGIN}/__mock/chat`;

type Summary = RetailSchema<"ChatRoomSummary">;
type Page = { data: Summary[]; meta: RetailSchema<"CursorPageMeta"> };
type Detail = RetailSchema<"ChatRoomDetail">;
type Meta = RetailSchema<"ChatMessagePageMeta">;
interface ErrorBody {
  code: string;
  errors: { field: string; code: string }[];
}

const server = setupServer(...retailChatHandlers);
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterAll(() => server.close());
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(Date.parse("2026-10-28T14:00:00+09:00"));
  resetRetailChatMock();
});
afterEach(() => {
  vi.useRealTimers();
});

async function call<T>(method: string, url: string, json?: unknown) {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: json === undefined ? undefined : JSON.stringify(json),
  });
  return { status: res.status, body: (await res.json()) as T };
}

const knob = (path: string, json: unknown = {}) =>
  call<{ data: Record<string, unknown> } & ErrorBody>(
    "POST",
    `${KNOB}${path}`,
    json,
  );
const rooms = (cursor?: string | null) =>
  call<Page & ErrorBody>(
    "GET",
    `${API}/rooms${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`,
  );
const ids = (page: Page) => page.data.map((r) => r.roomId);

describe("S1-6 소매 counterpart-read (방 33: 도매 읽음 0, 메시지 7)", () => {
  const room = () => call<{ data: Detail }>("GET", `${API}/rooms/33`);
  const tail = () =>
    call<{ data: unknown[]; meta: Meta }>(
      "GET",
      `${API}/rooms/33/messages?afterSequence=7`,
    );

  it("5 → meta 5(빈 응답에도 meta), 이어 3 → 5 그대로, 999 → 400, 방 머리도 5", async () => {
    expect((await tail()).body.meta.counterpartLastReadSequence).toBe(0);
    expect(
      (await knob("/rooms/33/counterpart-read", { sequence: 5 })).body.data,
    ).toEqual({ roomId: 33, counterpartLastReadSequence: 5 });
    let page = await tail();
    expect(page.body.data).toEqual([]);
    expect(page.body.meta.counterpartLastReadSequence).toBe(5);

    await knob("/rooms/33/counterpart-read", { sequence: 3 });
    page = await tail();
    expect(page.body.meta.counterpartLastReadSequence).toBe(5);

    const bad = await knob("/rooms/33/counterpart-read", { sequence: 999 });
    expect(bad.status).toBe(400);
    expect(bad.body.errors.map((e) => e.field)).toEqual(["sequence"]);
    expect((await room()).body.data.counterpartLastReadSequence).toBe(5);
  });

  it("delay {op: room}: 먼저 떠난 방 머리가 읽음 5 뒤에 옛 값 0으로 도착(값은 요청 시점)", async () => {
    await knob("/delay", { op: "room", ms: 400 });
    const slow = room();
    await new Promise((r) => setTimeout(r, 50));
    await knob("/rooms/33/counterpart-read", { sequence: 5 });
    expect((await tail()).body.meta.counterpartLastReadSequence).toBe(5);
    expect((await slow).body.data.counterpartLastReadSequence).toBe(0);
  });

  it("delay op 에 room, messages, rooms 가 더해졌고 06a 의 count, read 도 그대로", async () => {
    for (const op of ["count", "read", "room", "messages", "rooms"])
      expect((await knob("/delay", { op, ms: 0 })).status).toBe(200);
    expect((await knob("/delay", { op: "stats", ms: 0 })).status).toBe(400);
  });
});

describe("S1-7 소매 방 목록 cursor (reset {rooms: 35})", () => {
  it("30 + 5, 겹침 0, 둘째 장 nextCursor null. 시드 방 1, 33 이 맨 위", async () => {
    expect((await knob("/reset", { rooms: 35 })).body.data.rooms).toBe(35);
    const first = await rooms();
    expect(first.body.data).toHaveLength(30);
    expect(ids(first.body).slice(0, 2)).toEqual([1, 33]);
    expect(first.body.meta.nextCursor).not.toBeNull();
    const second = await rooms(first.body.meta.nextCursor);
    expect(second.body.data).toHaveLength(5);
    expect(second.body.meta.nextCursor).toBeNull();
    const all = [...ids(first.body), ...ids(second.body)];
    expect(new Set(all).size).toBe(35);
  });

  it.each([["zzz"], ["!!!"], [btoa("abc|1")]])(
    "잘못된 cursor %s → 400 INVALID_CURSOR",
    async (cursor) => {
      await knob("/reset", { rooms: 35 });
      const res = await rooms(cursor);
      expect(res.status).toBe(400);
      expect(res.body.errors.map((e) => [e.field, e.code])).toEqual([
        ["cursor", "INVALID_CURSOR"],
      ]);
    },
  );

  it("첫 장 받은 뒤 33번째 방에 새 메시지 → 둘째 장 4개(33번째 없음) → 첫 장부터 다시 → 35, 겹침 0, 그 방이 맨 위", async () => {
    await knob("/reset", { rooms: 35 });
    const first = await rooms();
    const before = await rooms(first.body.meta.nextCursor);
    const target = ids(before.body)[2];
    expect(target).toBeDefined();
    await knob(`/rooms/${target}/incoming`, { body: "신상 들어왔어요" });

    const second = await rooms(first.body.meta.nextCursor);
    expect(second.body.data).toHaveLength(4);
    expect(ids(second.body)).not.toContain(target);
    expect(
      ids(second.body).filter((id) => ids(first.body).includes(id)),
    ).toEqual([]);

    const again = await rooms();
    const rest = await rooms(again.body.meta.nextCursor);
    const all = [...ids(again.body), ...ids(rest.body)];
    expect(all).toHaveLength(35);
    expect(new Set(all).size).toBe(35);
    expect(all[0]).toBe(target);
  });

  it("rooms 는 2~200 정수, 범위 밖은 400. 기본 reset 은 시드 방 2개 한 장", async () => {
    expect((await knob("/reset", { rooms: 1 })).status).toBe(400);
    expect((await knob("/reset", { rooms: 2.5 })).status).toBe(400);
    await knob("/reset");
    const page = await rooms();
    expect(ids(page.body)).toEqual([1, 33]);
    expect(page.body.meta.nextCursor).toBeNull();
  });
});
