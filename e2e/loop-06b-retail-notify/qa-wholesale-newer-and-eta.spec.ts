import { expect, test } from "@playwright/test";
import {
  bell,
  COUNT_GET,
  count,
  LIST_GET,
  markAllButton,
  notify,
  openPanel,
  panel,
  readBodies,
  rowIds,
  start,
  waitCount,
} from "../loop-05b2-notify-read/helpers";

/**
 * QA loop-06b — 도매 쪽 사장 시나리오(04-qa.md "사장 시나리오 (d)")와 입고일 안내 줄 토큰.
 * 기본 설정 wholesale 프로젝트(3100 목)로 돈다. 스크린샷은 runs/loop-06b-retail-notify/qa/.
 */

const SHOTS =
  "/Users/oh-chang-eun/onDo/.claude/harness/runs/loop-06b-retail-notify/qa";
const SEED_FIRST_UNREAD = 1025;
const NEW_ID = 1026;

test("(d) 연 뒤 다른 기기가 1개 읽고 새 1개 → '새 알림 1개 보기' → 눌러서 새 행이 맨 위, 줄 사라짐", async ({
  page,
}) => {
  await start(page);
  await openPanel(page);
  await page.evaluate(
    (id) =>
      fetch("/api/wholesale/notifications/read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [id] }),
      }),
    SEED_FIRST_UNREAD,
  );
  await notify(page, "incoming", { type: "NEW_ORDER" });
  const counts = await count(page, COUNT_GET);
  await page.clock.fastForward(30_000);
  await waitCount(page, COUNT_GET, counts + 1);
  const newer = panel(page).getByRole("button", {
    name: "새 알림 1개 보기",
    exact: true,
  });
  await expect(newer).toBeVisible();
  await panel(page).screenshot({ path: `${SHOTS}/wholesale-newer-1470.png` });
  await newer.click();
  await expect(newer).toHaveCount(0);
  expect((await rowIds(page))[0]).toBe(NEW_ID);
});

/**
 * F2 재현(test.fail). 02-dev S3 부채 1: 줄이 뜬 채 모두 읽음(계약대로 POST 200) → 배지 0, 새 행은 화면에 없는데 읽음 처리되고,
 * '새 알림 N개 보기' 줄은 남는다. 이 테스트는 지금 동작을 기록한다(줄이 남는 것). 결함이면 F 번호로 올린다.
 */
test.fail("(d') F2 줄이 뜬 채 모두 읽음 → 배지 0. 그 뒤 '새 알림 N개 보기' 줄이 남는가 기록", async ({
  page,
}) => {
  await start(page);
  await openPanel(page);
  await page.evaluate(
    (id) =>
      fetch("/api/wholesale/notifications/read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [id] }),
      }),
    SEED_FIRST_UNREAD,
  );
  await notify(page, "incoming", { type: "NEW_ORDER" });
  const counts = await count(page, COUNT_GET);
  await page.clock.fastForward(30_000);
  await waitCount(page, COUNT_GET, counts + 1);
  const lists = await count(page, LIST_GET);
  await markAllButton(page).click();
  await expect(markAllButton(page)).toHaveCount(0);
  await expect(bell(page)).toHaveAccessibleName("알림");
  /* 다음 count 한 번 더(줄이 count 갱신으로 사라지는지까지 본다) */
  const after = await count(page, COUNT_GET);
  await page.clock.fastForward(30_000);
  await waitCount(page, COUNT_GET, after + 1);
  const line = panel(page).getByRole("button", {
    name: /^새 알림 \d+개 보기$/,
  });
  const state = {
    reads: await readBodies(page),
    listGetsAfterMarkAll: (await count(page, LIST_GET)) - lists,
    newerLine: await line.count(),
    newerText: (await line.count()) > 0 ? await line.textContent() : null,
    rowIds: (await rowIds(page)).slice(0, 3),
  };
  test
    .info()
    .annotations.push({ type: "state", description: JSON.stringify(state) });
  await panel(page).screenshot({
    path: `${SHOTS}/wholesale-markall-newer-left.png`,
  });
  /* 기록: 남으면 1. 배지 0인데 '새 알림 1개 보기'가 남는 것 = F 후보 */
  expect(state.newerLine, "모두 읽음 뒤 새 알림 줄").toBe(0);
});

test("S3-1 안내 줄 토큰: secondary-foreground 13px, 'N곳'만 foreground 500, 저장 버튼 aria-describedby", async ({
  page,
}) => {
  await start(page, "/backorders");
  await page.getByRole("button", { name: "SKU 1-2 펼치기" }).click();
  const eta = page.getByRole("textbox", { name: "예상 입고일" });
  await eta.fill("2027.01.05");
  const line = page.locator('form p[data-ac~="S3-1"]');
  await expect(line).toHaveText(
    "저장하면 이 옵션을 기다리는 소매처 1곳에 알림이 가요",
  );
  const m = await line.evaluate((el) => {
    const cs = getComputedStyle(el);
    const strong = el.querySelector("strong, b, span");
    const ss = strong ? getComputedStyle(strong) : null;
    const root = getComputedStyle(document.documentElement);
    const probe = document.createElement("span");
    probe.className = "text-secondary-foreground text-foreground";
    return {
      color: cs.color,
      size: cs.fontSize,
      strongText: strong?.textContent ?? null,
      strongColor: ss?.color ?? null,
      strongWeight: ss?.fontWeight ?? null,
      tokenSecondaryFg: root
        .getPropertyValue("--color-secondary-foreground")
        .trim(),
      tokenFg: root.getPropertyValue("--color-foreground").trim(),
      id: el.id,
      probe: probe.className,
    };
  });
  test
    .info()
    .annotations.push({ type: "measure", description: JSON.stringify(m) });
  const save = page.getByRole("button", { name: "저장", exact: true });
  await expect(save).toHaveAttribute("aria-describedby", m.id);
  expect(m.strongText).toBe("1곳");
  expect(m.strongWeight).toBe("500");
  expect(m.color).not.toBe(m.strongColor);
  await page
    .locator("form")
    .first()
    .screenshot({ path: `${SHOTS}/wholesale-eta-notice-1470.png` });
});
