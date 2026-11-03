import { expect, test, type Page } from "@playwright/test";
import { routeAuth } from "../loop-06b-retail-notify/helpers";
import {
  addButton,
  assertStubServers,
  cards,
  CART_POST,
  chatMock,
  composer,
  count,
  CREATE_POST,
  failCart,
  inquiryButton,
  log,
  openRoomById,
  requests,
  SEND_POST,
  slowCart,
  start,
  useOwnCart,
} from "./helpers";
import {
  advance,
  expectRemoveOnly,
  expectRetryAndRemove,
  expectWritable,
  failedBubbleAndDraft,
  failedBubbles,
  lastSettled,
  lostAlert,
  otherTabLogin,
  pendingBubbles,
  RELOGIN_ENTRY_TEXT,
  retryOf,
  ROOM_1,
  sendText,
  serverBubbles,
  waitSendsSettled,
} from "./pending-helpers";

/**
 * #362 상태표 행 "같은 계정 재로그인(다른 탭)"(기획 §4-1 표 A 보내기·담기 열, 표 B 방 만들기·쓰던 글·보류 말풍선 열).
 * `pnpm e2e:stub`. 탭 2에서 bombom(같은 소매처)이 다시 로그인하면 탭 1은 이동하지 않고 세션 세대만 올린다.
 *
 * 지연은 30초로 건다(기획 3초와 뜻이 같다: "응답이 재로그인 뒤에 온다"). 탭 2 로그인이 몇 초 걸려도 응답이 먼저
 * 오지 않게 길게 두고, 재로그인을 본 뒤 페이지 시계를 30초 밀어 응답을 부른다.
 */

assertStubServers();

const LATE = 30_000;

test.use({ viewport: { width: 1280, height: 800 } });

test.beforeEach(async ({ page }) => {
  await routeAuth(page);
});

test.describe("S2-6 [같은 계정 재로그인]", () => {
  test("① 쓰던 글 + 실패 말풍선(500) → 탭 2 bombom → 주소, 글, R+D 그대로 → 다시 보내기 201", async ({
    page,
  }) => {
    await start(page, "/");
    await failedBubbleAndDraft(page, "못 간 말", "쓰던 글", chatMock);
    const tab = await otherTabLogin(page, "bombom");

    await expect(page).toHaveURL(`/chats/${ROOM_1}?from=/chats`);
    await expect(composer(page)).toHaveValue("쓰던 글");
    const bubble = failedBubbles(page).filter({ hasText: "못 간 말" });
    await expectRetryAndRemove(bubble);
    await retryOf(bubble).click();
    await waitSendsSettled(page, 2);
    expect((await requests(page, SEND_POST)).map((r) => r.status)).toEqual([
      500, 201,
    ]);
    await expect(pendingBubbles(page)).toHaveCount(0);
    await expect(serverBubbles(page, "못 간 말")).toHaveCount(1);
    await tab.close();
  });

  for (const [label, status] of [
    ["(a) 201", null],
    ["(b) 500", 500],
    ["(c) 401", 401],
  ] as const) {
    test(`② 늦은 보내기 → 탭 2 bombom → 도착 ${label}`, async ({ page }) => {
      await start(page, "/");
      await openRoomById(page, ROOM_1);
      if (status !== null) await chatMock(page, "fail", { op: "send", status });
      await chatMock(page, "delay", { op: "send", ms: LATE });
      await sendText(page, "재로그인 넘긴 글");
      await expect(pendingBubbles(page)).toHaveAttribute(
        "data-pending",
        "sending",
      );
      const tab = await otherTabLogin(page, "bombom");
      await advance(page, LATE);
      expect(await lastSettled(page, SEND_POST)).toBe(status ?? 201);

      if (status === null) {
        await expect(pendingBubbles(page)).toHaveCount(0);
        await expect(serverBubbles(page, "재로그인 넘긴 글")).toHaveCount(1);
        await expect(log(page).getByText("보내는 중")).toHaveCount(0);
      } else {
        const bubble = failedBubbles(page);
        await expectRetryAndRemove(bubble);
        await expect(lostAlert(page)).toHaveCount(0);
        await expectWritable(page);
        await retryOf(bubble).click();
        await waitSendsSettled(page, 2);
        expect((await requests(page, SEND_POST)).at(-1)?.status).toBe(201);
        await expect(pendingBubbles(page)).toHaveCount(0);
        await expect(serverBubbles(page, "재로그인 넘긴 글")).toHaveCount(1);
      }
      await tab.close();
    });
  }

  test("③ 지금 세션 401 → 끊김, D → 탭 2 bombom → 풀림, R+D → 다시 보내기 201, 같은 키와 본문", async ({
    page,
  }) => {
    const sent: { key: string | null; body: unknown }[] = [];
    page.on("request", (r) => {
      if (
        r.method() === "POST" &&
        /\/chat\/rooms\/\d+\/messages$/.test(r.url())
      )
        sent.push({
          key: r.headers()["idempotency-key"] ?? null,
          body: r.postDataJSON(),
        });
    });
    await start(page, "/");
    await openRoomById(page, ROOM_1);
    await chatMock(page, "fail", { op: "send", status: 401 });
    await sendText(page, "끊긴 뒤 다시 보낼 글");
    await expect(lostAlert(page)).toBeVisible();
    await expectRemoveOnly(failedBubbles(page));

    const tab = await otherTabLogin(page, "bombom");
    await expect(lostAlert(page)).toHaveCount(0);
    await expectWritable(page);
    const bubble = failedBubbles(page);
    await expectRetryAndRemove(bubble);
    await retryOf(bubble).click();
    await waitSendsSettled(page, 2);
    expect((await requests(page, SEND_POST)).map((r) => r.status)).toEqual([
      401, 201,
    ]);
    await expect(pendingBubbles(page)).toHaveCount(0);
    await expect(serverBubbles(page, "끊긴 뒤 다시 보낼 글")).toHaveCount(1);
    expect(sent).toHaveLength(2);
    expect(sent[1]).toEqual(sent[0]);
    await tab.close();
  });
});

test.describe("S2-8 [같은 계정, 방 만들기]", () => {
  /** 상품 상세에서 `문의하기`. 응답은 `LATE` 뒤 */
  async function pressInquiry(page: Page, fail: boolean): Promise<void> {
    await start(page, "/products/11");
    await expect(inquiryButton(page)).toBeVisible();
    if (fail) await chatMock(page, "fail", { op: "create", status: 401 });
    await chatMock(page, "delay", { op: "create", ms: LATE });
    await inquiryButton(page).click();
    await expect(inquiryButton(page)).toBeHidden();
  }

  test("① 늦은 401 + 탭 2 bombom → /login 아님, 입구 문구, 문의하기 켜짐 → 누름 → POST 2, 방 열림", async ({
    page,
  }) => {
    await pressInquiry(page, true);
    const tab = await otherTabLogin(page, "bombom");
    await advance(page, LATE);
    expect(await lastSettled(page, CREATE_POST)).toBe(401);

    const alert = page
      .getByRole("alert")
      .filter({ hasText: RELOGIN_ENTRY_TEXT });
    await expect(alert).toBeVisible();
    await expect(page).toHaveURL("/products/11");
    await expect(inquiryButton(page)).toBeEnabled();
    await inquiryButton(page).click();
    await expect(page).toHaveURL(/\/chats\/\d+\?from=\/products\/11$/);
    expect(await count(page, CREATE_POST)).toBe(2);
    await tab.close();
  });

  test("② 늦은 401 + 탭 2 miso → 이 탭 로그인 화면, 입구 문구 0", async ({
    page,
  }) => {
    await pressInquiry(page, true);
    const tab = await otherTabLogin(page, "miso");
    await expect(page).toHaveURL(/\/login$/);
    await expect(
      page.getByRole("alert").filter({ hasText: RELOGIN_ENTRY_TEXT }),
    ).toHaveCount(0);
    await tab.close();
  });

  test("③ 재로그인 없이 늦은 401 → /login(기존)", async ({ page }) => {
    await pressInquiry(page, true);
    await advance(page, LATE);
    await expect(page).toHaveURL(/\/login$/);
  });

  test("④ 늦은 201 + 탭 2 bombom → 방으로 이동", async ({ page }) => {
    await pressInquiry(page, false);
    const tab = await otherTabLogin(page, "bombom");
    await advance(page, LATE);
    await expect(page).toHaveURL(/\/chats\/\d+\?from=\/products\/11$/);
    expect(await count(page, CREATE_POST)).toBe(1);
    await tab.close();
  });
});

test.describe("S2-14 ② [같은 계정, 담기]", () => {
  test("담기 지연 + 401 → 탭 2 bombom → 도착 → 잠금 0, 담기 버튼 다시 켜짐", async ({
    page,
  }) => {
    await useOwnCart(page);
    await start(page, "/");
    await openRoomById(page, ROOM_1);
    const card = cards(page, 3002).first();
    await expect(addButton(card)).toBeEnabled();
    await failCart(page, 401);
    /* 담기는 가짜 API(3199) 서버 시계라 실제로 기다린다. 탭 2 로그인보다 길게 */
    await slowCart(page, 6_000);
    await addButton(card).click();
    await expect(addButton(card)).toHaveText("담는 중");
    const tab = await otherTabLogin(page, "bombom");
    expect(await lastSettled(page, CART_POST, 10_000)).toBe(401);
    await expect(addButton(card)).toHaveText("장바구니에 담기");
    await expect(addButton(card)).toBeEnabled();
    await expect(lostAlert(page)).toHaveCount(0);
    await expectWritable(page);
    await tab.close();
  });
});
