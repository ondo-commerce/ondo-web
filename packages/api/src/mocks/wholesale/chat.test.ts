import { setupServer } from "msw/node";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { WholesaleSchema } from "../../wholesale";
import { CHAT_SEED_REPLAY_KEY, chatHandlers, resetChatMock } from "./chat";

/**
 * 채팅 계약 테스트(S1-3 ~ S1-8). 목을 `msw/node`로 띄워 실제 HTTP로 부른다.
 *
 * 무엇을 지키나: 화면(#264, #265)과 나중의 BE가 같은 약속을 본다. 이 테스트가 깨지면 목이
 * 계약에서 벗어난 것이고, 그 목으로 통과한 화면도 실서버에서 깨진다.
 */

const ORIGIN = "http://mock.test";
const BASE = `${ORIGIN}/api/wholesale/chat`;

type Summary = WholesaleSchema<"ChatRoomSummary">;
type Message = WholesaleSchema<"ChatMessage">;
type SendResult = WholesaleSchema<"ChatSendResult">;

const server = setupServer(...chatHandlers);
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterAll(() => server.close());
beforeEach(() => resetChatMock());

async function get<T>(path: string) {
  const res = await fetch(`${BASE}${path}`);
  return { status: res.status, body: (await res.json()) as T };
}

async function post<T>(
  path: string,
  json: unknown,
  headers: Record<string, string> = {},
) {
  const res = await fetch(path.startsWith("http") ? path : `${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(json),
  });
  return { status: res.status, body: (await res.json()) as T };
}

interface ErrorBody {
  code: string;
  errors: { field: string }[];
}

function send(roomId: number, key: string, body: string) {
  return post<{ data: SendResult } & ErrorBody>(
    `/rooms/${roomId}/messages`,
    { body, inquiry: null },
    { "Idempotency-Key": key },
  );
}

describe("채팅 계약 (도매 목)", () => {
  it("S1-3 방 목록: 30개 + 커서로 2개, 중복 0, lastActivityAt desc → roomId desc", async () => {
    type Page = {
      data: Summary[];
      meta: WholesaleSchema<"CursorPageMeta">;
    };
    const first = await get<Page>("/rooms");
    expect(first.status).toBe(200);
    expect(first.body.data).toHaveLength(30);
    const cursor = first.body.meta.nextCursor;
    expect(cursor).not.toBeNull();

    const second = await get<Page>(
      `/rooms?cursor=${encodeURIComponent(cursor ?? "")}`,
    );
    expect(second.body.data).toHaveLength(2);
    expect(second.body.meta.nextCursor).toBeNull();

    const all = [...first.body.data, ...second.body.data];
    const ids = all.map((r) => r.roomId);
    expect(new Set(ids).size).toBe(32);
    // 다른 도매처 방(33)은 없다
    expect(ids).not.toContain(33);
    for (let i = 1; i < all.length; i++) {
      const prev = all[i - 1];
      const cur = all[i];
      if (prev === undefined || cur === undefined) continue;
      const diff =
        Date.parse(prev.lastActivityAt) - Date.parse(cur.lastActivityAt);
      expect(diff >= 0).toBe(true);
      if (diff === 0) expect(prev.roomId).toBeGreaterThan(cur.roomId);
    }
    // 시드에 동률(20, 21)이 있어 보조 정렬을 실제로 탄다
    const ties = all.filter((r) => r.roomId === 20 || r.roomId === 21);
    expect(ties[0]?.lastActivityAt).toBe(ties[1]?.lastActivityAt);

    // size=1로 끝까지 걸으면 모든 경계(동률 20, 21 사이 포함)를 커서가 지난다
    const walked: number[] = [];
    let next: string | null = null;
    do {
      const query: string =
        next === null ? "" : `&cursor=${encodeURIComponent(next)}`;
      const page: { body: Page } = await get<Page>(`/rooms?size=1${query}`);
      walked.push(...page.body.data.map((r) => r.roomId));
      next = page.body.meta.nextCursor;
    } while (next !== null && walked.length < 40);
    expect(walked).toEqual(ids);

    expect((await get("/rooms?cursor=zzz")).status).toBe(400);
    expect((await get("/rooms?size=101")).status).toBe(400);
  });

  it("S1-4 보내기: 201 → 같은 키 200 → 다른 본문 409 → 글자 수 400, 동시 요청 1건", async () => {
    const key = "11111111-1111-4111-8111-111111111111";
    const created = await send(1, key, "  내일 보내 드릴게요  ");
    expect(created.status).toBe(201);
    expect(created.body.data.generatedMessages).toEqual([]);
    expect(created.body.data.generation).toBe("NONE");
    expect(created.body.data.message.clientMessageId).toBe(key);
    expect(created.body.data.message.body).toBe("내일 보내 드릴게요");
    expect(created.body.data.message.sender).toBe("WHOLESALER");

    const replay = await send(1, key, "  내일 보내 드릴게요  ");
    expect(replay.status).toBe(200);
    expect(replay.body).toEqual(created.body);

    const reused = await send(1, key, "다른 글");
    expect(reused.status).toBe(409);
    expect(reused.body.code).toBe("IDEMPOTENCY_KEY_REUSED");

    // 시드의 중복 재전송 기록(방 6)도 replay 다
    const seeded = await send(6, CHAT_SEED_REPLAY_KEY, "네 내일 보내 드릴게요");
    expect(seeded.status).toBe(200);

    const blank = await send(1, crypto.randomUUID(), "   \n ");
    expect(blank.status).toBe(400);
    expect(blank.body.errors[0]?.field).toBe("body");

    const over = await send(1, crypto.randomUUID(), "가".repeat(1001));
    expect(over.status).toBe(400);
    expect(over.body.errors[0]?.field).toBe("body");

    // 이모지 10개(UTF-16으로는 20) + 990 = 코드 포인트 정확히 1000
    const exact = "😀".repeat(10) + "가".repeat(990);
    expect(exact.length).toBe(1010);
    expect((await send(1, crypto.randomUUID(), exact)).status).toBe(201);

    // 같은 키 동시 2건 → 하나만 만든다
    const both = crypto.randomUUID();
    const [a, b] = await Promise.all([
      send(2, both, "동시에"),
      send(2, both, "동시에"),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 201]);
    expect(a.body.data.message.id).toBe(b.body.data.message.id);
    const msgs = await get<{ data: Message[] }>("/rooms/2/messages");
    expect(
      msgs.body.data.filter((m) => m.clientMessageId === both),
    ).toHaveLength(1);
  });

  it("S1-5 120개 방: 최신 50(71~120) hasMore, after 커서 3번에 누락·중복 0, after+before 400", async () => {
    type Page = {
      data: Message[];
      meta: WholesaleSchema<"ChatMessagePageMeta">;
    };
    const latest = await get<Page>("/rooms/3/messages");
    expect(latest.body.data.map((m) => m.sequence)).toEqual(
      Array.from({ length: 50 }, (_, i) => 71 + i),
    );
    expect(latest.body.meta.hasMore).toBe(true);
    expect(latest.body.meta.maxSequence).toBe(120);

    const seen: number[] = [];
    let after = 0;
    const hasMores: boolean[] = [];
    for (let i = 0; i < 3; i++) {
      const page = await get<Page>(
        `/rooms/3/messages?afterSequence=${after}&size=50`,
      );
      seen.push(...page.body.data.map((m) => m.sequence));
      hasMores.push(page.body.meta.hasMore);
      after = page.body.data.at(-1)?.sequence ?? after;
    }
    expect(seen).toEqual(Array.from({ length: 120 }, (_, i) => i + 1));
    expect(hasMores).toEqual([true, true, false]);

    const older = await get<Page>(
      "/rooms/3/messages?beforeSequence=71&size=50",
    );
    expect(older.body.data[0]?.sequence).toBe(21);
    expect(older.body.data.at(-1)?.sequence).toBe(70);
    expect(older.body.meta.hasMore).toBe(true);

    // 같은 시각, 역전이 있는 방도 sequence 오름차순
    const tie = await get<Page>("/rooms/5/messages");
    expect(tie.body.data.map((m) => m.sequence)).toEqual([1, 2, 3, 4]);

    const both = await get<ErrorBody>(
      "/rooms/3/messages?afterSequence=1&beforeSequence=10",
    );
    expect(both.status).toBe(400);
    expect(both.body.code).toBe("VALIDATION_FAILED");
  });

  it("S1-6 읽음: 큰 값 → unreadCount 0, 작은 값 → lastReadSequence 그대로", async () => {
    type Read = { data: WholesaleSchema<"ChatReadResult"> };
    const before = await get<{ data: Summary }>("/rooms/3");
    expect(before.body.data.unreadCount).toBe(10);

    const up = await post<Read>("/rooms/3/read", { lastReadSequence: 120 });
    expect(up.status).toBe(200);
    expect(up.body.data).toEqual({
      roomId: 3,
      lastReadSequence: 120,
      unreadCount: 0,
    });

    const down = await post<Read>("/rooms/3/read", { lastReadSequence: 40 });
    expect(down.body.data.lastReadSequence).toBe(120);
    expect(down.body.data.unreadCount).toBe(0);

    const room = await get<{ data: Summary }>("/rooms/3");
    expect(room.body.data.myLastReadSequence).toBe(120);

    expect(
      (await post("/rooms/3/read", { lastReadSequence: 121 })).status,
    ).toBe(400);
  });

  it("S1-7 없는 방(99999)과 다른 도매처 방(33): 머리, 메시지, 보내기, 읽음 넷 다 404", async () => {
    for (const roomId of [99999, 33]) {
      const head = await get<ErrorBody>(`/rooms/${roomId}`);
      const list = await get<ErrorBody>(`/rooms/${roomId}/messages`);
      const sent = await send(roomId, crypto.randomUUID(), "안녕하세요");
      const read = await post<ErrorBody>(`/rooms/${roomId}/read`, {
        lastReadSequence: 1,
      });
      for (const res of [head, list, sent, read]) {
        expect(res.status).toBe(404);
        expect(res.body.code).toBe("RESOURCE_NOT_FOUND");
      }
    }
  });

  it("S1-8 손잡이: incoming 주입 → after 조회에 나오고 unread +1, fail messages 2회 → 500 두 번 뒤 성공", async () => {
    const before = await get<{ data: Summary }>("/rooms/1");
    const unread = before.body.data.unreadCount;
    const head = await get<{
      data: Message[];
      meta: WholesaleSchema<"ChatMessagePageMeta">;
    }>("/rooms/1/messages");
    const max = head.body.meta.maxSequence;

    const injected = await post(`${ORIGIN}/__mock/chat/rooms/1/incoming`, {
      body: "블랙 M 있어요?",
    });
    expect(injected.status).toBe(201);

    const next = await get<{ data: Message[] }>(
      `/rooms/1/messages?afterSequence=${max}`,
    );
    expect(next.body.data).toHaveLength(1);
    expect(next.body.data[0]?.sequence).toBe(max + 1);
    expect(next.body.data[0]?.sender).toBe("RETAILER");
    expect(next.body.data[0]?.body).toBe("블랙 M 있어요?");
    const after = await get<{ data: Summary }>("/rooms/1");
    expect(after.body.data.unreadCount).toBe(unread + 1);
    expect(after.body.data.needsReply).toBe(true);

    await post(`${ORIGIN}/__mock/chat/fail`, { op: "messages", times: 2 });
    const statuses: number[] = [];
    for (let i = 0; i < 3; i++) {
      statuses.push((await fetch(`${BASE}/rooms/1/messages`)).status);
    }
    expect(statuses).toEqual([500, 500, 200]);
  });
});
