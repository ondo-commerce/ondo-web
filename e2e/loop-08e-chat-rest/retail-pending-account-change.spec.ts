import { expect, test, type Page } from "@playwright/test";
import { routeAuth } from "../loop-06b-retail-notify/helpers";
import { RETAILERS, type RetailerKey } from "../side-02/retail/stub-api";
import {
  addButton,
  assertStubServers,
  cards,
  CART_POST,
  chatMock,
  chatNav,
  composer,
  failCart,
  incoming,
  inquiryButton,
  log,
  openRoomById,
  READ_POST,
  requests,
  roomRow,
  ROOM_GET,
  SEND_POST,
  slowCart,
  start,
  useOwnCart,
} from "./helpers";
import {
  advance,
  capturePageErrors,
  clientGo,
  draftKeys,
  DRAFT_PREFIX,
  expectRetryAndRemove,
  failedBubbles,
  lastSettled,
  loginAs,
  lostAlert,
  pendingBubbles,
  pressLogout,
  recordTexts,
  resetSeen,
  ROOM_1,
  sendText,
  seenTexts,
  storedDraft,
} from "./pending-helpers";

/**
 * #362 상태표 행 "로그아웃(이 탭 버튼)"과 "다른 계정 로그인", 셸이 내려가는 전체 이동(기획 §4-1 표 A 전 열, 표 B 쓰던 글·보류
 * 말풍선 열). `pnpm e2e:stub`. A = bombom(소매처 1, 방 1), B = miso(소매처 2, 방 2). 로그아웃 → 로그인은 클라이언트 이동이라
 * QueryClient, 셸 outbox 모듈, 목 저장소가 산다 — 그래야 A의 늦은 응답이 B 화면에 닿는지 볼 수 있다. 목 "나"는 `me` 손잡이로 B로.
 * 지연은 30초로 걸고 B 화면이 뜬 뒤 페이지 시계를 밀어 부른다.
 */

assertStubServers();

const LATE = 30_000;
const B_ROOM = 2;
const A_FAILED = "A 못 간 말";
const A_DRAFT = "A 쓰던 글";
const A_SENDING = "A 가는 중인 말";

test.use({ viewport: { width: 1280, height: 800 } });

test.beforeEach(async ({ page }) => {
  await routeAuth(page);
});

/** 로그아웃 → `/login` → 목 "나"를 B로 → 기록 비움 → B 로그인 → B 방 */
async function switchToB(page: Page, key: RetailerKey = "miso") {
  await pressLogout(page);
  await expect(page).toHaveURL(/\/login$/);
  await chatMock(page, "me", { retailerId: RETAILERS[key].retailerId });
  await resetSeen(page);
  await loginAs(page, key);
  await chatNav(page).click();
  await expect(page).toHaveURL("/chats");
  await roomRow(page, B_ROOM).click();
  await expect(page).toHaveURL(`/chats/${B_ROOM}?from=/chats`);
  await expect(composer(page)).toBeVisible();
}

test.describe("S2-4 [로그아웃 → 다른 계정]", () => {
  test("① A 글 + 실패 말풍선 + 보내는 중 → 로그아웃 → B 방: A 글, 말풍선 0(DOM 기록), 1: 키 0", async ({
    page,
  }) => {
    await recordTexts(page, [A_FAILED, A_DRAFT, A_SENDING]);
    await start(page, "/");
    await openRoomById(page, ROOM_1);
    await chatMock(page, "fail", { op: "send", status: 500 });
    await sendText(page, A_FAILED);
    await expectRetryAndRemove(failedBubbles(page));
    await chatMock(page, "delay", { op: "send", ms: LATE });
    await sendText(page, A_SENDING);
    await composer(page).fill(A_DRAFT);
    await expect
      .poll(() => storedDraft(page, RETAILERS.bombom.retailerId, ROOM_1))
      .toBe(A_DRAFT);

    await switchToB(page);
    await advance(page, LATE);
    expect(await lastSettled(page, SEND_POST)).toBe(201);
    await advance(page, 2_000);
    expect(await seenTexts(page)).toEqual([]);
    await expect(pendingBubbles(page)).toHaveCount(0);
    expect(
      (await draftKeys(page)).filter((k) =>
        k.startsWith(`${DRAFT_PREFIX}${RETAILERS.bombom.retailerId}:`),
      ),
    ).toEqual([]);
  });

  for (const [label, status] of [
    ["201", null],
    ["500", 500],
    ["401", 401],
  ] as const) {
    test(`② A 보내기 늦은 ${label} → 로그아웃 → B → 도착 뒤 B 화면 보류 0, 끊김 0, A 본문 0, pageerror 0`, async ({
      page,
    }) => {
      const errors = capturePageErrors(page);
      await recordTexts(page, [A_SENDING]);
      await start(page, "/");
      await openRoomById(page, ROOM_1);
      if (status !== null) await chatMock(page, "fail", { op: "send", status });
      await chatMock(page, "delay", { op: "send", ms: LATE });
      await sendText(page, A_SENDING);
      await switchToB(page);
      await advance(page, LATE);
      expect(await lastSettled(page, SEND_POST)).toBe(status ?? 201);
      await advance(page, 2_000);
      await expect(pendingBubbles(page)).toHaveCount(0);
      await expect(lostAlert(page)).toHaveCount(0);
      await expect(log(page).getByText(A_SENDING)).toHaveCount(0);
      expect(await seenTexts(page)).toEqual([]);
      expect(errors).toEqual([]);
    });
  }

  /** B 화면 상태: 방 log 글, 헤더 장바구니 칸 글 */
  async function snapshotB(page: Page) {
    return {
      log: await log(page).innerText(),
      cart: await page
        .getByRole("link", { name: /장바구니/ })
        .first()
        .innerText(),
    };
  }

  /** 셸 refresh(RSC, prefetch 제외) 요청 수 */
  function countRefreshes(page: Page) {
    const seen = { n: 0 };
    page.on("request", (r) => {
      const h = r.headers();
      if (h["rsc"] === "1" && h["next-router-prefetch"] === undefined)
        seen.n += 1;
    });
    return seen;
  }

  test("③ 읽음 늦은 200 → 로그아웃 → B → 도착 뒤 B 방과 헤더 변화 0, 셸 refresh 0", async ({
    page,
  }) => {
    const refreshes = countRefreshes(page);
    await start(page, "/");
    await incoming(page, ROOM_1, "A가 읽을 도매 말");
    await chatMock(page, "delay", { op: "read", ms: LATE });
    await openRoomById(page, ROOM_1);
    await expect
      .poll(async () => (await requests(page, READ_POST)).at(-1)?.status)
      .toBeNull();
    const before = (await requests(page, READ_POST)).length;
    expect(before).toBeGreaterThan(0);
    await switchToB(page);
    const shot = await snapshotB(page);
    const refreshed = refreshes.n;
    await advance(page, LATE);
    await expect
      .poll(async () =>
        (await requests(page, READ_POST))
          .slice(0, before)
          .every((r) => r.status !== null),
      )
      .toBe(true);
    await advance(page, 2_000);
    expect(await snapshotB(page)).toEqual(shot);
    expect(refreshes.n).toBe(refreshed);
  });

  test("③ 방 머리 늦은 200 → 로그아웃 → B → 도착 뒤 B 방과 헤더 변화 0", async ({
    page,
  }) => {
    await start(page, "/");
    await chatMock(page, "delay", { op: "room", ms: LATE });
    await chatNav(page).click();
    await expect(page).toHaveURL("/chats");
    await roomRow(page, ROOM_1).click();
    await expect(page).toHaveURL(`/chats/${ROOM_1}?from=/chats`);
    await expect
      .poll(async () => (await requests(page, ROOM_GET)).at(-1)?.status)
      .toBeNull();
    await switchToB(page);
    const shot = await snapshotB(page);
    await advance(page, LATE);
    await advance(page, 2_000);
    expect(await snapshotB(page)).toEqual(shot);
  });

  test("③ 담기 늦은 201 → 로그아웃 → B → 도착 뒤 헤더 장바구니 숫자 변화 0, 셸 refresh 0", async ({
    page,
  }) => {
    const refreshes = countRefreshes(page);
    await useOwnCart(page);
    await start(page, "/");
    await openRoomById(page, ROOM_1);
    /* 담기는 가짜 API(3199) 서버 시계라 실제로 기다린다. B 방이 뜰 때까지보다 길게 */
    await slowCart(page, 8_000);
    await addButton(cards(page, 3002).first()).click();
    await switchToB(page);
    const shot = await snapshotB(page);
    const refreshed = refreshes.n;
    expect(await lastSettled(page, CART_POST, 15_000)).toBe(201);
    await advance(page, 2_000);
    expect(await snapshotB(page)).toEqual(shot);
    expect(refreshes.n).toBe(refreshed);
  });
});

test.describe("S2-9 [401 뒤 /login, 셸이 내려가는 전체 이동]", () => {
  test("① 문의하기 401 → /login → bombom → 방 1 초안 그대로, 실패 말풍선 0", async ({
    page,
  }) => {
    await start(page, "/");
    await openRoomById(page, ROOM_1);
    await chatMock(page, "fail", { op: "send", status: 500 });
    await sendText(page, A_FAILED);
    await expectRetryAndRemove(failedBubbles(page));
    await composer(page).fill(A_DRAFT);
    await expect
      .poll(() => storedDraft(page, RETAILERS.bombom.retailerId, ROOM_1))
      .toBe(A_DRAFT);
    await clientGo(page, "/products/11");
    await chatMock(page, "fail", { op: "create", status: 401 });
    await inquiryButton(page).click();
    await expect(page).toHaveURL(/\/login$/);
    await loginAs(page, "bombom");
    await openRoomById(page, ROOM_1);
    await expect(composer(page)).toHaveValue(A_DRAFT);
    await expect(pendingBubbles(page)).toHaveCount(0);
  });

  test("③ 상품 상세 장바구니 담기 401(채팅 밖) → /login → bombom → 초안 남음, 실패 말풍선 0", async ({
    page,
  }) => {
    await useOwnCart(page);
    await start(page, "/");
    await openRoomById(page, ROOM_1);
    await chatMock(page, "fail", { op: "send", status: 500 });
    await sendText(page, A_FAILED);
    await expectRetryAndRemove(failedBubbles(page));
    await composer(page).fill(A_DRAFT);
    await expect
      .poll(() => storedDraft(page, RETAILERS.bombom.retailerId, ROOM_1))
      .toBe(A_DRAFT);
    await clientGo(page, "/products/11");
    const qty = page.getByRole("textbox", { name: / 수량$/ }).first();
    await qty.fill("2");
    await expect(qty).toHaveValue("2");
    await failCart(page, 401);
    const add = page.getByRole("button", {
      name: "장바구니 담기",
      exact: true,
    });
    await expect(add).toBeEnabled();
    await add.click();
    await expect(page).toHaveURL(/\/login$/);
    await loginAs(page, "bombom");
    await openRoomById(page, ROOM_1);
    await expect(composer(page)).toHaveValue(A_DRAFT);
    await expect(pendingBubbles(page)).toHaveCount(0);
  });
});

test.describe("S2-10 [새로고침]", () => {
  test("실패 말풍선 + 초안 → 새로고침 → 말풍선 0, 초안 남음", async ({
    page,
  }) => {
    await start(page, "/");
    await openRoomById(page, ROOM_1);
    await chatMock(page, "fail", { op: "send", status: 500 });
    await sendText(page, A_FAILED);
    await expectRetryAndRemove(failedBubbles(page));
    await composer(page).fill(A_DRAFT);
    await expect
      .poll(() => storedDraft(page, RETAILERS.bombom.retailerId, ROOM_1))
      .toBe(A_DRAFT);
    await page.reload();
    await expect(composer(page)).toHaveValue(A_DRAFT);
    await expect(pendingBubbles(page)).toHaveCount(0);
  });
});
