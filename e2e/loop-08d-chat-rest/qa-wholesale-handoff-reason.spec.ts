import { expect, test, type Page } from "@playwright/test";
import {
  installClock,
  log,
  login,
  mock,
  roomList,
} from "../loop-04-chat/helpers";

/**
 * loop-08d QA — S6 도매 넘김 이유 문구를 실제 화면 1470, 1280에서 본다.
 * 개발 spec(S6-2)은 HUMAN_REQUEST 하나만 본다. 여기서는 목 판정이 낼 수 있는 이유 몇 개를 더 넣어
 * "넘김 줄은 있는데 이유 줄이 비었다"가 0인지, 긴 글이 방 폭을 넘지 않는지, 글 색이 토큰인지 잰다.
 * 스크린샷: .claude/harness/runs/loop-08d-chat-rest/qa/s6-*.png
 */

const T0 = new Date("2026-10-29T14:20:00+09:00");
const SHOTS = ".claude/harness/runs/loop-08d-chat-rest/qa";

/* 판정 이유가 서로 다르게 나오도록 고른 말(목 inquiry.ts 판정 순서 기준) */
const ASKS = [
  "사장님이랑 통화하고 싶어요", // HUMAN_REQUEST
  "안녕하세요 반가워요", // NO_INTENT 기대
  "재고 있어요?", // NO_CONTEXT 기대(상품 문맥 없음)
  "가격 좀 깎아 주세요", // NEGOTIATION 기대
];

async function inject(page: Page, body: string) {
  return page.evaluate(async (body) => {
    const r = await fetch("/__mock/chat/rooms/1/incoming", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body, autoReply: true }),
    });
    return (await r.json()) as { data: { kind: string; sequence: number }[] };
  }, body);
}

for (const width of [1470, 1280]) {
  test(`QA S6 이유 줄 ${width}: 넘김마다 이유 글, 넘침 0, 토큰 색`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await installClock(page, T0);
    await login(page);
    await page.goto("/chats?room=1");
    await expect(roomList(page).getByRole("link").first()).toBeVisible();
    await mock(page, "reset");
    await expect(log(page)).toBeVisible();

    /* 판정이 넘김을 낸 수만 센다 — 어떤 말은 답(넘김 0)으로 끝난다 */
    let handoffs = 0;
    for (const ask of ASKS) {
      const { data } = await inject(page, ask);
      handoffs += data.filter((m) => m.kind === "HANDOFF").length;
    }
    expect(handoffs).toBeGreaterThanOrEqual(2);

    const notes = log(page).locator('[role="note"][data-reason]');
    await expect.poll(() => notes.count()).toBeGreaterThanOrEqual(handoffs);

    const rows = await notes.evaluateAll((els) =>
      els.map((el) => {
        const text = el.querySelector<HTMLElement>("[data-reason-text]");
        const box = el.getBoundingClientRect();
        const parent = el.closest('[role="log"]')?.getBoundingClientRect();
        return {
          reason: (el as HTMLElement).dataset.reason ?? "",
          text: text?.textContent ?? "",
          color: text ? getComputedStyle(text).color : "",
          overflow: text ? text.scrollWidth > text.clientWidth + 1 : false,
          inside: parent
            ? box.left >= parent.left - 1 && box.right <= parent.right + 1
            : false,
        };
      }),
    );
    test.info().annotations.push({
      type: "reasons",
      description: JSON.stringify(rows),
    });
    for (const row of rows) {
      expect(row.text.trim(), `${row.reason} 이유 글`).not.toBe("");
      expect(row.overflow, `${row.reason} 가로 넘침`).toBe(false);
      expect(row.inside, `${row.reason} log 안`).toBe(true);
    }
    /* 토큰 색: text-secondary-foreground를 가진 임시 요소와 같은 색 */
    const token = await page.evaluate(() => {
      const probe = document.createElement("span");
      probe.className = "text-secondary-foreground";
      document.body.append(probe);
      const c = getComputedStyle(probe).color;
      probe.remove();
      return c;
    });
    for (const row of rows) expect(row.color, row.reason).toBe(token);

    await log(page).evaluate((el) => (el.scrollTop = el.scrollHeight));
    await page.screenshot({ path: `${SHOTS}/s6-wholesale-${width}.png` });
  });
}
