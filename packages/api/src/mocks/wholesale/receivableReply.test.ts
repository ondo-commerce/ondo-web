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
import { GOLDEN_T0 } from "../chat/golden.testkit";
import { toReceivableFacts } from "../chat/receivable";
import { chatHandlers, resetChatMock } from "./chat";
import { mockReceivable, settlementHandlers } from "./settlement";

/**
 * 도매 쪽에서 본 미수 자동 답과 넘김 이유(loop-07 S1-6, S1-7 도매 몫, S1-8, S1-9). 채팅 목과 정산 목을 **한 서버에**
 * 올린다 — 브라우저 도매 탭과 같은 구성이라 정산 탭 입금이 다음 자동 답에 바로 쓰이는지 볼 수 있다(장면 3 S3-3).
 */

const ORIGIN = "http://mock.test";
const API = `${ORIGIN}/api/wholesale`;
const MINUTE = 60_000;
const T0_ISO = new Date(GOLDEN_T0).toISOString();

type Message = WholesaleSchema<"ChatMessage">;

const server = setupServer(...chatHandlers, ...settlementHandlers);
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

async function call<T>(
  method: string,
  url: string,
  json?: unknown,
  headers: Record<string, string> = {},
) {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json", ...headers },
    body: json === undefined ? undefined : JSON.stringify(json),
  });
  return { status: res.status, body: (await res.json()) as T };
}

/** 소매 메시지 주입 + 판정. [소매 메시지, ...방에 들어간 생성 줄] */
async function incoming(
  body: string,
  roomId = 1,
  extra: Record<string, unknown> = {},
): Promise<[Message, ...Message[]]> {
  const res = await call<{ data: [Message, ...Message[]] }>(
    "POST",
    `${ORIGIN}/__mock/chat/rooms/${roomId}/incoming`,
    { body, autoReply: true, ...extra },
  );
  expect(res.status).toBe(201);
  return res.body.data;
}

async function messages(roomId = 1): Promise<Message[]> {
  const res = await call<{ data: Message[] }>(
    "GET",
    `${API}/chat/rooms/${roomId}/messages?size=100`,
  );
  expect(res.status).toBe(200);
  return res.body.data;
}

/** 방 머리의 `답 필요`. 열린 넘김과 같이 움직이는지도 본다(이 시험의 방 1은 넘김 말고는 답 필요 이유가 없다) */
async function needsReply(roomId = 1): Promise<boolean> {
  const res = await call<{
    data: { needsReply: boolean; openHandoff: boolean };
  }>("GET", `${API}/chat/rooms/${roomId}`);
  expect(res.body.data.openHandoff).toBe(res.body.data.needsReply);
  return res.body.data.needsReply;
}

let keySeq = 0;
function key() {
  keySeq += 1;
  return `00000000-0000-4000-a000-${String(keySeq).padStart(12, "0")}`;
}

async function pay(
  amount: number,
  allocations: { orderId: number; amount: number }[],
) {
  const res = await call<{ data: unknown }>(
    "POST",
    `${API}/payments`,
    {
      retailerId: 1,
      amount,
      paidAt: new Date().toISOString(),
      paidBy: "RETAILER",
      method: "BANK_TRANSFER",
      allocations,
    },
    { "Idempotency-Key": key() },
  );
  expect(res.status).toBe(201);
}

const B_37500 =
  "갚을 돈은 37,500원이에요. 그중 기한 지난 것 1건, 37,500원이에요";

describe("S1-8 넘김 저장: handoff {reason, intent, sourceSequence}", () => {
  it("넘김 줄에 이유, 의도, 원인 소매 메시지. GET messages 의 HANDOFF 는 전부 값, 그 밖 줄은 전부 null", async () => {
    const [ask, line, ...rest] = await incoming("조금 깎아 주세요");
    expect(rest).toEqual([]);
    expect(line?.kind).toBe("HANDOFF");
    expect(line?.handoff).toEqual({
      reason: "NEGOTIATION",
      intent: null,
      sourceSequence: ask.sequence,
    });
    const all = await messages();
    expect(all.length).toBeGreaterThan(2);
    for (const m of all) {
      expect("handoff" in m, `${m.sequence}`).toBe(true);
      if (m.kind === "HANDOFF")
        expect(m.handoff, `${m.sequence}`).not.toBeNull();
      else expect(m.handoff, `${m.sequence}`).toBeNull();
    }
  });

  it("시드 넘김 줄(방 2 협상)도 이유가 있다", async () => {
    const seed = (await messages(2)).filter((m) => m.kind === "HANDOFF");
    expect(seed.map((m) => m.handoff)).toEqual([
      { reason: "NEGOTIATION", intent: null, sourceSequence: 3 },
    ]);
  });

  it("열린 넘김과 같은 이유 → 새 줄 0, 다른 이유 → 새 줄 1(최신 이유, 원인 메시지)", async () => {
    await incoming("조금 깎아 주세요");
    const [, ...same] = await incoming("더 깎아 주세요");
    expect(same).toEqual([]);
    const [paid, ...next] = await incoming("방금 입금했어요");
    expect(next.map((m) => [m.kind, m.handoff])).toEqual([
      [
        "HANDOFF",
        {
          reason: "PAYMENT_REPORT",
          intent: "RECEIVABLE",
          sourceSequence: paid.sequence,
        },
      ],
    ]);
    // 옛 줄은 그대로다(afterSequence 로 이어 받는 도매가 바뀐 옛 줄을 못 받는다)
    const handoffs = (await messages()).filter((m) => m.kind === "HANDOFF");
    expect(handoffs.map((m) => m.handoff?.reason)).toEqual([
      "NEGOTIATION",
      "PAYMENT_REPORT",
    ]);
  });

  it("STOCK_ZERO 예외 그대로: 열린 넘김이 있어도 재고 0 답의 넘김 줄은 붙고 이유는 STOCK_ZERO", async () => {
    await incoming("조금 깎아 주세요");
    const [ask, ...lines] = await incoming("레드 L 몇 장 있어요", 1, {
      contextListingId: 2001,
    });
    expect(lines.map((m) => [m.kind, m.handoff])).toEqual([
      ["AUTO_REPLY", null],
      [
        "HANDOFF",
        { reason: "STOCK_ZERO", intent: "STOCK", sourceSequence: ask.sequence },
      ],
    ]);
  });

  it("미수 답은 넘김 줄이 없어 열린 넘김 중에도 금액만 나가고, 넘김은 닫히지 않는다. 사장 TEXT 로 닫힌다", async () => {
    await incoming("조금 깎아 주세요");
    expect(await needsReply()).toBe(true);
    const [, answer, ...rest] = await incoming("지금 미수 얼마예요?");
    expect(rest).toEqual([]);
    expect(answer?.body).toBe(B_37500);
    expect(answer?.handoff).toBeNull();
    expect(await needsReply()).toBe(true);
    const sent = await call(
      "POST",
      `${API}/chat/rooms/1/messages`,
      { body: "확인해 볼게요", inquiry: null },
      { "Idempotency-Key": key() },
    );
    expect(sent.status).toBe(201);
    expect(await needsReply()).toBe(false);
  });
});

describe("S1-6 조회 시각과 입금 뒤 새 금액(도매 incoming + 정산 입금)", () => {
  it("14:20 답 37,500 checkedAt 14:20 → 14:25 입금 50,000(7004에 37,500 배분) → 같은 질문에 D 12,500, checkedAt 14:25", async () => {
    const [, first] = await incoming("지금 미수 얼마예요?");
    expect(first?.body).toBe(B_37500);
    expect(first?.autoReply?.checkedAt).toBe(T0_ISO);

    vi.setSystemTime(GOLDEN_T0 + 5 * MINUTE);
    await pay(50_000, [{ orderId: 7004, amount: 37_500 }]);
    const [, second, ...rest] = await incoming("지금 미수 얼마예요?");
    expect(rest).toEqual([]);
    expect(second?.body).toBe(
      "지금 갚을 돈은 없어요. 미리 낸 돈(선수금) 12,500원이 남아 있어요",
    );
    expect(second?.body).not.toContain("37,500");
    expect(second?.autoReply?.facts.receivable).toEqual({
      outstandingAmount: 0,
      prepaidAmount: 12_500,
      overdue: { count: 0, amount: 0, maxDaysOverdue: 0 },
    });
    expect(second?.autoReply?.checkedAt).toBe(
      new Date(GOLDEN_T0 + 5 * MINUTE).toISOString(),
    );
  });

  it("입금 20,000 배분 없음 → 미수 질문은 넘김(AMOUNT_UNSURE), 금액 줄 0", async () => {
    await pay(20_000, []);
    const [ask, ...lines] = await incoming("지금 미수 얼마예요?");
    expect(lines.map((m) => [m.kind, m.handoff])).toEqual([
      [
        "HANDOFF",
        {
          reason: "AMOUNT_UNSURE",
          intent: "RECEIVABLE",
          sourceSequence: ask.sequence,
        },
      ],
    ]);
  });

  it("채팅 reset 은 정산 장부도 시드로 되돌린다(입금 뒤 reset → 다시 37,500)", async () => {
    await pay(50_000, [{ orderId: 7004, amount: 37_500 }]);
    const reset = await call("POST", `${ORIGIN}/__mock/chat/reset`, {});
    expect(reset.status).toBe(200);
    const [, answer] = await incoming("지금 미수 얼마예요?");
    expect(answer?.body).toBe(B_37500);
  });
});

describe("S1-7 도매 몫: 방의 소매처 줄만", () => {
  it("방 2(대기상회, 출고 0) → 그 줄의 facts 그대로 C. 방 1 봄봄상회의 37,500 이 섞이지 않는다", async () => {
    const [, answer] = await incoming("지금 미수 얼마예요?", 2);
    const row = mockReceivable(101, 2);
    if (row === null) throw new Error("시드에 (101, 2) 줄 없음");
    const converted = toReceivableFacts(row);
    if (!converted.ok) throw new Error(converted.anomaly);
    expect(answer?.autoReply?.facts.receivable).toEqual(converted.facts);
    expect(answer?.autoReply?.facts.receivable).toEqual({
      outstandingAmount: 0,
      prepaidAmount: 0,
      overdue: { count: 0, amount: 0, maxDaysOverdue: 0 },
    });
    expect(answer?.body).toBe("지금 갚을 돈은 없어요");
  });
});

describe("S1-9 fail {op: receivable}", () => {
  it("다음 미수 질문 1회 → 넘김 LOOKUP_FAILED(주입 201), 그다음은 정상 답", async () => {
    const knob = await call("POST", `${ORIGIN}/__mock/chat/fail`, {
      op: "receivable",
      times: 1,
    });
    expect(knob.status).toBe(200);
    const [ask, ...failed] = await incoming("지금 미수 얼마예요?");
    expect(failed.map((m) => [m.kind, m.handoff])).toEqual([
      [
        "HANDOFF",
        {
          reason: "LOOKUP_FAILED",
          intent: "RECEIVABLE",
          sourceSequence: ask.sequence,
        },
      ],
    ]);
    const [, ok] = await incoming("지금 미수 얼마예요?");
    expect(ok?.body).toBe(B_37500);
  });

  it("재고 질문은 미수 원본을 안 읽어 실패 계획을 쓰지 않는다", async () => {
    await call("POST", `${ORIGIN}/__mock/chat/fail`, {
      op: "receivable",
      times: 1,
    });
    const [, stock] = await incoming("레드 M 몇 장 있어요?");
    expect(stock?.kind).toBe("AUTO_REPLY");
    const [, ...failed] = await incoming("지금 미수 얼마예요?");
    expect(failed.map((m) => m.handoff?.reason)).toEqual(["LOOKUP_FAILED"]);
  });
});
