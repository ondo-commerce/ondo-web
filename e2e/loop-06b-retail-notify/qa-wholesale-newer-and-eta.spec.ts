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
 * F2. 고치기 전: 줄이 뜬 채 모두 읽음(계약대로 POST 200) → 배지 0, 화면에 없던 새 행까지 읽음, 줄은 남았다(test.fail로 기록).
 * 고친 뒤(소매 S2-6과 같은 규칙): 줄이 떠 있으면 read POST 0 + 첫 장 다시 + 안내 한 줄. 새 행이 맨 위, 줄 사라짐, 배지 그대로.
 * 그다음 누름은 계약대로 POST {all, expectedUnread}. `NotificationBell`의 `hasNewer` 분기를 빼면 안내 한 줄 단언에서 실패한다(그 뒤 POST 0, 줄 0도 깨진다).
 */
test("(d') F2 줄이 뜬 채 모두 읽음 → POST 0, 첫 장 다시, 새 행 맨 위, 줄 0. 다시 누르면 POST 1", async ({
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
  const line = panel(page).getByRole("button", {
    name: /^새 알림 \d+개 보기$/,
  });
  await expect(line).toBeVisible();
  const label = await bell(page).getAttribute("aria-label");
  const readsBefore = (await readBodies(page)).length;
  const lists = await count(page, LIST_GET);
  await markAllButton(page).click();
  await expect(
    panel(page).getByRole("status").filter({
      hasText: "새 알림이 왔어요. 확인하고 다시 눌러 주세요",
    }),
  ).toBeVisible();
  await waitCount(page, LIST_GET, lists + 1);
  await expect(line).toHaveCount(0);
  expect((await rowIds(page))[0]).toBe(NEW_ID);
  expect((await readBodies(page)).length, "줄이 떠 있으면 read POST 0").toBe(
    readsBefore,
  );
  await expect(bell(page)).toHaveAttribute("aria-label", label ?? "");
  /* 다음 count 한 번 더 — 줄이 다시 뜨지 않는다 */
  const after = await count(page, COUNT_GET);
  await page.clock.fastForward(30_000);
  await waitCount(page, COUNT_GET, after + 1);
  await expect(line).toHaveCount(0);
  await panel(page).screenshot({
    path: `${SHOTS}/wholesale-markall-newer-fixed.png`,
  });

  /* 확인한 뒤 다시 누르면 계약대로 POST {all, expectedUnread} */
  await markAllButton(page).click();
  await expect
    .poll(async () => (await readBodies(page)).slice(readsBefore))
    .toEqual([
      expect.objectContaining({
        all: true,
        expectedUnread: expect.any(Number),
      }),
    ]);
  await expect(markAllButton(page)).toHaveCount(0);
  await expect(bell(page)).toHaveAccessibleName("알림");
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
