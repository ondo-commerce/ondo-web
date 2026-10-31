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
import type { WholesaleSchema } from "../../wholesale";
import { chatHandlers, resetChatMock } from "./chat";

/**
 * 문의 지표 op 와 도매 읽음 손잡이 계약(loop-08 S1-4, S1-5, S1-6 도매). 목을 `msw/node`로 띄워 실제 HTTP로 부른다 —
 * 기획의 e2e(계약) 셋을 브라우저 없이 같은 HTTP 로 재생한다. 기대값은 AC 에 적힌 손 계산 숫자다(op 응답끼리 비교 금지).
 *
 * 시계: `Date`만 가짜(영업일 경계와 asOf). msw `delay`(setTimeout)는 진짜다.
 */

const ORIGIN = "http://mock.test";
const BASE = `${ORIGIN}/api/wholesale/chat`;
const KNOB = `${ORIGIN}/__mock/chat`;

type Stats = WholesaleSchema<"InquiryStats">;
type Detail = WholesaleSchema<"ChatRoomDetail">;
type Meta = WholesaleSchema<"ChatMessagePageMeta">;
interface ErrorBody {
  code: string;
  errors: { field: string; code: string }[];
}

const server = setupServer(...chatHandlers);
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterAll(() => server.close());
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(Date.parse("2026-10-29T11:59:30+09:00"));
  resetChatMock();
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

const stats = (query = "") =>
  call<{ data: Stats } & ErrorBody>("GET", `${BASE}/inquiry-stats${query}`);
const knob = (path: string, json: unknown = {}) =>
  call<{ data: Record<string, unknown> } & ErrorBody>(
    "POST",
    `${KNOB}${path}`,
    json,
  );

describe("S1-4 inquiryStats 쿼리 검사 (시계 10/29 11:59:30 → 오늘 영업일 10/28)", () => {
  it.each([
    ["from > to", "?from=2026-10-28&to=2026-10-27", "from"],
    ["63일", "?from=2026-08-27&to=2026-10-28", "to"],
    ["달력에 없는 날 2026-13-01", "?from=2026-13-01&to=2026-10-28", "from"],
    ["형식이 아님", "?from=2026-10-28&to=20261028", "to"],
    ["to 가 오늘 영업일 다음날", "?from=2026-10-28&to=2026-10-29", "to"],
  ])("%s → 400 VALIDATION_FAILED", async (_, query, field) => {
    const res = await stats(query);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_FAILED");
    expect(res.body.errors.map((e) => e.field)).toEqual([field]);
  });

  it("62일(08/28 ~ 10/28)과 to = 오늘 영업일은 200", async () => {
    const res = await stats("?from=2026-08-28&to=2026-10-28");
    expect(res.status).toBe(200);
    expect(res.body.data.days).toHaveLength(62);
  });

  it("인자 없음 → 오늘 영업일 1일치, startAt endAt 이 12:00+09:00, asOf 는 요청 시각", async () => {
    const res = await stats();
    expect(res.status).toBe(200);
    expect(res.body.data.from).toBe("2026-10-28");
    expect(res.body.data.to).toBe("2026-10-28");
    expect(res.body.data.days.map((d) => d.date)).toEqual(["2026-10-28"]);
    expect(res.body.data.startAt).toBe("2026-10-28T12:00:00+09:00");
    expect(res.body.data.endAt).toBe("2026-10-29T12:00:00+09:00");
    expect(res.body.data.asOf).toBe("2026-10-29T11:59:30+09:00");
  });

  it("경계 ±1분: 11:59 엔 오늘이 10/28, 12:00 엔 10/29 (to=10/29 가 400 → 200)", async () => {
    vi.setSystemTime(Date.parse("2026-10-29T11:59:00+09:00"));
    expect((await stats()).body.data.from).toBe("2026-10-28");
    expect((await stats("?to=2026-10-29&from=2026-10-29")).status).toBe(400);
    vi.setSystemTime(Date.parse("2026-10-29T12:00:00+09:00"));
    expect((await stats()).body.data.from).toBe("2026-10-29");
    expect((await stats("?to=2026-10-29&from=2026-10-29")).status).toBe(200);
  });

  it("fail {op: stats} 500, 404 → 그 상태 1회, 다음은 200", async () => {
    for (const status of [500, 404]) {
      await knob("/fail", { op: "stats", status });
      expect((await stats()).status).toBe(status);
      expect((await stats()).status).toBe(200);
    }
  });
});

describe("S1-5 reset {seed: stats-v1} (시계 10/29 11:59:30)", () => {
  it("from 10/27 to 10/28 → 13, 자동 답 6, 답+확인 1, 넘김 2, 되묻기 3, 결과 없음 1. days [1, 12]", async () => {
    expect((await knob("/reset", { seed: "stats-v1" })).status).toBe(200);
    const res = await stats("?from=2026-10-27&to=2026-10-28");
    expect(res.status).toBe(200);
    const t = res.body.data.total;
    expect([
      t.retailMessages,
      t.autoReplied,
      t.autoRepliedWithHandoff,
      t.handedOff,
      t.clarified,
      t.noResult,
    ]).toEqual([13, 6, 1, 2, 3, 1]);
    expect(t.byIntent.STOCK).toEqual({ judged: 5, autoReplied: 4 });
    expect(res.body.data.days.map((d) => d.counts.retailMessages)).toEqual([
      1, 12,
    ]);
  });

  it("오늘(인자 없음) = 10/28: 12건, 자동 답 5, 판정 8 (대시보드 카드 S2-1 숫자)", async () => {
    await knob("/reset", { seed: "stats-v1" });
    const t = (await stats()).body.data.total;
    expect(t.retailMessages).toBe(12);
    expect(t.autoReplied).toBe(5);
    expect(t.autoReplied + t.autoRepliedWithHandoff + t.handedOff).toBe(8);
  });

  it("기본 시드로 돌아오면 10/28 영업일 소매 메시지 0(시드가 섞이지 않는다), 모르는 seed 는 400", async () => {
    await knob("/reset", { seed: "stats-v1" });
    await knob("/reset");
    expect((await stats()).body.data.total.retailMessages).toBe(0);
    expect((await knob("/reset", { seed: "stats-v2" })).status).toBe(400);
  });
});

describe("S1-6 도매 counterpart-read (방 5: 소매 읽음 2, 메시지 4 → 주입 1개로 5)", () => {
  const room = () => call<{ data: Detail }>("GET", `${BASE}/rooms/5`);
  const tail = () =>
    call<{ data: unknown[]; meta: Meta }>(
      "GET",
      `${BASE}/rooms/5/messages?afterSequence=5`,
    );

  it("5 → meta 5(빈 응답에도 meta), 이어 3 → 5 그대로, 999 → 400, 방 머리도 5", async () => {
    await knob("/rooms/5/incoming", { body: "하나 더요" });
    expect(
      (await knob("/rooms/5/counterpart-read", { sequence: 5 })).body.data,
    ).toEqual({ roomId: 5, counterpartLastReadSequence: 5 });
    let page = await tail();
    expect(page.body.data).toEqual([]);
    expect(page.body.meta.counterpartLastReadSequence).toBe(5);

    expect(
      (await knob("/rooms/5/counterpart-read", { sequence: 3 })).body.data
        .counterpartLastReadSequence,
    ).toBe(5);
    page = await tail();
    expect(page.body.meta.counterpartLastReadSequence).toBe(5);

    const bad = await knob("/rooms/5/counterpart-read", { sequence: 999 });
    expect(bad.status).toBe(400);
    expect(bad.body.errors.map((e) => e.field)).toEqual(["sequence"]);
    expect((await room()).body.data.counterpartLastReadSequence).toBe(5);
  });

  it("delay {op: room}: 값은 요청 시점에 정해진다 — 먼저 떠난 방 머리가 읽음 5 뒤에 옛 값 2로 도착", async () => {
    await knob("/rooms/5/incoming", { body: "하나 더요" });
    expect((await knob("/delay", { op: "room", ms: 400 })).status).toBe(200);
    const slow = room();
    await new Promise((r) => setTimeout(r, 50));
    await knob("/rooms/5/counterpart-read", { sequence: 5 });
    expect((await tail()).body.meta.counterpartLastReadSequence).toBe(5);
    expect((await slow).body.data.counterpartLastReadSequence).toBe(2);
    expect((await room()).body.data.counterpartLastReadSequence).toBe(5);
  });

  // loop-08b 가 rooms, send 를 더했다(`chatRoomsFilter.test.ts` S1-6). 모르는 op 거절은 그대로
  it("delay op 는 정한 것만, ms 는 0 이상", async () => {
    expect((await knob("/delay", { op: "messages", ms: 0 })).status).toBe(200);
    expect((await knob("/delay", { op: "stats", ms: 10 })).status).toBe(400);
    expect((await knob("/delay", { op: "room", ms: -1 })).status).toBe(400);
  });
});
