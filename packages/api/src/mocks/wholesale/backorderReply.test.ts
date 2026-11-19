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
import { addDays } from "../chat/backorderCandidates";
import { GOLDEN_D0, GOLDEN_T0 } from "../chat/golden.testkit";
import { backorderHandlers } from "./backorder";
import { chatHandlers, resetChatMock } from "./chat";

/**
 * 도매 쪽에서 본 미송 자동 답(loop-06 S1-7)과 미송 시드 변경의 영향. 채팅 목과 미송 목을 **한 서버에** 올린다 —
 * 브라우저 도매 탭과 같은 구성이라 미송 탭의 입고일 저장, 배분이 다음 자동 답에 바로 쓰이는지 볼 수 있다.
 */

const ORIGIN = "http://mock.test";
const API = `${ORIGIN}/api/wholesale`;

type Message = WholesaleSchema<"ChatMessage">;

const server = setupServer(...chatHandlers, ...backorderHandlers);
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterAll(() => server.close());
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(GOLDEN_T0);
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

/** 소매 메시지 주입 + 판정(`autoReply: true`). 생성 줄만 돌려준다 */
async function incoming(
  body: string,
  inquiry?: Partial<WholesaleSchema<"ChatInquiry">>,
): Promise<Message[]> {
  const res = await call<{ data: Message[] }>(
    "POST",
    `${ORIGIN}/__mock/chat/rooms/1/incoming`,
    {
      body,
      autoReply: true,
      ...(inquiry === undefined
        ? {}
        : { inquiry: { intent: "BACKORDER", ...inquiry } }),
    },
  );
  expect(res.status).toBe(201);
  return res.body.data.slice(1);
}

describe("S1-7 도매 incoming {autoReply: true} 미송 판정", () => {
  it('"레드 L 미송 언제 와요?" → 방 1에 미송 되묻기 [9001 9006 NOT_LISTED], 상품 문맥은 안 바뀐다', async () => {
    const [clarify, ...rest] = await incoming("레드 L 미송 언제 와요?");
    expect(rest).toEqual([]);
    expect(clarify?.kind).toBe("CLARIFY");
    expect(
      clarify?.autoReply?.choices?.map((c) => [c.kind, c.backorderId]),
    ).toEqual([
      ["BACKORDER", 9001],
      ["BACKORDER", 9006],
      ["NOT_LISTED", null],
    ]);
    // 문맥은 그대로(방 1은 2001) — 재고 문장은 여전히 그 상품으로 답한다
    const [stock] = await incoming("레드 M 몇 장 있어요?");
    expect(stock?.autoReply?.subject.listingId).toBe(2001);
  });

  it("미송 탭에서 3003 입고일을 T0+10일로 저장 → 같은 주입 + 칩 9001 → 새 날짜, 옛 날짜 0", async () => {
    await incoming("레드 L 미송 언제 와요?");
    const before = await incoming("빈티지 플라워 셔츠 레드/L, 남은 4장", {
      backorderId: 9001,
      variantId: 3003,
    });
    expect(before[0]?.body).toContain("10월 26일이 지났어요");

    const next = addDays(GOLDEN_D0, 10);
    const put = await call("PUT", `${API}/variants/3003/expected-inbound`, {
      expectedInboundDate: next,
      expectedInboundReason: "공장 일정 변경",
    });
    expect(put.status).toBe(200);

    await incoming("레드 L 미송 언제 와요?");
    const after = await incoming("빈티지 플라워 셔츠 레드/L, 남은 4장", {
      backorderId: 9001,
      variantId: 3003,
    });
    expect(after.map((m) => m.kind)).toEqual(["AUTO_REPLY"]);
    expect(after[0]?.body).toBe(
      "빈티지 플라워 셔츠 레드 L 남은 미송 4장은 11월 8일 도매 입고 예정이에요(공장 일정 변경)",
    );
    expect(after[0]?.autoReply?.facts.backorder).toEqual({
      qty: 4,
      expectedInboundDate: next,
      expectedInboundReason: "공장 일정 변경",
    });
    expect(JSON.stringify(after)).not.toContain("10월 26일");
  });

  it("부분 배분(9003 1장) → 칩 9003 답 남은 1장. 되묻기 뒤 나머지 1장 배분(해소) → 같은 칩 넘김", async () => {
    const alloc = (qty: number) =>
      call("POST", `${API}/backorders/allocations`, {
        items: [{ backorderId: 9003, allocateQty: qty }],
      });
    expect((await alloc(1)).status).toBe(201);
    await incoming("미송 언제 와요?");
    const part = await incoming("린넨 셋업 자켓 베이지/L", {
      backorderId: 9003,
      variantId: 3019,
    });
    expect(part[0]?.autoReply?.facts.backorder?.qty).toBe(1);
    expect(part[0]?.body).toContain("남은 미송 1장은");

    await incoming("미송 언제 와요?");
    expect((await alloc(1)).status).toBe(201);
    const gone = await incoming("린넨 셋업 자켓 베이지/L", {
      backorderId: 9003,
      variantId: 3019,
    });
    expect(gone.map((m) => m.kind)).toEqual(["HANDOFF"]);
    expect(JSON.stringify(gone)).not.toContain("입고 예정");
  });

  it("notListed 칩 주입 → 넘김. 도매 facts 도 남은 수량(원래 4장인 9006 → 2)", async () => {
    await incoming("레드 L 미송 언제 와요?");
    const nl = await incoming("다른 주문이에요", {
      notListed: true,
      variantId: 0,
    });
    expect(nl.map((m) => m.kind)).toEqual(["HANDOFF"]);

    resetChatMock();
    await incoming("레드 L 미송 언제 와요?");
    const a = await incoming("빈티지 플라워 셔츠 레드/L, 남은 2장", {
      backorderId: 9006,
      variantId: 3003,
    });
    expect(a.map((m) => m.kind)).toEqual(["AUTO_REPLY", "HANDOFF"]);
    expect(a[0]?.autoReply?.facts.backorder?.qty).toBe(2);
  });
});

describe("미송 시드 변경의 영향(미송 탭)", () => {
  type Sku = WholesaleSchema<"BackorderSkuResponse">;

  it("SKU 3003 미송 합 15(4 + 9 + 2), 3019 2, 3011 1. 102의 SKU 3801, 해소만 있는 3002 는 안 나온다", async () => {
    const res = await call<{ data: Sku[] }>(
      "GET",
      `${API}/backorders/variants`,
    );
    expect(res.body.data.map((s) => [s.variantId, s.backorderQty])).toEqual([
      [3003, 15],
      [3019, 2],
      [3011, 1],
    ]);
    const s3003 = res.body.data.find((s) => s.variantId === 3003);
    expect(s3003?.expectedInboundDate).toBe(addDays(GOLDEN_D0, -3));
    expect((await call("GET", `${API}/variants/3801/backorders`)).status).toBe(
      404,
    );
  });

  it("3003 상세: OPEN 3건 오래된 순(9001, 9005, 9006), 9006 은 원래 4 남은 2", async () => {
    const res = await call<{
      data: WholesaleSchema<"BackorderResponse">[];
      stats: WholesaleSchema<"BackorderStatsResponse">;
    }>("GET", `${API}/variants/3003/backorders`);
    expect(res.body.data.map((b) => [b.id, b.qty, b.remainingQty])).toEqual([
      [9001, 4, 4],
      [9005, 9, 9],
      [9006, 4, 2],
    ]);
    expect(res.body.stats).toMatchObject({
      backorderQty: 15,
      orderCount: 3,
      retailerCount: 2,
    });
  });

  it("남의 도매처 미송 801 은 배분할 수 없다(404)", async () => {
    const res = await call<{ code: string }>(
      "POST",
      `${API}/backorders/allocations`,
      { items: [{ backorderId: 801, allocateQty: 1 }] },
    );
    expect(res.status).toBe(404);
  });
});
