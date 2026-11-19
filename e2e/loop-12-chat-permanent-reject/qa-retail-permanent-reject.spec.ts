import { expect, test, type Locator, type Page } from "@playwright/test";
import { routeAuth } from "../loop-06b-retail-notify/helpers";
import {
  assertStubServers,
  chatMock,
  composer,
  count,
  openRoomById,
  requests,
  SEND_POST,
  start,
} from "../loop-08e-chat-rest/helpers";
import {
  advance,
  clientGo,
  expectReadOnly,
  expectRetryAndRemove,
  expectWritable,
  failedBubbles,
  lostAlert,
  otherTabLogin,
  pendingBubbles,
  removeOf,
  retryOf,
  ROOM_1,
  ROOM_33,
  sendText,
  serverBubbles,
  storedDraft,
  waitSendsSettled,
} from "../loop-08e-chat-rest/pending-helpers";
import { RETAILERS } from "../side-02/retail/stub-api";

/**
 * loop-12 #376 QA. 개발 spec(`retail-chat-permanent-reject.spec.ts`)이 안 보는 장면만 둔다.
 * Q1 네 code 크기(400 포함), Q2 일시 실패 그대로(500, 프록시 502 code, 403 FORBIDDEN),
 * Q3 polling 404는 방을 닫지 않음, Q5 대화 목록 왕복, Q6 승인 상태 보기 두 번 누름(12-R2 회귀),
 * Q6b 입력창으로 두 번, Q8 늦은 영구 거절이 재로그인 뒤 도착, Q9 클립보드 권한 거절(CDP), Q10 403 잠금 중 버튼,
 * Q11 닫힌 방의 카드 담기(12-N1 회귀).
 * Q4(떠난 방에 늦은 404)와 Q7(닫힌 방 × 401 × 재로그인)은 개발 spec "12-M1 ②①"이 더 넓게 봐 뺐다(수정 라운드 1).
 * 말풍선은 본문으로 가른다(`.last()` 금지). 시간은 페이지 시계(`advance`).
 */

assertStubServers();

test.beforeEach(async ({ page }) => {
  await routeAuth(page);
});

const BOMBOM = RETAILERS.bombom.retailerId;
const LATE = 3_000;
const POLL = 3_000;
const CLOSED_TEXT =
  "이 대화방에는 더 보낼 수 없어요. 다른 대화는 목록에서 열 수 있어요";
const TEXT: Record<number, string> = {
  403: "계정이 승인되면 보낼 수 있어요",
  404: "이 대화방에는 보낼 수 없어요. 글은 복사해 갈 수 있어요",
  409: "이 글은 그대로 다시 보낼 수 없어요. 입력창으로 옮겨 보낼 수 있어요",
  400: "서버가 이 글을 받지 않았어요. 입력창으로 옮겨 확인할 수 있어요",
};

function bubbleOf(page: Page, body: string): Locator {
  return failedBubbles(page).filter({ hasText: body });
}

function button(scope: Locator | Page, name: string): Locator {
  return scope.getByRole("button", { name, exact: true });
}

function closedNote(page: Page): Locator {
  return page.getByRole("status").filter({ hasText: CLOSED_TEXT });
}

async function failOnce(
  page: Page,
  status: number,
  body: string,
  code?: string,
): Promise<Locator> {
  await chatMock(
    page,
    "fail",
    code === undefined ? { op: "send", status } : { op: "send", status, code },
  );
  await sendText(page, body);
  const bubble = bubbleOf(page, body);
  await expect(bubble).toHaveAttribute("data-pending", "failed");
  return bubble;
}

async function lineFits(bubble: Locator): Promise<boolean> {
  return bubble
    .getByRole("alert")
    .evaluate((el) => el.scrollWidth <= el.clientWidth);
}

test.describe("Q1 [네 code 크기]", () => {
  test.use({ permissions: ["clipboard-read", "clipboard-write"] });

  test("390과 1280에서 400 포함 네 말풍선 아래 줄 넘침 0, 문서 가로 스크롤 0", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await start(page, "/");
    await openRoomById(page, ROOM_1);
    const list = [
      [403, await failOnce(page, 403, "403 크기 말")],
      [409, await failOnce(page, 409, "409 크기 말")],
      [400, await failOnce(page, 400, "400 크기 말")],
      [404, await failOnce(page, 404, "404 크기 말")],
    ] as const;
    for (const [status, bubble] of list) {
      await expect(bubble.getByRole("alert")).toContainText(TEXT[status] ?? "");
      expect(await lineFits(bubble), `390 ${status} 넘침`).toBe(true);
    }
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
      "390 문서 가로 스크롤",
    ).toBe(true);
    await expect(closedNote(page)).toBeVisible();
    expect(
      await closedNote(page).evaluate((el) => el.scrollWidth <= el.clientWidth),
      "390 안내 줄 넘침",
    ).toBe(true);

    await page.setViewportSize({ width: 1280, height: 800 });
    for (const [status, bubble] of list)
      expect(await lineFits(bubble), `1280 ${status} 넘침`).toBe(true);
  });
});

test.describe("Q2 [일시 실패 그대로]", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("500, 502 UPSTREAM_UNREACHABLE, 403 FORBIDDEN → 못 보냈어요 R+D, 방 열림 → 502 다시 보내기 201", async ({
    page,
  }) => {
    await start(page, "/");
    await openRoomById(page, ROOM_1);
    const a = await failOnce(page, 500, "오백 말");
    const b = await failOnce(page, 502, "프록시 말", "UPSTREAM_UNREACHABLE");
    const c = await failOnce(page, 403, "금지 말", "FORBIDDEN");
    for (const bubble of [a, b, c]) {
      await expectRetryAndRemove(bubble);
      await expect(bubble.getByRole("alert")).toContainText("못 보냈어요");
      for (const name of ["승인 상태 보기", "복사하기", "입력창으로"])
        await expect(button(bubble, name)).toHaveCount(0);
    }
    await expectWritable(page);
    await expect(closedNote(page)).toHaveCount(0);
    await retryOf(b).click();
    await waitSendsSettled(page, 4);
    expect((await requests(page, SEND_POST)).at(-1)?.status).toBe(201);
    await expect(serverBubbles(page, "프록시 말")).toHaveCount(1);
  });
});

test.describe("Q3 [polling 404는 방을 닫지 않는다]", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("messages after 404 → 입력창 쓸 수 있음, 안내 줄 0", async ({
    page,
  }) => {
    await start(page, "/");
    await openRoomById(page, ROOM_1);
    await chatMock(page, "fail", {
      op: "messages",
      page: "after",
      status: 404,
      times: 3,
    });
    await advance(page, POLL * 3);
    await expectWritable(page);
    await expect(closedNote(page)).toHaveCount(0);
    await composer(page).fill("그래도 쓸 말");
    await expect(button(page, "보내기")).toBeEnabled();
  });
});

test.describe("Q5 [대화 목록 왕복]", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("404 → 대화 목록 → 방 1 다시(말풍선 남음) 닫힘, 초안 그대로 → 지우고 떠났다 오면 열림", async ({
    page,
  }) => {
    await start(page, "/");
    await openRoomById(page, ROOM_1);
    await composer(page).fill("");
    const bubble = await failOnce(page, 404, "왕복 404 말");
    await expectReadOnly(page);
    /* 닫히기 전에 쓴 글이 아니면 칠 수 없다 — 초안은 보내기 직후 비어 있다. 목록 왕복에서 말풍선이 남는지 본다 */
    await closedNote(page)
      .getByRole("link", { name: "대화 목록", exact: true })
      .click();
    await expect(page).toHaveURL("/chats");
    await clientGo(page, `/chats/${ROOM_1}?from=/chats`);
    await expect(bubble).toBeVisible();
    await expectReadOnly(page);
    await expect(closedNote(page)).toBeVisible();
    await removeOf(bubble).click();
    await expect(bubble).toHaveCount(0);
    await expectReadOnly(page);
    await clientGo(page, `/chats/${ROOM_33}?from=/chats`);
    await clientGo(page, `/chats/${ROOM_1}?from=/chats`);
    await expectWritable(page);
    await expect(closedNote(page)).toHaveCount(0);
    expect(await count(page, SEND_POST)).toBe(1);
  });
});

test.describe("Q6 [승인 상태 보기 두 번]", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  /* 12-R2 회귀(QA가 브라우저로 3/3 재현, 수정 라운드 1에서 고침). 같은 틱 누름은 개발 spec "12-R2"가 본다 */
  test("빠르게 두 번 눌러도 초안에 거절된 글은 한 번", async ({ page }) => {
    await start(page, "/");
    await openRoomById(page, ROOM_1);
    const bubble = await failOnce(page, 403, "두번 403 말");
    await composer(page).fill("남길 초안");
    const target = button(bubble, "승인 상태 보기");
    /* 잡은 요소 증거(QA 규칙 8): 그 말풍선 안의 버튼 하나인지 */
    const caught = await target.evaluate((el) => ({
      tag: el.tagName,
      text: el.textContent,
      ac: el.getAttribute("data-ac"),
      pending: el.closest("[data-pending]")?.getAttribute("data-pending"),
      url: location.pathname,
    }));
    test.info().annotations.push({
      type: "caught",
      description: JSON.stringify(caught),
    });
    expect(caught).toEqual({
      tag: "BUTTON",
      text: "승인 상태 보기",
      ac: "12:S1-6 12:S1-8",
      pending: "failed",
      url: `/chats/${ROOM_1}`,
    });
    await target.dblclick();
    await expect.poll(() => storedDraft(page, BOMBOM, ROOM_1)).not.toBeNull();
    expect(await storedDraft(page, BOMBOM, ROOM_1)).toBe(
      "남길 초안\n두번 403 말",
    );
  });
});

test.describe("Q6b [입력창으로 두 번]", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("빠르게 두 번 눌러도 입력창엔 한 번(첫 누름이 말풍선을 뺀다)", async ({
    page,
  }) => {
    await start(page, "/");
    await openRoomById(page, ROOM_1);
    const bubble = await failOnce(page, 409, "두번 409 말");
    await composer(page).fill("남길 초안");
    await button(bubble, "입력창으로").dblclick();
    await expect(bubble).toHaveCount(0);
    await expect(composer(page)).toHaveValue("남길 초안\n두번 409 말");
  });
});

test.describe("Q8 [늦은 영구 거절이 재로그인 뒤 도착]", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  for (const status of [404, 403] as const) {
    test(`보내는 중 401 잠금 → 같은 계정 재로그인 → 늦은 ${status} → 영구 말풍선, 이동 0`, async ({
      page,
    }) => {
      await start(page, "/");
      await openRoomById(page, ROOM_1);
      await chatMock(page, "delay", { op: "send", ms: LATE * 10 });
      await chatMock(page, "fail", { op: "send", status });
      await sendText(page, `늦은 ${status} 말`);
      await expect.poll(() => count(page, SEND_POST)).toBe(1);
      await chatMock(page, "fail", {
        op: "messages",
        page: "after",
        status: 401,
      });
      await advance(page, POLL);
      await expect(lostAlert(page)).toBeVisible();
      const tab = await otherTabLogin(page, "bombom");
      await expect(lostAlert(page)).toHaveCount(0);
      await advance(page, LATE * 10);
      await waitSendsSettled(page, 1);
      const bubble = bubbleOf(page, `늦은 ${status} 말`);
      await expect(bubble.getByRole("alert")).toContainText(TEXT[status] ?? "");
      await expect(retryOf(bubble)).toHaveCount(0);
      await expect(page).toHaveURL(`/chats/${ROOM_1}?from=/chats`);
      await expect(lostAlert(page)).toHaveCount(0);
      if (status === 404) {
        await expectReadOnly(page);
        await expect(closedNote(page)).toBeVisible();
      } else {
        await expectWritable(page);
        await expect(button(bubble, "승인 상태 보기")).toBeVisible();
      }
      await tab.close();
    });
  }
});

test.describe("Q9 [클립보드 권한 거절]", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("CDP로 clipboard-write 거절 → 복사하기 → 복사 못 했어요", async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== "chromium", "CDP 권한 설정은 Chromium만");
    await start(page, "/");
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Browser.setPermission", {
      permission: { name: "clipboard-write" },
      setting: "denied",
    });
    await openRoomById(page, ROOM_1);
    const bubble = await failOnce(page, 404, "막힌 복사 말");
    await button(bubble, "복사하기").click();
    await expect(button(bubble, "복사 못 했어요")).toBeVisible();
    await expect(bubble).toContainText("막힌 복사 말");
  });
});

test.describe("Q10 [잠금 중 403]", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("늦은 403이 401 잠금 중 도착 → 승인 상태 보기 + 지우기, 다시 보내기 0", async ({
    page,
  }) => {
    await start(page, "/");
    await openRoomById(page, ROOM_1);
    await chatMock(page, "delay", { op: "send", ms: LATE * 10 });
    await chatMock(page, "fail", { op: "send", status: 403 });
    await sendText(page, "잠금 403 말");
    await expect.poll(() => count(page, SEND_POST)).toBe(1);
    await chatMock(page, "fail", {
      op: "messages",
      page: "after",
      status: 401,
    });
    await advance(page, POLL);
    await expect(lostAlert(page)).toBeVisible();
    await advance(page, LATE * 10);
    await waitSendsSettled(page, 1);
    const bubble = bubbleOf(page, "잠금 403 말");
    await expect(bubble.getByRole("alert")).toContainText(TEXT[403] ?? "");
    await expect(retryOf(bubble)).toHaveCount(0);
    await expect(button(bubble, "승인 상태 보기")).toBeVisible();
    await expect(removeOf(bubble)).toBeVisible();
    await expect(pendingBubbles(page)).toHaveCount(1);
    await expect(lostAlert(page)).toBeVisible();
  });
});

test.describe("Q11 [닫힌 방의 카드 담기, 12-N1 재현]", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  /* 12-N1 회귀(결정 11-09 23:45 ②, 수정 라운드 1에서 고침). 칩 잠금은 개발 spec "12-M1 ④"가 본다 */
  test("404로 닫힌 방 → 답 카드 장바구니에 담기도 잠김", async ({ page }) => {
    await start(page, "/");
    await openRoomById(page, ROOM_1);
    await failOnce(page, 404, "카드 404 말");
    await expectReadOnly(page);
    const add = page.getByRole("button", {
      name: "장바구니에 담기",
      exact: true,
    });
    const caught = await add.evaluate((el) => ({
      tag: el.tagName,
      text: el.textContent,
      inLog: el.closest('[role="log"]') !== null,
    }));
    test.info().annotations.push({
      type: "caught",
      description: JSON.stringify(caught),
    });
    await expect(add).toBeDisabled();
  });
});
