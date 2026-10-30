import { expect, test, type Locator, type Page } from "@playwright/test";
import { installClock, log, login, roomList, row } from "../loop-04-chat/helpers";

/**
 * QA loop-06 06a 도매 쪽(#299 S4). 사장 시나리오 (d) 부분 배분 뒤 답 수량, (e) 지남 답의 도매 근거 줄,
 * 디자인 결정 38 토큰. `pnpm e2e --project=wholesale`로 돈다. 목은 페이지 안이라 미송 탭과 채팅 사이는
 * 클라이언트 이동만 한다.
 */

const T0 = new Date("2026-10-29T14:20:00+09:00");
const SHOTS = "/Users/oh-chang-eun/onDo/.claude/harness/runs/loop-06-backorder-reply/qa";

interface Injected {
  kind: string;
  sequence: number;
  body: string;
}

async function inject(
  page: Page,
  body: string,
  chip?: { backorderId: number; variantId: number },
): Promise<Injected[]> {
  const { status, data } = await page.evaluate(
    async ({ body, chip }) => {
      const r = await fetch("/__mock/chat/rooms/1/incoming", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          body,
          autoReply: true,
          ...(chip === null ? {} : { inquiry: { intent: "BACKORDER", listingId: null, ...chip } }),
        }),
      });
      return { status: r.status, data: ((await r.json()) as { data: Injected[] }).data };
    },
    { body, chip: chip ?? null },
  );
  expect(status).toBe(201);
  return data.slice(1);
}

function bubbleOf(page: Page, m: Injected | undefined): Locator {
  expect(m).toBeDefined();
  return log(page).locator(`[data-sequence="${m?.sequence}"]`);
}

async function openRoom1(page: Page) {
  await page.getByRole("banner").getByRole("link", { name: /^채팅/ }).click();
  await row(page, "봄봄상회").click();
  await expect(page).toHaveURL(/room=1$/);
}

async function allocateLinen(page: Page, qty: number) {
  await page.getByRole("link", { name: "미송", exact: true }).click();
  await page.getByRole("button", { name: "SKU 1-2 펼치기" }).click();
  const input = page.getByRole("textbox", { name: "주문 1 봄봄상회 배분 수량", exact: true });
  await input.fill(String(qty));
  const done = page.waitForResponse(
    (r) => /\/api\/wholesale\/backorders\/allocations$/.test(r.url()) && r.request().method() === "POST",
  );
  await page.getByRole("button", { name: "배분 확정", exact: true }).click();
  expect((await done).status()).toBe(201);
}

test.beforeEach(async ({ page }) => {
  await installClock(page, T0);
  await login(page);
  await page.goto("/chats?room=1");
  await expect(roomList(page).getByRole("link").first()).toBeVisible();
  const status = await page.evaluate(async () => (await fetch("/__mock/chat/reset", { method: "POST", body: "{}" })).status);
  expect(status).toBe(200);
});

test("(d) 1장 배분 뒤 본문으로 확정('린넨 자켓 베이지 L 언제 와요?') → 남은 1장 답, 원래 2장 0", async ({ page }) => {
  await allocateLinen(page, 1);
  await openRoom1(page);
  const [reply, ...rest] = await inject(page, "린넨 자켓 베이지 L 언제 와요?");
  expect(reply?.kind).toBe("AUTO_REPLY");
  expect(rest).toEqual([]);
  const bubble = bubbleOf(page, reply);
  await expect(bubble).toContainText("남은 미송 1장은 11월 5일 도매 입고 예정이에요");
  await expect(bubble).toContainText("미송 1장, 입고 예정 2026-11-05");
  await expect(bubble).not.toContainText("2장");
});

test("(d-2) 되묻기 뒤 전량 배분(2장) → 그 보기 칩 → 넘김만, 입고 예정 문장 0", async ({ page }) => {
  const [clarify] = await inject(page, "지난주 주문한 거 언제 와요?");
  expect(clarify?.kind).toBe("CLARIFY");
  await allocateLinen(page, 2);
  await openRoom1(page);
  const gone = await inject(page, "린넨 셋업 자켓 베이지/L, 남은 2장, 9/7 주문 #7003", {
    backorderId: 9003,
    variantId: 3019,
  });
  expect(gone.map((m) => m.kind)).toEqual(["HANDOFF"]);
  expect(JSON.stringify(gone)).not.toContain("입고 예정");
});

test("(e) 칩 9001(지남) → 도매 말풍선 사실 문장 + 근거 줄 + 넘김 줄, '지연' 0", async ({ page }) => {
  await inject(page, "지난주 주문한 거 언제 와요?");
  const out = await inject(page, "빈티지 플라워 셔츠 레드/L, 남은 4장, 9/4 주문 #7001", {
    backorderId: 9001,
    variantId: 3003,
  });
  expect(out.map((m) => m.kind)).toEqual(["AUTO_REPLY", "HANDOFF"]);
  const bubble = bubbleOf(page, out[0]);
  await expect(bubble).toContainText("등록된 입고 예정일 10월 26일이 지났어요");
  await expect(bubble).toContainText("미송 4장, 입고 예정 2026-10-26");
  await expect(bubble).not.toContainText("지연");
});

test("디자인 결정 38: 보기 이름표 12px muted 한 번, 보기 줄 13px secondary, 줄마다 하나, 쉼표 이어 쓰기 0", async ({ page }) => {
  const [clarify] = await inject(page, "지난주 주문한 거 언제 와요?");
  const bubble = bubbleOf(page, clarify);
  const list = bubble.locator('[data-ac="S4-1 S4-2"]');
  await expect(list.locator('[data-ac="S4-1"]')).toHaveCount(5);
  const m = await list.evaluate((n) => {
    const label = n.firstElementChild as HTMLElement;
    const items = [...n.querySelectorAll('[data-ac="S4-1"]')] as HTMLElement[];
    return {
      label: { text: label.textContent, size: getComputedStyle(label).fontSize },
      items: items.map((i) => ({ size: getComputedStyle(i).fontSize, top: Math.round(i.getBoundingClientRect().top) })),
      display: getComputedStyle(n).display,
    };
  });
  console.log("QA design wholesale", JSON.stringify(m));
  test.info().annotations.push({ type: "measure", description: JSON.stringify(m) });
  expect(m.label).toEqual({ text: "보기", size: "12px" });
  expect(new Set(m.items.map((i) => i.size))).toEqual(new Set(["13px"]));
  expect(new Set(m.items.map((i) => i.top)).size).toBe(5);
  await bubble.screenshot({ path: `${SHOTS}/wholesale-bo-choices.png` }).catch(() => undefined);
});
