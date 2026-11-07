import { expect, test, type Page } from "@playwright/test";
import {
  ask,
  bubbleOf,
  confirmOrder,
  createOutbound,
  createPacking,
  kindsAfter,
  log,
  nextKind,
  openRoomOne,
  PACKING_ONE,
  shipOutbound,
  T0,
  type Line,
} from "./helpers";

/**
 * loop-08i QA(도매 1280×800). 개발 spec(`wholesale-chat-packing.spec.ts`)과 다른 길로 같은 AC를 본다:
 * 질문 글을 "주문한 거 언제 와요?"로, 출고 뒤 재질문과 사장 답, 일부 출고, 대상 말함, 4건 "외 k건",
 * reset 실패 400의 상태 보존, 08f 전체 꺼짐.
 *
 * 시계: `openRoomOne`이 T0(2026-10-29 14:20 서울)에 reset 전에 고정한다. 시간 조건(되묻기 30분, 조회 시각)이 걸리는
 * 단언 앞에서 페이지 시계가 T0 + 30분 안인지 먼저 단언한다(01-plan §6 규칙 6).
 * `QA_SHOTS=1`이면 보고용 png를 `runs/loop-08i-chat-packing/qa/`에도 남긴다(상대 경로, 저장소 루트 기준).
 */

test.use({ viewport: { width: 1280, height: 800 } });

const ASK_ORDER = "주문한 거 언제 와요?";
const REASON_NEXT = "열린 미송이 없어요. 언제 받을 수 있는지 알려 주세요";
const REASON_OLD = "열린 미송이 없는 소매처예요";
const kinds = (lines: readonly Line[]) => lines.map((m) => m.kind);

async function shot(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: test.info().outputPath(`${name}.png`) });
  if (process.env.QA_SHOTS === "1")
    await page.screenshot({
      path: `.claude/harness/runs/loop-08i-chat-packing/qa/2026-11-07-${name}.png`,
    });
}

/** 페이지 시계가 T0 ~ T0 + 30분 안(되묻기 계승, 14:20 조회 단언의 전제) */
async function expectClockNearT0(page: Page): Promise<void> {
  const now = await page.evaluate(() => Date.now());
  expect(now).toBeGreaterThanOrEqual(T0.getTime());
  expect(now - T0.getTime()).toBeLessThan(30 * 60_000);
}

async function pageFetch(
  page: Page,
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; json: unknown }> {
  return page.evaluate(
    async ({ method, path, body }) => {
      const r = await fetch(path, {
        method,
        headers: { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const text = await r.text();
      return { status: r.status, json: text === "" ? null : JSON.parse(text) };
    },
    { method, path, body },
  );
}

/** 방 1 마지막 sequence(서버 목 기준). reset이 일어나면 시드 값으로 돌아간다 */
async function roomOneCount(page: Page): Promise<number> {
  const { status, json } = await pageFetch(
    page,
    "GET",
    "/api/wholesale/chat/rooms/1/messages",
  );
  expect(status).toBe(200);
  return (json as { meta: { maxSequence: number } }).meta.maxSequence;
}

/** 도매 사장이 입력창으로 보내고, 서버 sequence가 붙을 때까지 */
async function ownerSays(page: Page, text: string): Promise<void> {
  const box = page.getByRole("textbox", { name: "메시지", exact: true });
  await box.fill(text);
  await box.press("Enter");
  await expect(
    log(page)
      .locator('[data-sequence][data-kind="TEXT"]')
      .filter({ hasText: text }),
  ).toHaveCount(1);
}

test("S2-7 S3-2 '주문한 거 언제 와요?' → 자동 답 '(#7002)' 바로 아래 넘김 줄 + 새 이유 줄", async ({
  page,
}) => {
  await openRoomOne(page);
  await createPacking(page, 7002, 8002, 1);
  await expectClockNearT0(page);
  const { question, lines } = await ask(page, ASK_ORDER);
  expect(kinds(lines)).toEqual(["AUTO_REPLY", "HANDOFF"]);
  expect(lines[0]?.body).toBe(PACKING_ONE);
  const reply = bubbleOf(page, lines[0]?.sequence ?? -1);
  await expect(reply.getByText(PACKING_ONE, { exact: true })).toHaveCount(1);
  await expect(reply.locator('[data-ac="S7-13 S3-5"]')).toHaveText(
    "14:20 조회",
  );
  expect(await nextKind(reply)).toBe("HANDOFF");
  const note = reply.locator("xpath=following-sibling::*[1]");
  await expect(note).toHaveAttribute("role", "note");
  await expect(note).toHaveAttribute("data-reason", "NO_BACKORDER");
  await expect(note.locator("[data-reason-text]")).toHaveText(REASON_NEXT);
  await expect(log(page).getByText(REASON_OLD, { exact: true })).toHaveCount(0);
  await expect
    .poll(() => kindsAfter(page, question.sequence))
    .toEqual(["AUTO_REPLY", "HANDOFF"]);
  await reply.scrollIntoViewIfNeeded();
  await shot(page, "S2-7-S3-2-wholesale-1280");
});

test("S2-8 출고 뒤 재질문: 포장 → 봉투 → 출고 → 질문 [HANDOFF] → 또 질문 []", async ({
  page,
}) => {
  await openRoomOne(page);
  const packing = await createPacking(page, 7002, 8002, 1);
  const outbound = await createOutbound(page, packing.itemIds);
  const packed = await ask(page, ASK_ORDER);
  expect(kinds(packed.lines)).toEqual(["AUTO_REPLY", "HANDOFF"]);
  await shipOutbound(page, outbound);
  // 출고 뒤 첫 질문은 열린 같은 이유 넘김(위 답 + 넘김)이 있어 [] 이다(§4-1 5)
  const afterShip = await ask(page, ASK_ORDER);
  expect(kinds(afterShip.lines)).toEqual([]);
  const again = await ask(page, ASK_ORDER);
  expect(kinds(again.lines)).toEqual([]);
  await expect
    .poll(() => kindsAfter(page, again.question.sequence))
    .toEqual([]);
  // 사장이 답하면 넘김이 닫혀 다음 질문은 [HANDOFF]
  await ownerSays(page, "내일 보내 드려요");
  const afterOwner = await ask(page, ASK_ORDER);
  expect(kinds(afterOwner.lines)).toEqual(["HANDOFF"]);
  expect(afterOwner.lines[0]?.handoff?.reason).toBe("NO_BACKORDER");
  await expect
    .poll(() => kindsAfter(page, afterOwner.question.sequence))
    .toEqual(["HANDOFF"]);
});

test("S2-8 포장 없이 바로 출고된 뒤 첫 질문 [HANDOFF], 사장 답 없이 또 질문 []", async ({
  page,
}) => {
  await openRoomOne(page);
  const packing = await createPacking(page, 7002, 8002, 1);
  const outbound = await createOutbound(page, packing.itemIds);
  await shipOutbound(page, outbound);
  const first = await ask(page, ASK_ORDER);
  expect(kinds(first.lines)).toEqual(["HANDOFF"]);
  const second = await ask(page, ASK_ORDER);
  expect(kinds(second.lines)).toEqual([]);
  await expect
    .poll(() => kindsAfter(page, second.question.sequence))
    .toEqual([]);
});

test("S2-8 수량 2 일부 출고: 7003 확정 1 + 추가 포장 1, A만 출고 → 남은 READY로 '(#7003)' 1건", async ({
  page,
}) => {
  await openRoomOne(page);
  const a = await confirmOrder(page, 7003, 8003, 1);
  const b = await createPacking(page, 7003, 8003, 1);
  expect(b.itemIds).toHaveLength(1);
  const outbound = await createOutbound(page, a);
  await shipOutbound(page, outbound);
  const { lines } = await ask(page, ASK_ORDER);
  expect(kinds(lines)).toEqual(["AUTO_REPLY", "HANDOFF"]);
  expect(lines[0]?.body).toBe("출고 준비 중인 주문이 있어요(#7003)");
  await expect(
    bubbleOf(page, lines[0]?.sequence ?? -1).getByText(
      "출고 준비 중인 주문이 있어요(#7003)",
      { exact: true },
    ),
  ).toHaveCount(1);
});

for (const said of [
  "빨강 언제 와요?",
  "10장 언제 와요?",
  "M 사이즈 언제 와요?",
])
  test(`S2-8 대상 말함 '${said}' + 포장 READY → 넘김만, 자동 답 0`, async ({
    page,
  }) => {
    await openRoomOne(page);
    await createPacking(page, 7002, 8002, 1);
    const { question, lines } = await ask(page, said);
    expect(kinds(lines)).toEqual(["HANDOFF"]);
    expect(lines[0]?.handoff).toMatchObject({
      reason: "NO_BACKORDER",
      intent: "BACKORDER",
    });
    await expect
      .poll(() => kindsAfter(page, question.sequence))
      .toEqual(["HANDOFF"]);
    await expect(log(page).getByText(PACKING_ONE, { exact: true })).toHaveCount(
      0,
    );
  });

test("S1-2 화면: 4건이면 '외 1건' — 새 주문 3건 확정 + 7002 포장", async ({
  page,
}) => {
  await openRoomOne(page);
  await createPacking(page, 7002, 8002, 1);
  const made: number[] = [];
  for (let i = 0; i < 3; i += 1) {
    const { status, json } = await pageFetch(
      page,
      "POST",
      "/__mock/notifications/incoming",
      { type: "NEW_ORDER" },
    );
    expect(status, "새 주문 손잡이").toBe(201);
    const orderId = (json as { data: { orderId: number } }).data.orderId;
    const detail = await pageFetch(
      page,
      "GET",
      `/api/wholesale/orders/${orderId}`,
    );
    const itemId = (detail.json as { data: { items: { id: number }[] } }).data
      .items[0]?.id;
    if (itemId === undefined) throw new Error("새 주문 줄 없음");
    await confirmOrder(page, orderId, itemId, 1);
    made.push(orderId);
  }
  const ids = [7002, ...made].sort((x, y) => x - y);
  expect(ids).toHaveLength(4);
  // unit S1-2 기대(#7101~#7104 → "…4건이 있어요(#7101, #7102, #7103 외 1건)")와 같은 꼴을 실제 번호로
  const expected = `출고 준비 중인 주문 4건이 있어요(#${ids[0]}, #${ids[1]}, #${ids[2]} 외 1건)`;
  const { lines } = await ask(page, ASK_ORDER);
  expect(kinds(lines)).toEqual(["AUTO_REPLY", "HANDOFF"]);
  expect(lines[0]?.body).toBe(expected);
  const reply = bubbleOf(page, lines[0]?.sequence ?? -1);
  await expect(reply.getByText(expected, { exact: true })).toHaveCount(1);
  await reply.scrollIntoViewIfNeeded();
  await shot(page, "S1-2-four-orders-wholesale-1280");
});

test("S2-5 ③ reset 실패 400 넷 뒤 상태 그대로: 포장 남고, 미송 0 그대로, 메시지 수 그대로", async ({
  page,
}) => {
  await openRoomOne(page);
  await createPacking(page, 7002, 8002, 1);
  const first = await ask(page, ASK_ORDER);
  expect(kinds(first.lines)).toEqual(["AUTO_REPLY", "HANDOFF"]);
  const before = await roomOneCount(page);

  const cases: [unknown, string][] = [
    [[9999], "NOT_FOUND"],
    [[7002, 7002], "DUPLICATE"],
    [[7003], "NOT_PACKABLE"],
    [[7001], "INSUFFICIENT_STOCK"],
  ];
  for (const [value, code] of cases) {
    const r = await pageFetch(page, "POST", "/__mock/chat/reset", {
      readyPackings: value,
    });
    expect(r.status, JSON.stringify(value)).toBe(400);
    expect(JSON.stringify(r.json)).toContain('"field":"readyPackings"');
    expect(JSON.stringify(r.json)).toContain(`"code":"${code}"`);
  }

  expect(await roomOneCount(page)).toBe(before);
  const queue = await pageFetch(
    page,
    "GET",
    "/api/wholesale/orders/7002/packings",
  );
  expect((queue.json as { data: unknown[] }).data).toHaveLength(1);
  // reset이 일어났다면 기본 시드(미송 있음)라 되묻기가 나온다. 그대로면 답 + 넘김
  await expectClockNearT0(page);
  const again = await ask(page, ASK_ORDER);
  expect(kinds(again.lines)).toEqual(["AUTO_REPLY", "HANDOFF"]);
  expect(again.lines[0]?.body).toBe(PACKING_ONE);
});

test("08f 회귀: 자동 답 전체 꺼짐 + 포장 READY → [HANDOFF] OFF, intent BACKORDER, 자동 답 0", async ({
  page,
}) => {
  await openRoomOne(page);
  await createPacking(page, 7002, 8002, 1);
  const put = await pageFetch(
    page,
    "PUT",
    "/api/wholesale/chat/auto-reply-settings",
    {
      enabled: false,
      intents: { STOCK: true, BACKORDER: true, RECEIVABLE: true },
    },
  );
  expect(put.status).toBe(200);
  const { question, lines } = await ask(page, ASK_ORDER);
  expect(kinds(lines)).toEqual(["HANDOFF"]);
  expect(lines[0]?.handoff).toMatchObject({
    reason: "OFF",
    intent: "BACKORDER",
  });
  await expect
    .poll(() => kindsAfter(page, question.sequence))
    .toEqual(["HANDOFF"]);
  await expect(log(page).getByText(PACKING_ONE, { exact: true })).toHaveCount(
    0,
  );
});
