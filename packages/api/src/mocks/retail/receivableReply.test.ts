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
import { chatExtraReceivables } from "../chat/extraReceivables";
import { receivableOf, toReceivableFacts } from "../chat/receivable";
import { mockReceivable } from "../wholesale/settlement";
import { resetRetailChatMock, retailChatHandlers } from "./chat";

/**
 * 소매 쪽에서 본 미수 자동 답(loop-07 S1-7, S1-9 소매 몫). **소매 핸들러만** 올린다 — 소매 앱 worker 와 같은 구성이라
 * `/__mock/chat/fail {op: receivable}`을 소매 손잡이가 받는지까지 본다(도매 손잡이가 먼저 잡으면 못 본다).
 *
 * 소유권은 문자열이 아니라 **구조**로 본다(Codex 8): 응답 facts 가 (세션 소매처, 방 도매처) 줄의 facts 와 `toEqual`.
 * 같은 금액이나 쉼표 차이는 문자열 검사가 못 잡는다.
 */

const ORIGIN = "http://mock.test";
const RETAIL = `${ORIGIN}/api/retail/chat`;

type Message = RetailSchema<"ChatMessage">;
type SendResult = RetailSchema<"ChatSendResult">;

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
  const text = await res.text();
  return { status: res.status, text, body: JSON.parse(text) as T };
}

let keySeq = 0;
function key() {
  keySeq += 1;
  return `00000000-0000-4000-b000-${String(keySeq).padStart(12, "0")}`;
}

function send(body: string, roomId = 1) {
  return call<{ data: SendResult }>(
    "POST",
    `${RETAIL}/rooms/${roomId}/messages`,
    { body, inquiry: null },
    { "Idempotency-Key": key() },
  );
}

/** (세션 소매처 1, 방 도매처) 줄 → 소매에게 나가야 할 facts */
function expectedFacts(wholesalerId: number) {
  const row =
    wholesalerId === 101
      ? mockReceivable(101, 1)
      : receivableOf(
          chatExtraReceivables(new Date().toISOString()),
          wholesalerId,
          1,
        );
  if (row === null) throw new Error(`(${wholesalerId}, 1) 줄 없음`);
  const c = toReceivableFacts(row);
  if (!c.ok) throw new Error(c.anomaly);
  return c.facts;
}

/** JSON 의 모든 키(중첩까지) */
function keysIn(value: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(value)) for (const v of value) keysIn(v, out);
  else if (value !== null && typeof value === "object")
    for (const [k, v] of Object.entries(value)) {
      out.add(k);
      keysIn(v, out);
    }
  return out;
}

/** 소매 응답에 없어야 할 키(§4-1 13). 원본 한 줄의 칸 이름과 도매 전용 칸 */
const FORBIDDEN = [
  "balance",
  "unpaid",
  "prepaid",
  "exact",
  "asOf",
  "ledgerBalance",
  "retailerName",
  "paidLast7Days",
  "handoff",
];

describe("S1-7 소유권: 소매 응답의 receivable = (세션 소매처, 방 도매처) 줄의 facts", () => {
  it("방 1(무드온 101) send 와 messages → (101, 1) facts, 본문 B. 방 33(라온 102) → (102, 1) facts, 본문 A, 새 줄에 37,500 없음", async () => {
    const one = await send("지금 미수 얼마예요?", 1);
    expect(one.status).toBe(201);
    const [answer1, ...rest1] = one.body.data.generatedMessages;
    expect(rest1).toEqual([]);
    expect(answer1?.autoReply?.facts.receivable).toEqual(expectedFacts(101));
    expect(answer1?.autoReply?.facts.receivable).toEqual({
      outstandingAmount: 37_500,
      prepaidAmount: 0,
      overdue: { count: 1, amount: 37_500, maxDaysOverdue: 54 },
    });
    expect(answer1?.body).toBe(
      "갚을 돈은 37,500원이에요. 그중 기한 지난 것 1건, 37,500원이에요",
    );
    expect(answer1?.autoReply?.facts.stock).toBeNull();
    expect(answer1?.autoReply?.facts.backorder).toBeNull();

    const thirtyThree = await send("지금 미수 얼마예요?", 33);
    const [answer33] = thirtyThree.body.data.generatedMessages;
    expect(answer33?.autoReply?.facts.receivable).toEqual(expectedFacts(102));
    expect(answer33?.autoReply?.facts.receivable).toEqual({
      outstandingAmount: 52_000,
      prepaidAmount: 0,
      overdue: { count: 0, amount: 0, maxDaysOverdue: 0 },
    });
    expect(answer33?.body).toBe(
      "갚을 돈은 52,000원이에요. 기한 지난 것은 없어요",
    );
    expect(JSON.stringify(answer33)).not.toContain("37,500");
    expect(JSON.stringify(answer33)).not.toContain("37500");

    // GET messages 가 같은 줄을 같은 facts 로 준다
    for (const [roomId, answer] of [
      [1, answer1],
      [33, answer33],
    ] as const) {
      const page = await call<{ data: Message[] }>(
        "GET",
        `${RETAIL}/rooms/${roomId}/messages?size=100`,
      );
      const stored = page.body.data.find((m) => m.id === answer?.id);
      expect(stored?.autoReply?.facts.receivable).toEqual(
        answer?.autoReply?.facts.receivable,
      );
    }
  });

  it("send, messages, rooms, rooms/{id} 응답 전부에 금지 키 0(원본 칸, 넘김 이유)", async () => {
    const bodies: unknown[] = [];
    for (const roomId of [1, 33]) {
      bodies.push((await send("지금 미수 얼마예요?", roomId)).body);
      bodies.push((await send("조금 깎아 주세요", roomId)).body);
      bodies.push((await send("방금 입금했어요", roomId)).body);
      bodies.push(
        (await call("GET", `${RETAIL}/rooms/${roomId}/messages?size=100`)).body,
        (await call("GET", `${RETAIL}/rooms/${roomId}`)).body,
      );
    }
    bodies.push((await call("GET", `${RETAIL}/rooms`)).body);
    const keys = keysIn(bodies);
    expect(FORBIDDEN.filter((k) => keys.has(k))).toEqual([]);
    // 빈 검사가 아니다: 미수 facts 와 넘김 줄이 실제로 실렸다
    expect(keys.has("outstandingAmount")).toBe(true);
    expect(JSON.stringify(bodies)).toContain('"kind":"HANDOFF"');
  });
});

describe("S1-9 소매 fail {op: receivable}", () => {
  it("소매 손잡이가 받는다 → 보내기 201 + 넘김 1줄(금액 줄 0), 다음 질문은 정상 답", async () => {
    const knob = await call("POST", `${ORIGIN}/__mock/chat/fail`, {
      op: "receivable",
      times: 1,
    });
    expect(knob.status).toBe(200);
    const failed = await send("지금 미수 얼마예요?");
    expect(failed.status).toBe(201);
    expect(failed.body.data.generation).toBe("DONE");
    expect(failed.body.data.generatedMessages.map((m) => m.kind)).toEqual([
      "HANDOFF",
    ]);
    const ok = await send("지금 미수 얼마예요?");
    expect(ok.status).toBe(201);
    expect(ok.body.data.generatedMessages.map((m) => m.kind)).toEqual([
      "AUTO_REPLY",
    ]);
    expect(
      ok.body.data.generatedMessages[0]?.autoReply?.facts.receivable,
    ).toEqual(expectedFacts(101));
  });

  it("reset 이 실패 계획을 지운다", async () => {
    await call("POST", `${ORIGIN}/__mock/chat/fail`, {
      op: "receivable",
      times: 3,
    });
    await call("POST", `${ORIGIN}/__mock/chat/reset`, {});
    const res = await send("지금 미수 얼마예요?");
    expect(res.body.data.generatedMessages.map((m) => m.kind)).toEqual([
      "AUTO_REPLY",
    ]);
  });
});
