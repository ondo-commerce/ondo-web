import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  assertStubServers,
  bodyOf,
  chatMock,
  linesAfter,
  log,
  messageBySequence,
  openRoomById,
  orderGroups,
  say,
  start,
  T0,
  waitLinesAfter,
} from "../loop-07-receivable-reply/helpers";

/**
 * loop-08i QA(소매, `pnpm e2e:stub`). 개발 spec(`retail-chat-packing.spec.ts`)과 다른 길로 S2-9를 본다:
 * 질문 글 "주문한 거 언제 와요?", 390에서 `document.scrollingElement` 가로 넘침, reset 실패 400 넷 뒤 상태 보존,
 * `readyPackings`만 주면(미송 남김) 되묻기(S2-5 ②).
 *
 * 시계: 07 `start`가 T0(2026-10-29 14:20 서울)에 reset 전에 고정한다. 판정 전 페이지 시계가 T0 + 30분 안인지 단언한다.
 * `QA_SHOTS=1`이면 보고용 png를 `runs/loop-08i-chat-packing/qa/`에도 남긴다(상대 경로, 저장소 루트 기준).
 */

assertStubServers();

const ASK_ORDER = "주문한 거 언제 와요?";
const ASK = "미송 언제 와요?";
const BODY = "출고 준비 중인 주문이 있어요(#7002)";

interface SendRecord {
  status: number;
  generatedMessages: { kind: string; [key: string]: unknown }[];
}

/** 보내기 POST 응답을 쌓는다(목이 페이지 안이라 `context().route`로 못 잡는다). `page.goto` 전에 건다 */
async function recordSends(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const sends: unknown[] = [];
    (window as unknown as { __qaSends: unknown[] }).__qaSends = sends;
    const original = window.fetch.bind(window);
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const response = await original(input, init);
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input.url;
      const method =
        init?.method ?? (input instanceof Request ? input.method : "GET");
      if (
        method.toUpperCase() === "POST" &&
        /\/api\/retail\/chat\/rooms\/\d+\/messages$/.test(url)
      ) {
        const json = (await response
          .clone()
          .json()
          .catch(() => null)) as {
          data?: { generatedMessages?: unknown[] };
        } | null;
        sends.push({
          status: response.status,
          generatedMessages: json?.data?.generatedMessages ?? [],
        });
      }
      return response;
    };
  });
}

async function sendAt(page: Page, n: number): Promise<SendRecord> {
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as unknown as { __qaSends: unknown[] }).__qaSends.length,
      ),
    )
    .toBeGreaterThanOrEqual(n);
  const all = await page.evaluate(
    () => (window as unknown as { __qaSends: SendRecord[] }).__qaSends,
  );
  const one = all[n - 1];
  if (one === undefined) throw new Error(`보내기 ${n}번째 없음`);
  return one;
}

async function expectClockNearT0(page: Page): Promise<void> {
  const now = await page.evaluate(() => Date.now());
  expect(now).toBeGreaterThanOrEqual(T0.getTime());
  expect(now - T0.getTime()).toBeLessThan(30 * 60_000);
}

async function shot(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: test.info().outputPath(`${name}.png`) });
  if (process.env.QA_SHOTS === "1")
    await page.screenshot({
      path: `.claude/harness/runs/loop-08i-chat-packing/qa/2026-11-07-${name}.png`,
    });
}

async function rawReset(
  page: Page,
  body: Record<string, unknown>,
): Promise<{ status: number; text: string }> {
  return page.evaluate(async (body) => {
    const r = await fetch("/__mock/chat/reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return { status: r.status, text: await r.text() };
  }, body);
}

/** 포장 답 말풍선 하나를 단언하고 돌려준다: 본문, 자동 답변 표시, 카드, 링크, 버튼 0, 바로 아래 넘김 줄 */
async function expectPackingReply(
  page: Page,
  question: string,
  nthSend: number,
): Promise<Locator> {
  const sent = await sendAt(page, nthSend);
  expect(sent.status).toBe(201);
  expect(sent.generatedMessages.map((m) => m.kind)).toEqual([
    "AUTO_REPLY",
    "HANDOFF",
  ]);
  expect(sent.generatedMessages.some((m) => "handoff" in m)).toBe(false);
  const after = await waitLinesAfter(page, question, 2);
  expect(after.slice(0, 2).map((l) => l.kind)).toEqual([
    "AUTO_REPLY",
    "HANDOFF",
  ]);
  const reply = messageBySequence(page, after[0]?.sequence ?? -1);
  await expect(bodyOf(reply)).toHaveText(BODY);
  await expect(reply.getByText("자동 답변", { exact: true })).toHaveCount(1);
  await expect(reply.locator("[data-seen]")).toHaveText(/^14:[2-4]\d 조회$/);
  await expect(reply.locator('[data-ac~="S3-3"]')).toHaveCount(0);
  await expect(reply.locator("[data-receivable-card]")).toHaveCount(0);
  await expect(reply.getByRole("link")).toHaveCount(0);
  await expect(reply.getByRole("button")).toHaveCount(0);
  const next = await reply.evaluate((el) => {
    const s = el.nextElementSibling as HTMLElement | null;
    return { kind: s?.dataset.kind ?? null, text: s?.textContent ?? "" };
  });
  expect(next.kind).toBe("HANDOFF");
  expect(next.text).toContain("사장님께 전달했어요");
  return reply;
}

async function openWithPacking(page: Page): Promise<void> {
  await recordSends(page);
  await start(page, "/");
  await chatMock(page, "reset", { noBackorders: true, readyPackings: [7002] });
  await openRoomById(page, 1);
  await expectClockNearT0(page);
}

test("S2-9 1280×800 '주문한 거 언제 와요?' → 포장 답, 카드 0 링크 0 버튼 0, 바로 아래 '사장님께 전달했어요'", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openWithPacking(page);
  await say(page, ASK_ORDER);
  const reply = await expectPackingReply(page, ASK_ORDER, 1);
  await reply.scrollIntoViewIfNeeded();
  await shot(page, "S2-9-retail-1280");
});

test("S2-9 390×844 같은 답: scrollingElement 가로 넘침 0, 본문이 말풍선 안", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openWithPacking(page);
  await say(page, ASK_ORDER);
  const reply = await expectPackingReply(page, ASK_ORDER, 1);
  const g = await bodyOf(reply).evaluate((el) => {
    const s = document.scrollingElement ?? document.documentElement;
    const b = el.getBoundingClientRect();
    const o = (el.parentElement as HTMLElement).getBoundingClientRect();
    return {
      scrollWidth: s.scrollWidth,
      clientWidth: s.clientWidth,
      inside:
        b.left >= o.left - 0.5 &&
        b.right <= o.right + 0.5 &&
        b.bottom <= o.bottom + 0.5,
      bodyRight: b.right,
    };
  });
  expect(g.scrollWidth).toBeLessThanOrEqual(g.clientWidth);
  expect(g.inside).toBe(true);
  expect(g.bodyRight).toBeLessThanOrEqual(390);
  await reply.scrollIntoViewIfNeeded();
  await shot(page, "S2-9-retail-390");
});

test("S2-5 ③ 소매 reset 실패 400 넷 뒤 상태 그대로: 다음 질문도 포장 답 + 넘김", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openWithPacking(page);
  await say(page, ASK_ORDER);
  await expectPackingReply(page, ASK_ORDER, 1);

  const cases: [unknown, string][] = [
    [[9999], "NOT_FOUND"],
    [[7002, 7002], "DUPLICATE"],
    [[7003], "NOT_PACKABLE"],
    [[7001], "INSUFFICIENT_STOCK"],
  ];
  for (const [value, code] of cases) {
    const r = await rawReset(page, { readyPackings: value });
    expect(r.status, JSON.stringify(value)).toBe(400);
    expect(r.text).toContain('"field":"readyPackings"');
    expect(r.text).toContain(`"code":"${code}"`);
  }
  // reset이 일어났다면 방 1은 기본 시드(미송 있음)라 되묻기가 나온다
  await expectClockNearT0(page);
  await say(page, ASK);
  await expectPackingReply(page, ASK, 2);
  await expect(orderGroups(page)).toHaveCount(0);
});

test("S2-5 ② 소매 reset {readyPackings: [7002]}만(미송 남김) → '미송 언제 와요?' 되묻기, 포장 답 0", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await recordSends(page);
  await start(page, "/");
  await chatMock(page, "reset", { readyPackings: [7002] });
  await openRoomById(page, 1);
  await expectClockNearT0(page);
  await say(page, ASK);
  const sent = await sendAt(page, 1);
  expect(sent.generatedMessages.map((m) => m.kind)).toEqual(["CLARIFY"]);
  await expect(orderGroups(page)).toHaveCount(1);
  expect((await linesAfter(page, ASK)).some((l) => l.text.includes(BODY))).toBe(
    false,
  );
  await expect(log(page).getByText(BODY, { exact: true })).toHaveCount(0);
});
