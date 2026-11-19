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
import { resetRetailChatMock, retailChatHandlers } from "./chat";

/**
 * loop-08k S1-11 소매 reset `readyPackings`가 만든 7002 포장도 9002를 줄여, 소매 "미송 언제 와요?" 보기에서 #7002가
 * 빠지는지 본다. 소매 핸들러만 올린다(브라우저 소매 worker와 같은 구성, 08i `chatPacking.test.ts`와 같다). 08i 파일은
 * 회귀라 손대지 않으려고 따로 둔다. 시계는 `Date`만 T0(2026-10-29 14:20 서울)
 */

const ORIGIN = "http://mock.test";

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

let keySeq = 0;
async function call<T>(method: string, url: string, json?: unknown) {
  keySeq += 1;
  const res = await fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": `00000000-0000-4000-c008-${String(keySeq).padStart(12, "0")}`,
    },
    body: json === undefined ? undefined : JSON.stringify(json),
  });
  return { status: res.status, body: (await res.json()) as T };
}

describe("S1-11 소매 reset readyPackings", () => {
  it("{readyPackings: [7002]} → 소매 '미송 언제 와요?' → [CLARIFY], 보기 [L1, L6, L3(2)](#7002 없음)", async () => {
    const reset = await call("POST", `${ORIGIN}/__mock/chat/reset`, {
      readyPackings: [7002],
    });
    expect(reset.status).toBe(200);
    const res = await call<{ data: SendResult }>(
      "POST",
      `${ORIGIN}/api/retail/chat/rooms/1/messages`,
      { body: "미송 언제 와요?", inquiry: null },
    );
    expect(res.status).toBe(201);
    const lines = res.body.data.generatedMessages;
    expect(lines.map((m) => m.kind)).toEqual(["CLARIFY"]);
    const labels = (lines[0]?.autoReply?.choices ?? [])
      .filter((c) => c.kind === "BACKORDER")
      .map((c) => c.label);
    expect(labels).toEqual([
      "빈티지 플라워 셔츠 레드/L, 남은 4장, 9/4 주문 #7001",
      "빈티지 플라워 셔츠 레드/L, 남은 2장, 9/6 주문 #7006",
      "린넨 셋업 자켓 베이지/L, 남은 2장, 9/7 주문 #7003",
    ]);
    expect(labels.filter((l) => l?.includes("#7002"))).toEqual([]);
  });
});
