import { expect, test } from "@playwright/test";
import {
  ALLOCATIONS_POST,
  collectPageErrors,
  depositViaFetch,
  requests,
  startAt,
  T_1420,
} from "./helpers";

/**
 * loop-08f #371 S1-6 목 모드 정산 탭에서 `선수금으로 정산`이 돈다(01-plan §4-6, §6 S1-6). 1470.
 *
 * reset → 시각 고정(10/29 14:20) → 화면이 아니라 fetch로 봄봄상회 입금 37,500(배분 없음, 키 `e2e-p-1`)
 * → 정산 탭 → 봄봄상회 펼침 → `선수금으로 정산` → 주문 2(7004) 37,500 → `선수금 정산`.
 *
 * AC 절차 변경(02-dev §AC 조건 변경): AC의 "화면 새로고침"은 목 저장소를 시드로 되돌린다(MSW가 페이지 안). 그래서
 * 입금을 **로그인 화면에서** 넣고 로그인 뒤 상단 메뉴로 정산 탭에 간다(클라이언트 이동, 첫 조회부터 입금이 보인다).
 */

test("S1-6 봄봄상회 선수금 37,500 → 7004에 37,500 정산 → 성공 안내, 미수 0, 선수금 0, POST /allocations 201 1회, 화면 오류 0", async ({
  page,
}) => {
  const errors = collectPageErrors(page);
  await startAt(page, T_1420, {
    before: (p) =>
      depositViaFetch(p, {
        amount: 37_500,
        paidAt: "2026-10-28T10:00:00+09:00",
        key: "e2e-p-1",
      }),
  });
  await page.getByRole("link", { name: "정산", exact: true }).click();
  await page.waitForURL(/\/settlements/);

  await page.getByRole("button", { name: "봄봄상회" }).click();
  /* 3카드 `남은 선수금`과 펼침 표의 주문 2(9/2, 7004) 미수 잔액 */
  const prepaidLeft = page.locator('div:has(> dt:text-is("남은 선수금")) > dd');
  const order2Outstanding = page
    .getByRole("row")
    .filter({ hasText: "9월 2일 10:00" })
    .getByRole("cell")
    .last();
  await expect(prepaidLeft).toHaveText("37,500원");
  await expect(order2Outstanding).toHaveText("37,500");

  await page.getByRole("button", { name: "선수금으로 정산" }).click();
  const amount = page.getByLabel("주문 2 배분액");
  await expect(amount).toHaveValue("37,500");
  await page.getByRole("button", { name: "선수금 정산", exact: true }).click();

  await expect(
    page.getByText(
      "봄봄상회에 선수금 37,500원 정산했어요 — 미수원장에서 확인하세요",
    ),
  ).toBeVisible();
  await expect(prepaidLeft).toHaveText("0원");
  await expect(order2Outstanding).toHaveText("0");

  const posts = await requests(page, ALLOCATIONS_POST);
  expect(posts.map((r) => r.status)).toEqual([201]);
  expect(errors).toEqual([]);
});
