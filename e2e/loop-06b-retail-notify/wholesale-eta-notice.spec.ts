import { expect, test, type Locator, type Page } from "@playwright/test";
import { installClock, login } from "../loop-04-chat/helpers";

/**
 * loop-06b #306 S3-1 도매 입고일 안내 줄(01-plan §4-3, 도매 디자인 결정 45 46, 와이어프레임
 * `20_retail-notifications/01_wholesale-eta.html` `#state-eta-notice`). 기본 설정 wholesale 프로젝트(3100, MSW).
 *
 * 시각: T0 = 2026-10-29 14:20(서울)에 시계를 고정한 뒤 들어간다. 미송 시드 입고일이 reset 시각 상대값이라
 * 3019(SKU 1-2) = 2026.11.05, 3003(SKU 1-3) = 2026.10.26으로 선다. 3019는 봄봄상회 1곳, 3003은 2곳.
 * 목은 페이지 안이라 들어간 뒤엔 클라이언트 동작만 한다.
 */

const T0 = new Date("2026-10-29T14:20:00+09:00");
const SAVE_1 = "저장하면 이 옵션을 기다리는 소매처 1곳에 알림이 가요";
const SAVE_2 = "저장하면 이 옵션을 기다리는 소매처 2곳에 알림이 가요";
const CLEAR_2 = "해제하면 소매처 2곳에 입고일 미정 알림이 가요";

async function resetMock(page: Page): Promise<void> {
  const status = await page.evaluate(async () => {
    const response = await fetch("/__mock/chat/reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    return response.status;
  });
  expect(status, "목 reset(미송 목 포함)").toBe(200);
}

async function expand(page: Page, sku: string): Promise<void> {
  await page.getByRole("button", { name: `SKU ${sku} 펼치기` }).click();
  await expect(etaInput(page)).toBeVisible();
}

function etaInput(page: Page): Locator {
  return page.getByRole("textbox", { name: "예상 입고일" });
}

function reasonInput(page: Page): Locator {
  return page.getByRole("textbox", { name: "변동 사유" });
}

/** 폼 안 안내 줄. 없으면 0개 */
function notice(page: Page): Locator {
  return page.locator('form p[data-ac~="S3-1"]');
}

test.beforeEach(async ({ page }) => {
  await installClock(page, T0);
  await login(page);
  await page.getByRole("link", { name: "미송", exact: true }).click();
  await expect(page).toHaveURL(/\/backorders/);
  await resetMock(page);
});

test("S3-1 3019 다른 날짜 → '1곳' 줄, 저장 버튼 설명. 같은 날짜, 사유만, 형식 오류 → 줄 0. 저장 → PUT 본문 D, '저장했어요', 줄 0", async ({
  page,
}) => {
  await expand(page, "1-2");
  await expect(etaInput(page)).toHaveValue("2026.11.05");
  await expect(notice(page)).toHaveCount(0);

  await etaInput(page).fill("2026.11.08");
  await expect(notice(page)).toHaveText(SAVE_1);
  /* 숫자만 굵게(foreground 500) */
  await expect(notice(page).locator("span")).toHaveText("1곳");
  const save = page.getByRole("button", { name: "저장", exact: true });
  await expect(save).toHaveAccessibleDescription(SAVE_1);

  /* 같은 날짜를 다시 치고 사유만 바꿈 → 줄 0, 설명도 없다 */
  await etaInput(page).fill("2026.11.05");
  await reasonInput(page).fill("원단 수급 지연, 염색 공장 대기");
  await expect(notice(page)).toHaveCount(0);
  await expect(save).toHaveAccessibleDescription("");

  /* 형식 오류 중 → 줄 0 */
  await etaInput(page).fill("2026.11");
  await expect(notice(page)).toHaveCount(0);

  await etaInput(page).fill("2026.11.08");
  await reasonInput(page).fill("원단 수급 지연");
  await expect(notice(page)).toHaveText(SAVE_1);
  const put = page.waitForRequest(
    (r) =>
      /\/api\/wholesale\/variants\/3019\/expected-inbound$/.test(r.url()) &&
      r.method() === "PUT",
  );
  await save.click();
  expect((await put).postDataJSON()).toEqual({
    expectedInboundDate: "2026-11-08",
    expectedInboundReason: "원단 수급 지연",
  });
  await expect(
    page.getByRole("status").filter({ hasText: "저장했어요" }),
  ).toBeVisible();
  await expect(page.getByText("알렸어요")).toHaveCount(0);
  /* 저장된 날짜 = 입력이라 줄이 빠진다 */
  await expect(notice(page)).toHaveCount(0);
});

test("S3-1 3003 다른 날짜 → '2곳', 저장된 날짜 지움 → 해제 문구 + '해제' 버튼 설명", async ({
  page,
}) => {
  await expand(page, "1-3");
  await expect(etaInput(page)).toHaveValue("2026.10.26");

  await etaInput(page).fill("2026.11.02");
  await expect(notice(page)).toHaveText(SAVE_2);

  await etaInput(page).fill("");
  await expect(notice(page)).toHaveText(CLEAR_2);
  await expect(
    page.getByRole("button", { name: "해제", exact: true }),
  ).toHaveAccessibleDescription(CLEAR_2);
});
