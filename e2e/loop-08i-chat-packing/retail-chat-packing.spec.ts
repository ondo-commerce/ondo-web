import { expect, test, type Page } from "@playwright/test";
import {
  assertStubServers,
  bodyOf,
  chatMock,
  linesAfter,
  log,
  messageBySequence,
  openRoomById,
  say,
  start,
  waitLinesAfter,
} from "../loop-07-receivable-reply/helpers";

/**
 * #391 S2-9 소매 화면에서 본 포장 답(loop-08i 01-plan §4-3, §6). `pnpm e2e:stub`(`playwright.stub.config.ts`)으로 돈다.
 *
 * 소매 worker엔 도매 주문 op가 없다(채팅, 알림 핸들러만). 그래서 포장은 reset 손잡이로 만든다:
 * `{noBackorders: true, readyPackings: [7002]}` — 미송 0 + 주문 #7002 READY 포장 1. 시계는 07 `start`가 T0
 * (2026-10-29 14:20 서울)에 reset 전에 고정한다.
 *
 * 보내기 응답은 fetch를 감싸 받는다(목이 페이지 안에서 답해 `context().route`로 못 잡는다).
 */

assertStubServers();

const ASK = "미송 언제 와요?";
const BODY = "출고 준비 중인 주문이 있어요(#7002)";

interface SentMessage {
  kind: string;
  [key: string]: unknown;
}
interface SendRecord {
  status: number;
  generatedMessages: SentMessage[];
}

/** 보내기 POST 응답을 쌓는다. `page.goto` 전에 건다 */
async function recordSends(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const log: SendRecord[] = [];
    (window as unknown as { __sends: SendRecord[] }).__sends = log;
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
          data?: { generatedMessages?: SentMessage[] };
        } | null;
        log.push({
          status: response.status,
          generatedMessages: json?.data?.generatedMessages ?? [],
        });
      }
      return response;
    };
  });
}

async function lastSend(page: Page): Promise<SendRecord> {
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as unknown as { __sends: SendRecord[] }).__sends.length,
      ),
    )
    .toBeGreaterThan(0);
  const sends = await page.evaluate(
    () => (window as unknown as { __sends: SendRecord[] }).__sends,
  );
  const last = sends.at(-1);
  if (last === undefined) throw new Error("보내기 응답 없음");
  return last;
}

/** 준비 → 방 1 → 질문 → 응답과 화면 단언. 자동 답 말풍선을 돌려준다 */
async function askPacking(page: Page) {
  await recordSends(page);
  await start(page, "/");
  await chatMock(page, "reset", { noBackorders: true, readyPackings: [7002] });
  await openRoomById(page, 1);
  await say(page, ASK);

  const sent = await lastSend(page);
  expect(sent.status).toBe(201);
  expect(sent.generatedMessages.map((m) => m.kind)).toEqual([
    "AUTO_REPLY",
    "HANDOFF",
  ]);
  expect(sent.generatedMessages.map((m) => "handoff" in m)).toEqual([
    false,
    false,
  ]);

  const after = await waitLinesAfter(page, ASK, 2);
  expect(after.map((l) => l.kind)).toEqual(["AUTO_REPLY", "HANDOFF"]);
  const reply = messageBySequence(page, after[0]?.sequence ?? -1);
  await expect(bodyOf(reply)).toHaveText(BODY);
  await expect(reply.getByText("자동 답변", { exact: true })).toHaveCount(1);
  // 카드 0(미송 카드 S3-3, 재고 카드, 미수 카드), 링크 0, 담기 0
  await expect(reply.locator('[data-ac~="S3-3"]')).toHaveCount(0);
  await expect(reply.locator("[data-variant-id]")).toHaveCount(0);
  await expect(reply.locator("[data-receivable-card]")).toHaveCount(0);
  await expect(
    reply.getByRole("link", { name: "미송 대기 현황 보기", exact: true }),
  ).toHaveCount(0);
  await expect(reply.getByRole("link")).toHaveCount(0);
  await expect(reply.getByRole("button", { name: /담기/ })).toHaveCount(0);
  // 바로 아래 넘김 줄 1
  const next = await reply.evaluate((el) => {
    const sibling = el.nextElementSibling as HTMLElement | null;
    return { kind: sibling?.dataset.kind, text: sibling?.textContent ?? "" };
  });
  expect(next.kind).toBe("HANDOFF");
  expect(next.text).toContain("사장님께 전달했어요");
  expect(
    (await linesAfter(page, ASK)).filter((l) => l.kind === "HANDOFF"),
  ).toHaveLength(1);
  await expect(log(page)).toBeVisible();
  return reply;
}

test("S2-9 ① 1280×800 reset {noBackorders, readyPackings: [7002]} → '미송 언제 와요?' → 포장 답 + 바로 아래 넘김 줄", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await askPacking(page);
});

test("S2-9 ② 390×844 같은 답: 가로 넘침 0, 본문 경계가 말풍선 안(±0.5px)", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const reply = await askPacking(page);
  const geometry = await bodyOf(reply).evaluate((el) => {
    const bubble = el.parentElement;
    const b = el.getBoundingClientRect();
    const o = bubble?.getBoundingClientRect();
    return {
      docFits:
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
      left: o === undefined ? null : b.left - o.left,
      right: o === undefined ? null : o.right - b.right,
      bottom: o === undefined ? null : o.bottom - b.bottom,
    };
  });
  expect(geometry.docFits).toBe(true);
  expect(geometry.left).toBeGreaterThanOrEqual(-0.5);
  expect(geometry.right).toBeGreaterThanOrEqual(-0.5);
  expect(geometry.bottom).toBeGreaterThanOrEqual(-0.5);
});
