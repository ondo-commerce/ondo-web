import { expect, test, type Page } from "@playwright/test";
import {
  assertStubServers,
  bubbles,
  chatMock,
  chatNav,
  composer,
  counterpartRead,
  log,
  readMarkSequences,
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
  /* 끊김 안내가 늦게 서지 않는지는 다음 polling 회차가 화면에 반영된 뒤 본다(08g S5-7, 08e N4, 리뷰 R4).
     `{lost: 0, readonly: null}`은 기다리기 전부터 정상값이라 그것만 poll하면 첫 검사에서 통과한다. 이 시나리오엔
     끊김 안내가 섰다가 사라지는 순서가 없다(처음부터 0) — 그래서 그 회차가 바꿀 다른 값을 만든다: 상대 읽음을 시드 6에서
     7(마지막 소매 글)로 올리면 그 뒤 시작한 polling 응답 meta가 7을 들고, 반영되면 `읽음`이 seq 5 → 7로 옮겨 간다.
     목은 요청 시점에 값을 정하니 올리기 전에 나가 있던 polling은 6을 든다 — 등록 뒤 시작한 요청만 잡는다 */
  expect(await readMarkSequences(page), "시드 상대 읽음 6 → seq 5").toEqual([
    5,
  ]);
  await counterpartRead(page, 1, 7);
  const poll = await page.waitForRequest(
    (r) =>
      /\/api\/retail\/chat\/rooms\/1\/messages(\?|$)/.test(r.url()) &&
      r.method() === "GET",
  );
  const response = await poll.response();
  if (response === null) throw new Error("polling 응답이 없다");
  expect(response.status(), "그 polling 응답").toBe(200);
  await response.finished();
  await expect
    .poll(() => readMarkSequences(page), {
      message: "그 회차 meta(7)가 화면에 반영",
    })
    .toEqual([7]);
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
