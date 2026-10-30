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
import type { WholesaleSchema } from "../../wholesale";
import {
  GOLDEN,
  GOLDEN_T0,
  fullInquiry,
  projectMessages,
  visibleExpect,
  type GoldenInquiry,
  type GoldenScenario,
} from "../chat/golden.testkit";
import { QTY_NOTE } from "../chat/inquiry";
import { chatHandlers } from "../wholesale/chat";
import { resetRetailChatMock, retailChatHandlers } from "./chat";

/**
 * 소매 채팅 목의 자동 답 계약(loop-05b S7-6 ~ S7-12, S9-5). `msw/node`로 띄워 실제 HTTP로 부른다.
 *
 * 도매 핸들러와 소매 핸들러를 **한 서버에** 올린다 — 한 프로세스라 저장소(방, 설정)를 같이 쓴다. 그래서
 * 도매 PUT 설정이 소매 보내기에 바로 걸리는지 볼 수 있다(브라우저에선 탭마다 따로라 못 본다, §2-2).
 * `/__mock/chat/*` 손잡이는 도매 것이 먼저 잡는다(배열 앞이 이긴다): `incoming`은 소매 메시지 주입이다.
 *
 * 시계: 30분 규칙을 보려고 `Date`만 가짜로 돌린다. msw `delay`(setTimeout)는 진짜다.
 */

const ORIGIN = "http://mock.test";
const RETAIL = `${ORIGIN}/api/retail/chat`;
const SETTINGS = `${ORIGIN}/api/wholesale/chat/auto-reply-settings`;
const MINUTE = 60_000;

type Message = RetailSchema<"ChatMessage">;
type SendResult = RetailSchema<"ChatSendResult">;
type Settings = WholesaleSchema<"AutoReplySettings">;

const server = setupServer(...chatHandlers, ...retailChatHandlers);
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
function newKey() {
  keySeq += 1;
  return `00000000-0000-4000-9000-${String(keySeq).padStart(12, "0")}`;
}

function send(
  body: string,
  inquiry: GoldenInquiry | null = null,
  key = newKey(),
  roomId = 1,
) {
  return call<{ data: SendResult }>(
    "POST",
    `${RETAIL}/rooms/${roomId}/messages`,
    { body, inquiry: fullInquiry(inquiry) },
    { "Idempotency-Key": key },
  );
}

function knob(path: string, json: unknown) {
  return call<unknown>("POST", `${ORIGIN}/__mock/chat${path}`, json);
}

function enter(listingId: number | null) {
  return call<unknown>("POST", `${RETAIL}/rooms`, {
    wholesalerId: 101,
    listingId,
  });
}

function advance(minutes: number) {
  vi.setSystemTime(Date.now() + minutes * MINUTE);
}

/** 골든셋 시나리오 하나를 방 1에서 HTTP로 돌린다. 단계마다 응답 `generatedMessages`를 투영해 돌려준다 */
async function replay(s: GoldenScenario) {
  // 미송 입고일은 reset 시각 기준 상대값이라 T0에서 reset 한 뒤 시나리오 날짜(afterDays)로 옮긴다
  vi.setSystemTime(GOLDEN_T0);
  resetRetailChatMock();
  advance((s.room.afterDays ?? 0) * 24 * 60);
  await knob("/rooms/1/context", {
    listingId: s.room.context?.listingId ?? null,
    ageMinutes: s.room.context?.ageMinutes ?? 0,
  });
  await knob("/auto-reply", {
    enabled: s.room.autoReply,
    ...(s.room.intents === undefined ? {} : { intents: s.room.intents }),
  });
  const out: { expect: unknown; actual: unknown }[] = [];
  for (const step of s.steps) {
    if (step.afterMinutes !== undefined) advance(step.afterMinutes);
    if (step.enter !== undefined) await enter(step.enter.listingId);
    const nowIso = new Date().toISOString();
    const res = await send(step.text, step.inquiry);
    expect(res.status, `${s.id} ${step.text}`).toBe(201);
    out.push({
      expect: visibleExpect(step.expect),
      actual: projectMessages(res.body.data.generatedMessages, nowIso),
    });
  }
  return out;
}

/** 소매 목의 "나"는 봄봄상회 하나라 HTTP로는 방 1(무드온 101, 봄봄상회) 시나리오만 돌 수 있다 */
const inRoom1 = (s: GoldenScenario) =>
  s.room.wholesalerId === 101 && (s.room.retailerId ?? 1) === 1;

const scenario = (id: string) => {
  const s = GOLDEN.scenarios.find((x) => x.id === id);
  if (s === undefined) throw new Error(`골든셋에 ${id} 없음`);
  return s;
};

async function expectScenario(id: string) {
  for (const step of await replay(scenario(id)))
    expect(step.actual, id).toEqual(step.expect);
}

describe("골든셋을 소매 목 HTTP로 — 판정 함수와 같은 결과", () => {
  it("방 1 시나리오 전 단계(넘김 reason 은 API 칸이 아니라 빼고 본다). 재고 35 + 미송 21", async () => {
    const room1 = GOLDEN.scenarios.filter(inRoom1);
    // 방 1 밖은 대기상회(B04), 가람상회(B05) 둘뿐이다 — 판정 unit 이 받는다
    expect(
      GOLDEN.scenarios.filter((s) => !inRoom1(s)).map((s) => s.id),
    ).toEqual(["B04", "B05"]);
    for (const s of room1) {
      for (const step of await replay(s))
        expect(step.actual, s.id).toEqual(step.expect);
    }
  }, 60_000);
});

describe("S7-6 판정 순서", () => {
  it('inquiry {STOCK, 3002} + 본문 "깎아 주세요" → HANDOFF (H05)', () =>
    expectScenario("H05"));
  it('CLARIFY 뒤 "레드 M이요" → AUTO_REPLY 대상 3002 (P2)', () =>
    expectScenario("P2"));
  it('CLARIFY 뒤 "배송은 언제 돼요" → 계승 안 하고 HANDOFF (H11)', () =>
    expectScenario("H11"));
  it('CLARIFY 31분 뒤 "레드 M" → HANDOFF (H13)', () => expectScenario("H13"));
  it('CLARIFY 뒤 "빨강 M" → 두 번째 CLARIFY 없이 HANDOFF (H12, 맨 문장도)', async () => {
    await expectScenario("H12");
    resetRetailChatMock();
    await send("이 셔츠 몇 장 남았어요?");
    const bare = await send("빨강 M");
    expect(bare.body.data.generatedMessages.map((m) => m.kind)).toEqual([
      "HANDOFF",
    ]);
  });
});

describe("S7-7 대상 경계", () => {
  it("옵션 1개 상품 → 되묻기 없이 AUTO_REPLY (S11)", () =>
    expectScenario("S11"));
  it("게시 옵션 0 → HANDOFF (H10)", () => expectScenario("H10"));
  it("미게시 variant 지정 → HANDOFF (H09)", () => expectScenario("H09"));
  it("도매처 102 상품 variant 를 방 1에서 → HANDOFF (H08)", () =>
    expectScenario("H08"));
  it("답 받은 뒤 같은 상품 재문의 → 새 CLARIFY (S12)", () =>
    expectScenario("S12"));
});

describe("S7-8 수량 한 줄과 재고 0", () => {
  it('"레드 M 10장 되나요" → 본문 끝 수량 한 줄, 소매 facts.stock 칸은 band orderLimit orderable 뿐', async () => {
    const res = await send("레드 M 10장 되나요");
    const [reply] = res.body.data.generatedMessages;
    expect(reply?.kind).toBe("AUTO_REPLY");
    expect(reply?.body.endsWith(QTY_NOTE)).toBe(true);
    expect(Object.keys(reply?.autoReply?.facts.stock ?? {}).sort()).toEqual([
      "band",
      "orderLimit",
      "orderable",
    ]);
  });

  it('"레드 L 몇 장" → [AUTO_REPLY band NONE, HANDOFF]', async () => {
    const res = await send("레드 L 몇 장");
    const generated = res.body.data.generatedMessages;
    expect(generated.map((m) => m.kind)).toEqual(["AUTO_REPLY", "HANDOFF"]);
    expect(generated[0]?.autoReply?.facts.stock?.band).toBe("NONE");
    expect(generated[0]?.body).toBe("레드 L은 지금은 재고가 없어요");
  });
});

describe("S7-9 소매 보내기 흐름", () => {
  it("자유 문장 → 201 DONE, CLARIFY 1개(choices 5), 이어 3002 → AUTO_REPLY 구간, 주문 가능, 한도, label", async () => {
    const first = await send("이 셔츠 몇 장 남았어요?");
    expect(first.status).toBe(201);
    const r1 = first.body.data;
    expect(r1.generation).toBe("DONE");
    expect(r1.generatedMessages).toHaveLength(1);
    const clarify = r1.generatedMessages[0];
    expect(clarify?.kind).toBe("CLARIFY");
    expect(clarify?.sequence).toBe(r1.message.sequence + 1);
    expect(clarify?.sender).toBe("WHOLESALER");
    expect(clarify?.autoReply?.checkedAt).toBe(new Date().toISOString());
    expect(clarify?.autoReply?.replyToSequence).toBe(r1.message.sequence);
    expect(clarify?.autoReply?.choices).toEqual([
      { variantId: 3001, label: "레드 / S", orderable: true },
      { variantId: 3002, label: "레드 / M", orderable: true },
      { variantId: 3003, label: "레드 / L", orderable: true },
      { variantId: 3004, label: "네이비 / S", orderable: true },
      { variantId: 3005, label: "네이비 / M", orderable: true },
    ]);

    const second = await send("레드 / M", {
      intent: "STOCK",
      listingId: 2001,
      variantId: 3002,
    });
    const reply = second.body.data.generatedMessages[0];
    expect(reply?.kind).toBe("AUTO_REPLY");
    expect(reply?.autoReply?.facts.stock).toEqual({
      band: "UNDER_50",
      orderable: true,
      orderLimit: 500,
    });
    expect(reply?.autoReply?.subject.label).toBe("빈티지 플라워 셔츠 레드 / M");
    expect(reply?.autoReply?.choices).toBeNull();
    expect(reply?.body).toBe(
      "레드 M은 10~49장 있어요. 지금 주문할 수 있어요(한 번에 최대 500장)",
    );
  });
});

describe("S7-10 멱등과 조회 시각", () => {
  it("같은 키 같은 본문 → 200, 자동 답 id sequence checkedAt 처음과 같고 maxSequence 그대로. 새 키 → 새 checkedAt", async () => {
    const key = newKey();
    const first = await send("레드 M 몇 장 있어요?", null, key);
    expect(first.status).toBe(201);
    const before = await call<{ meta: { maxSequence: number } }>(
      "GET",
      `${RETAIL}/rooms/1/messages`,
    );

    advance(1);
    const again = await send("레드 M 몇 장 있어요?", null, key);
    expect(again.status).toBe(200);
    const pick = (r: SendResult) =>
      r.generatedMessages.map((m) => [
        m.id,
        m.sequence,
        m.autoReply?.checkedAt,
      ]);
    expect(pick(again.body.data)).toEqual(pick(first.body.data));
    const after = await call<{ meta: { maxSequence: number } }>(
      "GET",
      `${RETAIL}/rooms/1/messages`,
    );
    expect(after.body.meta.maxSequence).toBe(before.body.meta.maxSequence);

    const fresh = await send("레드 M 몇 장 있어요?");
    expect(fresh.status).toBe(201);
    expect(fresh.body.data.generatedMessages[0]?.autoReply?.checkedAt).not.toBe(
      first.body.data.generatedMessages[0]?.autoReply?.checkedAt,
    );
  });
});

describe("S7-11 정확 수량 누출 검사(소매 응답 전부)", () => {
  it("send, messages, 방 목록 preview, 방 머리, subject.label, body 에 availableQty 키 0개, 시드 정확 수량 글자 0개", async () => {
    const texts: string[] = [];
    const sends = [
      ["이 셔츠 몇 장 남았어요?", null],
      ["레드 / S", { intent: "STOCK", listingId: 2001, variantId: 3001 }],
      ["레드 M 있어요?", null],
      ["네이비 S 수량 알려주세요", null],
      ["네이비 M 재고 있나요?", null],
    ] as const;
    let autoReplies = 0;
    for (const [body, inquiry] of sends) {
      const res = await send(body, inquiry);
      texts.push(res.text);
      autoReplies += res.body.data.generatedMessages.filter(
        (m) => m.kind === "AUTO_REPLY" && m.autoReply?.facts.stock !== null,
      ).length;
    }
    // 빈 검사 방지: 재고 자동 답이 실제로 나갔을 때만 통과다
    expect(autoReplies).toBe(4);

    const messages = await call<{ data: Message[] }>(
      "GET",
      `${RETAIL}/rooms/1/messages?size=100`,
    );
    texts.push(messages.text);
    texts.push((await call("GET", `${RETAIL}/rooms`)).text);
    texts.push((await call("GET", `${RETAIL}/rooms/1`)).text);
    // 방 목록의 preview 가 자동 답 본문인 순간도 잰다(마지막 메시지 = 자동 답)
    const rooms = await call<{
      data: { roomId: number; lastMessage: { kind: string } | null }[];
    }>("GET", `${RETAIL}/rooms`);
    expect(rooms.body.data.find((r) => r.roomId === 1)?.lastMessage?.kind).toBe(
      "AUTO_REPLY",
    );

    const all = texts.join("\n");
    expect(all).not.toContain("availableQty");
    for (const exact of ["40장", "35장", "20장", "18장"])
      expect(all).not.toContain(exact);
    // label 과 body 를 실제로 봤는지 — 구간 글자는 있어야 한다
    expect(all).toContain("빈티지 플라워 셔츠 레드 / S");
    expect(all).toContain("10~49장");
  });
});

describe("S7-12 방 문맥 갱신", () => {
  it("31분 지난 문맥은 넘김, 이미 있는 방에 createChatRoom {2001} → 200 + 문맥 새로, listingId null → 문맥 없음", async () => {
    await knob("/rooms/1/context", { listingId: 2001, ageMinutes: 31 });
    const stale = await send("레드 S 몇 장 남았어요?");
    expect(stale.body.data.generatedMessages.map((m) => m.kind)).toEqual([
      "HANDOFF",
    ]);

    const reenter = await enter(2001);
    expect(reenter.status).toBe(200);
    // 넘김이 열려 있어도 재고 답은 붙는다
    const fresh = await send("레드 S 몇 장 남았어요?");
    expect(fresh.body.data.generatedMessages[0]?.kind).toBe("AUTO_REPLY");
    expect(
      fresh.body.data.generatedMessages[0]?.autoReply?.subject.variantId,
    ).toBe(3001);

    // 사장 답으로 넘김을 닫아 둬야 다음 넘김 줄이 보인다(열린 넘김엔 줄을 또 넣지 않는다)
    await call(
      "POST",
      `${ORIGIN}/api/wholesale/chat/rooms/1/messages`,
      {
        body: "네 확인해 드릴게요",
        inquiry: null,
      },
      { "Idempotency-Key": newKey() },
    );
    const cleared = await enter(null);
    expect(cleared.status).toBe(200);
    const none = await send("레드 S 몇 장 남았어요?");
    expect(none.body.data.generatedMessages.map((m) => m.kind)).toEqual([
      "HANDOFF",
    ]);
  });

  it("열린 넘김이 있으면 넘김 줄을 또 넣지 않는다(generation NONE)", async () => {
    const first = await send("배송 언제 돼요");
    expect(first.body.data.generatedMessages.map((m) => m.kind)).toEqual([
      "HANDOFF",
    ]);
    const second = await send("확인 부탁드려요");
    expect(second.body.data.generatedMessages).toEqual([]);
    expect(second.body.data.generation).toBe("NONE");
  });

  it("열린 넘김이 있어도 재고 0 답의 넘김 줄은 붙는다(D34, 결정 27, codex-meta M2)", async () => {
    await enter(2001);
    const ask = await send("할인해 주세요");
    expect(ask.body.data.generatedMessages.map((m) => m.kind)).toEqual([
      "HANDOFF",
    ]);
    const zero = await send("레드 L 몇 장 있어요");
    const lines = zero.body.data.generatedMessages;
    expect(lines.map((m) => m.kind)).toEqual(["AUTO_REPLY", "HANDOFF"]);
    expect(lines[0]?.autoReply?.subject.variantId).toBe(3003);
    expect(lines[0]?.autoReply?.facts.stock?.band).toBe("NONE");
    // 재고가 있는 답은 그대로 넘김 줄 없이(열린 넘김 억제 유지)
    const some = await send("레드 S 몇 장 있어요");
    expect(some.body.data.generatedMessages.map((m) => m.kind)).toEqual([
      "AUTO_REPLY",
    ]);
  });
});

describe("S9-5 자동 답 설정 왕복(도매 op → 소매 보내기)", () => {
  const ALL_ON: Settings = {
    enabled: true,
    intents: { STOCK: true, BACKORDER: true, RECEIVABLE: true },
  };

  it("GET 기본값 전부 true", async () => {
    const res = await call<{ data: Settings }>("GET", SETTINGS);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual(ALL_ON);
  });

  it("PUT enabled false → 200 저장값, 소매 재고 문장 → HANDOFF 1개", async () => {
    const off = { ...ALL_ON, enabled: false };
    const put = await call<{ data: Settings }>("PUT", SETTINGS, off);
    expect(put.status).toBe(200);
    expect(put.body.data).toEqual(off);
    expect((await call<{ data: Settings }>("GET", SETTINGS)).body.data).toEqual(
      off,
    );
    const res = await send("레드 M 몇 장 있어요?");
    expect(res.body.data.generatedMessages.map((m) => m.kind)).toEqual([
      "HANDOFF",
    ]);
  });

  it("intents.STOCK 만 false → 재고 HANDOFF, 다시 켜면 AUTO_REPLY", async () => {
    await call("PUT", SETTINGS, {
      enabled: true,
      intents: { STOCK: false, BACKORDER: true, RECEIVABLE: true },
    });
    const res = await send("레드 M 몇 장 있어요?");
    expect(res.body.data.generatedMessages.map((m) => m.kind)).toEqual([
      "HANDOFF",
    ]);
    await call("PUT", SETTINGS, ALL_ON);
    await call(
      "POST",
      `${ORIGIN}/api/wholesale/chat/rooms/1/messages`,
      {
        body: "네",
        inquiry: null,
      },
      { "Idempotency-Key": newKey() },
    );
    const on = await send("레드 M 몇 장 있어요?");
    expect(on.body.data.generatedMessages[0]?.kind).toBe("AUTO_REPLY");
  });

  it("PUT 본문에 intents 빠짐 → 400 errors[{field: intents}], 불린 아님 → 그 칸, 값은 안 바뀐다", async () => {
    const missing = await call<{ code: string; errors: { field: string }[] }>(
      "PUT",
      SETTINGS,
      { enabled: false },
    );
    expect(missing.status).toBe(400);
    expect(missing.body.code).toBe("VALIDATION_FAILED");
    expect(missing.body.errors.map((e) => e.field)).toEqual(["intents"]);

    const wrong = await call<{ errors: { field: string }[] }>("PUT", SETTINGS, {
      enabled: "no",
      intents: { STOCK: true, BACKORDER: 1, RECEIVABLE: true },
    });
    expect(wrong.body.errors.map((e) => e.field)).toEqual([
      "enabled",
      "intents.BACKORDER",
    ]);
    expect((await call<{ data: Settings }>("GET", SETTINGS)).body.data).toEqual(
      ALL_ON,
    );
  });

  it("실패 손잡이 {op: settings, status: 500} → 다음 PUT 500, 그다음은 200", async () => {
    await knob("/fail", { op: "settings", status: 500 });
    const failed = await call("PUT", SETTINGS, { ...ALL_ON, enabled: false });
    expect(failed.status).toBe(500);
    expect((await call<{ data: Settings }>("GET", SETTINGS)).body.data).toEqual(
      ALL_ON,
    );
    const ok = await call("PUT", SETTINGS, { ...ALL_ON, enabled: false });
    expect(ok.status).toBe(200);
  });

  it("도매 incoming {contextListingId: 2001} → 자동 답(도매 facts 는 정확 수량), 끈 뒤 같은 주입 → HANDOFF 만", async () => {
    type Created = { data: WholesaleSchema<"ChatMessage">[] };
    const on = await knob("/rooms/1/incoming", {
      body: "레드 M 몇 장 있어요",
      contextListingId: 2001,
    });
    const created = (on.body as Created).data;
    expect(created.map((m) => m.kind)).toEqual(["TEXT", "AUTO_REPLY"]);
    expect(created[1]?.autoReply?.facts.stock).toEqual({
      availableQty: 35,
      band: "UNDER_50",
      orderLimit: 500,
    });

    await call("PUT", SETTINGS, { ...ALL_ON, enabled: false });
    const off = await knob("/rooms/1/incoming", {
      body: "레드 M 몇 장 있어요",
      contextListingId: 2001,
    });
    expect((off.body as Created).data.map((m) => m.kind)).toEqual([
      "TEXT",
      "HANDOFF",
    ]);
  });

  it("incoming 에 contextListingId 가 없으면 예전처럼 메시지만 넣는다(loop-04 e2e 보호)", async () => {
    const res = await knob("/rooms/1/incoming", {
      body: "레드 M 몇 장 있어요",
    });
    expect(
      (res.body as { data: { kind: string }[] }).data.map((m) => m.kind),
    ).toEqual(["TEXT"]);
  });
});
