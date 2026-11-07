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
import { inquiryBackorders } from "../wholesale/backorder";
import { chatStore } from "../wholesale/chat";
import { inquiryPackings } from "../wholesale/shipment";
import { resetRetailChatMock, retailChatHandlers } from "./chat";

/**
 * loop-08i S2-5 소매 reset `readyPackings`. **소매 핸들러만** 올린다 — 브라우저 소매 worker와 같은 구성이라 도매 주문
 * op가 없다. 그래서 포장은 이 손잡이로만 만든다(기획 §5-4 3). 시계는 `Date`만 T0(2026-10-29 14:20 서울).
 * 기존 `backorderReply.test.ts`(S2-6 회귀)는 손대지 않으려고 파일을 따로 둔다.
 */

const ORIGIN = "http://mock.test";

type SendResult = RetailSchema<"ChatSendResult">;
type ErrorBody = { errors: { field: string; code: string }[] };

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

let keySeq = 0;
async function call<T>(method: string, url: string, json?: unknown) {
  keySeq += 1;
  const res = await fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": `00000000-0000-4000-c000-${String(keySeq).padStart(12, "0")}`,
    },
    body: json === undefined ? undefined : JSON.stringify(json),
  });
  return { status: res.status, body: (await res.json()) as T };
}

const reset = (input: Record<string, unknown> = {}) =>
  call<ErrorBody>("POST", `${ORIGIN}/__mock/chat/reset`, input);

async function send(body = "미송 언제 와요?") {
  const res = await call<{ data: SendResult }>(
    "POST",
    `${ORIGIN}/api/retail/chat/rooms/1/messages`,
    { body, inquiry: null },
  );
  expect(res.status).toBe(201);
  return res.body.data.generatedMessages;
}

function roomOneSize(): number {
  return chatStore.rooms().find((r) => r.roomId === 1)?.messages.length ?? -1;
}

describe("S2-5 reset readyPackings(소매)", () => {
  it("① {noBackorders, readyPackings: [7002]} → [AUTO_REPLY, HANDOFF] '(#7002)', 소매 메시지에 handoff 칸 없음", async () => {
    expect(
      (await reset({ noBackorders: true, readyPackings: [7002] })).status,
    ).toBe(200);
    expect(
      inquiryPackings().map((r) => [r.orderId, r.packingStatus, r.qty]),
    ).toEqual([
      [7004, "PACKED", 3],
      [7002, "READY", 1],
    ]);
    const lines = await send();
    expect(lines.map((m) => m.kind)).toEqual(["AUTO_REPLY", "HANDOFF"]);
    expect(lines[0]?.body).toBe("출고 준비 중인 주문이 있어요(#7002)");
    expect(lines.map((m) => "handoff" in m)).toEqual([false, false]);
  });

  it("② {readyPackings: [7002]}(미송 남김) → 미송 되묻기 [CLARIFY]", async () => {
    await reset({ readyPackings: [7002] });
    expect((await send()).map((m) => m.kind)).toEqual(["CLARIFY"]);
  });

  it("④ [] 과 칸 없음 → 포장은 시드 9100 하나", async () => {
    await reset({ readyPackings: [] });
    expect(inquiryPackings().map((r) => r.packingId)).toEqual([9100]);
    await reset();
    expect(inquiryPackings().map((r) => r.packingId)).toEqual([9100]);
  });

  it.each([
    [[7003], "NOT_PACKABLE"],
    [[7001], "INSUFFICIENT_STOCK"],
    [[9999], "NOT_FOUND"],
    [[7002, 9999], "NOT_FOUND"],
    [[7002, 7002], "DUPLICATE"],
    [[-1], "INVALID"],
    [["7002"], "INVALID"],
  ] as const)(
    "③ %j → 400 %s field readyPackings, 포장 수, 방 1 메시지 수, 미송 수 그대로(reset 안 일어남)",
    async (value, code) => {
      await reset({ noBackorders: true, readyPackings: [7002] });
      await send("안녕하세요");
      const before = {
        packings: inquiryPackings().length,
        room: roomOneSize(),
        backorders: inquiryBackorders().length,
      };
      expect(before.packings).toBe(2);
      const res = await reset({ noBackorders: true, readyPackings: value });
      expect(res.status).toBe(400);
      expect(res.body.errors).toEqual([
        expect.objectContaining({ field: "readyPackings", code }),
      ]);
      expect({
        packings: inquiryPackings().length,
        room: roomOneSize(),
        backorders: inquiryBackorders().length,
      }).toEqual(before);
    },
  );
});
