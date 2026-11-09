import { expect, test } from "@playwright/test";
import { loginHeading, otherTabNotice } from "./helpers";
import {
  listenSessionBroadcast,
  nameInput,
  waitSessionBroadcast,
} from "../loop-10-save-lock-notice/helpers";
import { ME, signIn, signOut } from "../loop-08b-chat-filter-history/helpers";
import { T0 } from "../loop-09-form-back-guard/helpers";

/**
 * loop-11 QA — 개발 spec과 다른 장면 하나. 사장이 상품 폼에 쓰는 중에 다른 탭에서 같은 계정으로 로그아웃한다
 * (개발 S1-3은 대시보드에서 본다). 그 뒤 안내는 **한 번뿐**이다: 앱 안 이동으로 로그인 화면을 다시 마운트해도,
 * 로그인했다가 이 탭에서 로그아웃해도 다시 안 나온다.
 */
test("QA S1-3 폼 쓰던 탭이 다른 탭 로그아웃으로 닫힘 → 안내 1 → 다시 마운트 0 → 로그인 뒤 이 탭 로그아웃 0", async ({
  page,
}) => {
  await page.goto("/login");
  await signIn(page, ME);
  await page.goto("/products/new");
  await nameInput(page).fill("QA 로그아웃 니트");
  await listenSessionBroadcast(page);

  const tab = await page.context().newPage();
  await tab.goto("/login");
  await signIn(tab, ME);
  await waitSessionBroadcast(page, 1);
  // 같은 계정 로그인은 폼을 닫지 않는다(refresh)
  expect(new URL(page.url()).pathname).toBe("/products/new");
  await expect(nameInput(page)).toHaveValue("QA 로그아웃 니트");

  await signOut(tab);
  await page.bringToFront();
  await waitSessionBroadcast(page, 2);
  await page.waitForURL(/\/login$/);
  await expect(otherTabNotice(page)).toHaveCount(1);
  await expect(nameInput(page)).toHaveCount(0);

  // 한 번 꺼낸 안내는 앱 안 이동으로 다시 마운트해도 안 나온다
  await page.clock.install({ time: T0 });
  await page.getByRole("link", { name: "회원가입", exact: true }).click();
  await page.waitForURL(/\/signup$/);
  await page.getByRole("link", { name: "로그인", exact: true }).click();
  await page.waitForURL(/\/login$/);
  await expect(loginHeading(page)).toBeVisible();
  await page.clock.runFor(500);
  await expect(otherTabNotice(page)).toHaveCount(0);

  // 로그인 → 이 탭 로그아웃: 안내 0
  await signIn(page, ME);
  await signOut(page);
  await expect(loginHeading(page)).toBeVisible();
  await page.clock.runFor(500);
  await expect(otherTabNotice(page)).toHaveCount(0);
});
// 이미 로그인 화면인 탭의 로그아웃 방송 갈래(11-M2)는 개발 spec `S1-7 … 로그아웃 방송 …`이 본다
