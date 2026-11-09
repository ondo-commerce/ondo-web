import { expect, test, type Page } from "@playwright/test";
import {
  installLoginFailure,
  loginFailedBanner,
  OTHER_TAB_NOTICE,
  otherTabNotice,
  WRONG_PASSWORD,
} from "./helpers";
import {
  listenSessionBroadcast,
  nameInput,
  waitSessionBroadcast,
} from "../loop-10-save-lock-notice/helpers";
import { ME, OTHER, signIn } from "../loop-08b-chat-filter-history/helpers";
import { T0 } from "../loop-09-form-back-guard/helpers";

/**
 * loop-11 QA — 개발 spec(S1-2 S1-5)이 안 보는 것만: 문구가 글자 그대로인지(부분 일치 아님), 안내 영역이
 * 접근성 트리에서 `status`로 잡히는지, 실패 배너가 뜬 순간 같은 자리에 두 줄이 같이 있지 않은지, 화면 폭 두 개.
 * 스크린샷은 회차 보고용(`runs/loop-11-other-tab-notice/qa/`).
 */

const SHOTS = ".claude/harness/runs/loop-11-other-tab-notice/qa";

/** 안내 래퍼(`data-ac="10:S1-2"`)의 실측. 실패 시점에 무엇을 잡았는지 남기려고 role과 글자를 같이 꺼낸다 */
function wrapperFacts(page: Page) {
  return page.evaluate(() => {
    const el = document.querySelector('[data-ac="10:S1-2"]');
    return {
      count: document.querySelectorAll('[data-ac="10:S1-2"]').length,
      tag: el?.tagName ?? null,
      role: el?.getAttribute("role") ?? null,
      text: el?.textContent ?? null,
    };
  });
}

async function reachNotice(page: Page): Promise<void> {
  await installLoginFailure(page);
  await page.goto("/login");
  await signIn(page, ME);
  await page.goto("/products/new");
  await nameInput(page).fill("QA 접근성 니트");
  await listenSessionBroadcast(page);
  const tab = await page.context().newPage();
  await tab.goto("/login");
  await signIn(tab, OTHER);
  await page.bringToFront();
  await waitSessionBroadcast(page);
  await page.waitForURL(/\/login$/);
  await expect(otherTabNotice(page)).toHaveCount(1);
}

test.use({ viewport: { width: 1280, height: 800 } });

test("QA S1-2 S1-5 안내는 글자 그대로 status 한 줄, 실패 배너가 뜨면 status는 비고 alert 한 줄만", async ({
  page,
}) => {
  await reachNotice(page);
  await page.clock.install({ time: T0 });
  await page.clock.runFor(500);

  // 글자 그대로(정규화 뒤 전체 일치) 한 번만 화면에 있다
  await expect(otherTabNotice(page)).toHaveText(OTHER_TAB_NOTICE);
  await expect(page.getByText(OTHER_TAB_NOTICE, { exact: true })).toHaveCount(
    1,
  );
  expect(await wrapperFacts(page)).toEqual({
    count: 1,
    tag: "DIV",
    role: "status",
    text: OTHER_TAB_NOTICE,
  });
  // 접근성 트리: status 안에 문구, 아이콘은 숨김
  await expect(page.locator('[data-ac="10:S1-2"]')).toMatchAriaSnapshot(
    `- status: ${OTHER_TAB_NOTICE}`,
  );
  await expect(loginFailedBanner(page)).toHaveCount(0);
  await page.screenshot({ path: `${SHOTS}/s1-2-notice-1280.png` });

  await page.getByLabel("이메일", { exact: true }).fill(ME);
  await page.getByLabel("비밀번호", { exact: true }).fill(WRONG_PASSWORD);
  await page.getByRole("button", { name: "로그인", exact: true }).click();
  await expect(loginFailedBanner(page)).toHaveCount(1);
  // 같은 자리에 두 줄이 같이 있지 않다: 래퍼는 남되 비어 있다
  expect(await wrapperFacts(page)).toEqual({
    count: 1,
    tag: "DIV",
    role: "status",
    text: "",
  });
  await expect(page.getByText(OTHER_TAB_NOTICE, { exact: true })).toHaveCount(
    0,
  );
  await page.screenshot({ path: `${SHOTS}/s1-5-failed-1280.png` });
});

test("QA S1-2 1470x900에서도 안내 한 줄", async ({ page }) => {
  await page.setViewportSize({ width: 1470, height: 900 });
  await reachNotice(page);
  await expect(otherTabNotice(page)).toHaveText(OTHER_TAB_NOTICE);
  await expect(otherTabNotice(page)).toBeInViewport();
  await page.screenshot({ path: `${SHOTS}/s1-2-notice-1470.png` });
  // 안내 1에서 바로 새로고침 → 0은 개발 spec `S1-2 끝 …`이 본다(11-R1)
});
