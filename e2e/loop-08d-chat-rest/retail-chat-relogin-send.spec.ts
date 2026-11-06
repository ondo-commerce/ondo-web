import { expect, test, type Page } from "@playwright/test";
import {
  assertStubServers,
  bubbles,
  chatMock,
  chatNav,
  composer,
  log,
  requests,
  roomRow,
  SEND_POST,
  start,
} from "../loop-08-chat-polish/retail-helpers";
import { routeAuth } from "../loop-06b-retail-notify/helpers";
import { RETAILERS } from "../side-02/retail/stub-api";

/**
 * loop-08d S2-6(#344 소매 확인). `pnpm e2e:stub`.
 *
 * 소매 보내기는 `guardSession`을 거쳐 세션 세대가 바뀐 401을 버리고 `server` 실패로 그린다(01-plan §4-2 4).
 * 코드상 도매 M8이 소매엔 없다(추정) — 그 추정을 회귀 시험으로 고정한다. 소매 앱 코드는 바꾸지 않는다.
 * 08c `retail-chat-other-tab`은 문(gate)으로 보내기를 세웠다. 이번엔 08d 목 `delay {op: send}`가 생겨 그걸 쓴다.
 */

assertStubServers();

const A_BODY = "안녕하세요, 플라워 셔츠 문의드려요";
const LOST = "로그인이 끊겼어요";

function pendingBubbles(page: Page) {
  return log(page).locator("[data-pending]");
}

async function lastSendStatus(page: Page) {
  return (await requests(page, SEND_POST)).at(-1)?.status;
}

test("S2-6 소매 보내기 지연 401 → 다른 탭 bombom 로그인 → 끊김 0, 실패 말풍선 → 다시 보내기 201", async ({
  page,
}) => {
  await routeAuth(page);
  await start(page, "/");
  await chatNav(page).click();
  await expect(page).toHaveURL("/chats");
  await roomRow(page, 1).click();
  await expect(page).toHaveURL("/chats/1?from=/chats");
  await expect(log(page).getByText(A_BODY)).toBeVisible();

  await chatMock(page, "fail", { op: "send", status: 401 });
  await chatMock(page, "delay", { op: "send", ms: 3_000 });
  await composer(page).fill("재로그인 넘긴 소매 글");
  await composer(page).press("Enter");
  await expect(pendingBubbles(page)).toHaveAttribute("data-pending", "sending");

  const tab = await page.context().newPage();
  await tab.goto("/login");
  await tab.getByLabel("이메일").fill(RETAILERS.bombom.email);
  await tab.getByLabel("비밀번호").fill("ondo1234!");
  await tab.getByRole("button", { name: "로그인", exact: true }).click();
  await expect(tab).toHaveURL(/\/$/);
  await page.bringToFront();

  await expect(pendingBubbles(page)).toHaveAttribute("data-pending", "failed", {
    timeout: 8_000,
  });
  expect(await lastSendStatus(page)).toBe(401);
  /* 끊김 안내가 늦게 서지 않는지는 다음 polling 응답이 끝난 뒤 본다(08g S5-7, 08e N4). 요청 수가 늘었다는 건 응답이
     끝났다는 뜻이 아니라서 응답 완료(`waitForResponse`)를 기다리고, 그 응답의 React 반영은 값 poll로 본다 */
  await page.waitForResponse(
    (r) =>
      /\/api\/retail\/chat\/rooms\/1\/messages(\?|$)/.test(r.url()) &&
      r.request().method() === "GET",
  );
  await expect
    .poll(async () => ({
      lost: await page.getByRole("alert").filter({ hasText: LOST }).count(),
      readonly: await composer(page).getAttribute("readonly"),
    }))
    .toEqual({ lost: 0, readonly: null });

  await pendingBubbles(page)
    .getByRole("button", { name: "다시 보내기" })
    .click();
  await expect.poll(() => lastSendStatus(page)).toBe(201);
  await expect(pendingBubbles(page)).toHaveCount(0);
  await expect(
    bubbles(page).filter({ hasText: "재로그인 넘긴 소매 글" }),
  ).toHaveCount(1);
});
