import { setupServer } from "msw/node";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { WholesaleSchema } from "../../wholesale";
import { chatHandlers, chatStore, resetChatMock } from "./chat";

/**
 * 방 목록 필터와 검색 계약(loop-08b S1-2 ~ S1-6). 목을 `msw/node`로 띄워 실제 HTTP로 부른다.
 *
 * 기대값은 AC 에 적힌 손 계산 숫자다(시드 규칙 §5-3 2에서 센 것). 응답끼리 비교하지 않는다 — 목이 틀리면
 * 같이 틀린 두 응답이 서로 맞아 거짓 통과한다(§0 4).
 * 시드 `rooms-70`: 소매처 i = roomId 100 + i, i 홀수 안 읽음, i 4의 배수 답 필요, 남의 방 171("소매처 6", 도매처 102).
 */

const ORIGIN = "http://mock.test";
const BASE = `${ORIGIN}/api/wholesale/chat`;
const KNOB = `${ORIGIN}/__mock/chat`;

type Summary = WholesaleSchema<"ChatRoomSummary">;
type Message = WholesaleSchema<"ChatMessage">;
type Page = { data: Summary[]; meta: WholesaleSchema<"CursorPageMeta"> };
interface ErrorBody {
  code: string;
  errors: { field: string; code: string }[];
}

const server = setupServer(...chatHandlers);
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterAll(() => server.close());
beforeEach(() => resetChatMock());

async function post(path: string, json: unknown = {}) {
  const res = await fetch(`${KNOB}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(json),
  });
  return { status: res.status, body: (await res.json()) as unknown };
}

/** 쿼리 객체 → `?a=b`. 값은 URLSearchParams 가 인코딩한다(공백, 한글) */
function qs(query: Record<string, string>): string {
  const s = new URLSearchParams(query).toString();
  return s === "" ? "" : `?${s}`;
}

async function rooms(query: Record<string, string> = {}) {
  const res = await fetch(`${BASE}/rooms${qs(query)}`);
  return { status: res.status, body: (await res.json()) as Page & ErrorBody };
}

/** cursor 를 따라 끝까지. 장마다 소매처 번호("소매처 N"의 N) 배열 */
async function walk(query: Record<string, string> = {}) {
  const pages: number[][] = [];
  const roomIds: number[] = [];
  let cursor: string | null = null;
  do {
    const page: Awaited<ReturnType<typeof rooms>> = await rooms(
      cursor === null ? query : { ...query, cursor },
    );
    expect(page.status).toBe(200);
    pages.push(page.body.data.map((r) => nameNo(r)));
    roomIds.push(...page.body.data.map((r) => r.roomId));
    cursor = page.body.meta.nextCursor;
  } while (cursor !== null && pages.length < 10);
  return { pages, roomIds, all: pages.flat() };
}

function nameNo(r: Summary): number {
  const match = /^소매처 (\d+)$/.exec(r.counterpart.name);
  return match === null ? Number.NaN : Number(match[1]);
}

/** a 이상 b 이하에서 step 간격 */
function range(a: number, b: number, step = 1): number[] {
  const out: number[] = [];
  for (let i = a; i <= b; i += step) out.push(i);
  return out;
}

const seed70 = () => post("/reset", { seed: "rooms-70" });

describe("S1-2 rooms-70: 조건별 장 수와 겹침", () => {
  beforeEach(async () => {
    expect((await seed70()).body).toEqual({ data: { rooms: 70 } });
  });

  it("조건 없음 30 + 30 + 10, 소매처 1 → 70 순, 남의 방(171) 0", async () => {
    const { pages, roomIds, all } = await walk();
    expect(pages.map((p) => p.length)).toEqual([30, 30, 10]);
    expect(all).toEqual(range(1, 70));
    expect(new Set(roomIds).size).toBe(70);
    expect(roomIds).not.toContain(171);
  });

  it("UNREAD 30 + 5: 둘째 장 첫 행 소매처 61, 끝 69. 전부 홀수, 남의 방 0", async () => {
    const { pages, roomIds, all } = await walk({ filter: "UNREAD" });
    expect(pages.map((p) => p.length)).toEqual([30, 5]);
    expect(pages[1]).toEqual([61, 63, 65, 67, 69]);
    expect(all).toEqual(range(1, 69, 2));
    expect(new Set(all).size).toBe(35);
    expect(roomIds).not.toContain(171);
  });

  it("NEEDS_REPLY 17 한 장(4 ~ 68, 4 간격), 남의 방 0", async () => {
    const { pages, roomIds } = await walk({ filter: "NEEDS_REPLY" });
    expect(pages).toEqual([
      [4, 8, 12, 16, 20, 24, 28, 32, 36, 40, 44, 48, 52, 56, 60, 64, 68],
    ]);
    expect(roomIds).not.toContain(171);
  });

  it("q=소매처 6 → 11개(6, 60 ~ 69). 이름이 같은 남의 방 0", async () => {
    const { pages, roomIds } = await walk({ q: "소매처 6" });
    expect(pages).toEqual([[6, 60, 61, 62, 63, 64, 65, 66, 67, 68, 69]]);
    expect(roomIds).not.toContain(171);
  });

  it("q=소매처 6 + UNREAD → 5개(61 63 65 67 69)", async () => {
    const { pages, roomIds } = await walk({ q: "소매처 6", filter: "UNREAD" });
    expect(pages).toEqual([[61, 63, 65, 67, 69]]);
    expect(roomIds).not.toContain(171);
  });

  it("작은 장(size=7)으로 걸어도 UNREAD 35, 겹침 0 — cursor 가 거른 결과 위의 위치다", async () => {
    const { pages, all } = await walk({ filter: "UNREAD", size: "7" });
    expect(pages.map((p) => p.length)).toEqual([7, 7, 7, 7, 7]);
    expect(all).toEqual(range(1, 69, 2));
  });
});

describe("S1-3 q 공백, 대소문자, 400", () => {
  beforeEach(async () => {
    await seed70();
  });

  it('"  소매처 70 " → 1개, "소매처  70"(안쪽 공백 2) → 0개, 공백만 → 조건 없음과 같은 70', async () => {
    expect((await walk({ q: "  소매처 70 " })).pages).toEqual([[70]]);
    expect((await walk({ q: "소매처  70" })).pages).toEqual([[]]);
    const blank = await walk({ q: "   " });
    expect(blank.all).toEqual(range(1, 70));
  });

  it("51자 → 400 VALIDATION_FAILED(q), 50자 → 200. 앞뒤 공백은 세지 않는다", async () => {
    const long = await rooms({ q: "가".repeat(51) });
    expect(long.status).toBe(400);
    expect(long.body.code).toBe("VALIDATION_FAILED");
    expect(long.body.errors[0]?.field).toBe("q");
    expect((await rooms({ q: "가".repeat(50) })).status).toBe(200);
    expect((await rooms({ q: ` ${"가".repeat(50)}  ` })).status).toBe(200);
  });

  it("filter=READ → 400 VALIDATION_FAILED(filter). 빈 filter= 는 없는 것과 같다", async () => {
    const bad = await rooms({ filter: "READ" });
    expect(bad.status).toBe(400);
    expect(bad.body.code).toBe("VALIDATION_FAILED");
    expect(bad.body.errors[0]?.field).toBe("filter");
    expect((await rooms({ filter: "unread" })).status).toBe(400);
    expect((await walk({ filter: "" })).all).toEqual(range(1, 70));
  });

  it("영문 대소문자는 무시하고 안쪽 공백은 그대로 본다(소매처 1을 Bom Bom Shop 으로 바꿔서)", async () => {
    const r = chatStore.rooms().find((x) => x.roomId === 101);
    if (r === undefined) throw new Error("방 101 없음");
    r.retailerName = "Bom Bom Shop";
    const ids = async (q: string) =>
      (await rooms({ q })).body.data.map((x) => x.roomId);
    expect(await ids("bom bom")).toEqual([101]);
    expect(await ids("BOM BOM SHOP")).toEqual([101]);
    expect(await ids("  bOm ")).toEqual([101]);
    expect(await ids("bombom")).toEqual([]);
    expect(await ids("Bom  Bom")).toEqual([]);
  });
});

describe("S1-4 cursor 는 위치만 담는다", () => {
  it("UNREAD 첫 장 뒤 소매처 65 incoming → 그 cursor 로 둘째 장 4개(65 없음) → 첫 장부터 35, 65 맨 위, 겹침 0", async () => {
    await seed70();
    const first = await rooms({ filter: "UNREAD" });
    expect(first.body.data.map(nameNo)).toEqual(range(1, 59, 2));
    const cursor = first.body.meta.nextCursor;
    if (cursor === null) throw new Error("둘째 장 cursor 없음");

    expect(
      (await post("/rooms/165/incoming", { body: "블랙 M 있어요?" })).status,
    ).toBe(201);

    const second = await rooms({ filter: "UNREAD", cursor });
    expect(second.body.data.map(nameNo)).toEqual([61, 63, 67, 69]);
    expect(second.body.meta.nextCursor).toBeNull();

    const again = await walk({ filter: "UNREAD" });
    expect(again.all[0]).toBe(65);
    expect(again.all).toHaveLength(35);
    expect(new Set(again.all).size).toBe(35);
    expect(again.all.slice(1)).toEqual(range(1, 69, 2).filter((i) => i !== 65));
  });
});

describe("S1-5 기본 시드는 그대로", () => {
  it("조건 없이 30 + 2(방 1 ~ 32), 응답이 변경 전 스냅샷과 같다", async () => {
    const first = await rooms();
    const second = await rooms({ cursor: first.body.meta.nextCursor ?? "" });
    expect(first.body.data).toHaveLength(30);
    expect(second.body.data).toHaveLength(2);
    expect(
      [...first.body.data, ...second.body.data]
        .map((r) => r.roomId)
        .sort((a, b) => a - b),
    ).toEqual(range(1, 32));
    // 스냅샷은 filter, q 를 넣기 **전** 목으로 만들었다(02-dev.md §계약). 바뀌면 기존 화면이 다른 목록을 본다
    await expect(
      `${JSON.stringify([first.body, second.body], null, 2)}\n`,
    ).toMatchFileSnapshot("./__snapshots__/chat-rooms-default.json");
  });
});

describe("S1-6 delay rooms, send", () => {
  it("delay {op: rooms, ms: 3000, times: 1} → 다음 rooms 1회만 3초 늦고 그 응답은 요청 시점 값", async () => {
    await seed70();
    expect(
      (await post("/delay", { op: "rooms", ms: 3000, times: 1 })).status,
    ).toBe(200);
    const started = Date.now();
    const slow = rooms({ filter: "UNREAD" }).then((r) => ({
      ...r,
      ms: Date.now() - started,
    }));
    await new Promise((r) => setTimeout(r, 100));
    // 소매처 2(답 다 함, 안 읽음 0)에 새 글 → 지금 조회면 UNREAD 맨 위에 2가 있다
    await post("/rooms/102/incoming", { body: "지금 들어왔어요" });

    const t = Date.now();
    const fresh = await rooms({ filter: "UNREAD" });
    expect(Date.now() - t).toBeLessThan(1000);
    expect(fresh.body.data[0]?.roomId).toBe(102);

    const late = await slow;
    expect(late.ms).toBeGreaterThanOrEqual(3000);
    expect(late.body.data.map((r) => r.roomId)).not.toContain(102);
    expect(late.body.data.map(nameNo)).toEqual(range(1, 59, 2));
  }, 10_000);

  it("delay {op: send} → 응답은 늦지만 그사이 messages 조회에 그 메시지가 있다", async () => {
    const head = await fetch(`${BASE}/rooms/1/messages`);
    const max = ((await head.json()) as { meta: { maxSequence: number } }).meta
      .maxSequence;
    expect((await post("/delay", { op: "send", ms: 1000 })).status).toBe(200);

    const key = "22222222-2222-4222-8222-222222222222";
    const started = Date.now();
    let settled = false;
    const sending = fetch(`${BASE}/rooms/1/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": key },
      body: JSON.stringify({ body: "늦은 답이에요", inquiry: null }),
    }).then(async (res) => {
      settled = true;
      return { status: res.status, ms: Date.now() - started };
    });
    await new Promise((r) => setTimeout(r, 150));

    const mid = await fetch(`${BASE}/rooms/1/messages?afterSequence=${max}`);
    const got = ((await mid.json()) as { data: Message[] }).data;
    expect(settled).toBe(false);
    expect(got.map((m) => m.clientMessageId)).toEqual([key]);
    expect(got[0]?.body).toBe("늦은 답이에요");

    const done = await sending;
    expect(done.status).toBe(201);
    // 손잡이 1000 + 기본 보내기 지연 300
    expect(done.ms).toBeGreaterThanOrEqual(1300);
    // 1회만: 다음 보내기는 기본 지연만
    const t = Date.now();
    const next = await fetch(`${BASE}/rooms/1/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": "33333333-3333-4333-8333-333333333333",
      },
      body: JSON.stringify({ body: "다음 글", inquiry: null }),
    });
    expect(next.status).toBe(201);
    expect(Date.now() - t).toBeLessThan(1000);
  }, 10_000);

  it("delay op 는 room messages rooms send, 모르는 op 는 400", async () => {
    for (const op of ["room", "messages", "rooms", "send"])
      expect((await post("/delay", { op, ms: 0 })).status).toBe(200);
    expect((await post("/delay", { op: "stats", ms: 10 })).status).toBe(400);
  });

  it("reset seed 는 stats-v1 | rooms-70, 모르는 시드는 400", async () => {
    expect((await post("/reset", { seed: "rooms-71" })).status).toBe(400);
    expect((await post("/reset", { seed: "rooms-70" })).status).toBe(200);
  });
});
