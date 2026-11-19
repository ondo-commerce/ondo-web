import { expect, test, type Page } from "@playwright/test";
import { routeAuth } from "../loop-06b-retail-notify/helpers";
import { RETAILERS } from "../side-02/retail/stub-api";
import {
  assertStubServers,
  chatMock,
  composer,
  exposeQueryClient,
  inquiryButton,
  log,
  loginAs,
  openRoomById,
  setVisibility,
  signIn,
  start,
} from "./helpers";

/**
 * #361 소매 쓰던 글 기억(기획 §4-2 1~6, §6 S2-2 S2-5 S2-9 ②). `pnpm e2e:stub`.
 *
 * 키는 `ondo.chat.draft.v1:<소매처 id>:<방 id>`(sessionStorage). 소매처 1 = bombom, 2 = miso. 셸 `/me`는 가짜 API(3199)가
 * 주고, 로그인과 로그아웃은 브라우저 요청을 가로챈다(`routeAuth`). 방 1(무드온), 33(라온)은 목 시드 방이다.
 *
 * 저장 시점은 페이지 시계를 멈춰 잰다(`page.clock.pauseAt` + `runFor`). 멈춘 동안 300ms 타이머는 돌지 않으니, 그때 값이
 * 있으면 떠나는 순간의 즉시 저장 덕이다. 고정 대기(`waitForTimeout`)는 쓰지 않는다.
 */

assertStubServers();

const ROOM_1 = 1;
const ROOM_33 = 33;
const TEXT = "레드 L 몇 장 돼요";
const PREFIX = "ondo.chat.draft.v1:";
const keyOf = (retailerId: number, roomId: number) =>
  `${PREFIX}${retailerId}:${roomId}`;
const A = RETAILERS.bombom.retailerId;

function draftKeys(page: Page): Promise<string[]> {
  return page.evaluate(
    (prefix) =>
      Object.keys(sessionStorage)
        .filter((k) => k.startsWith(prefix))
        .sort(),
    PREFIX,
  );
}

function stored(page: Page, key: string): Promise<string | null> {
  return page.evaluate((k) => sessionStorage.getItem(k), key);
}

/** 커서(선택 범위)가 글 끝에 있나 */
function cursorAtEnd(page: Page): Promise<boolean> {
  return composer(page).evaluate(
    (el) =>
      el instanceof HTMLTextAreaElement &&
      el.selectionStart === el.value.length &&
      el.selectionEnd === el.value.length,
  );
}

/** 시계를 멈춘다(지금 + 50ms). 300ms 저장 타이머보다 짧아 그 타이머는 안 돈다. 풀 때는 `page.clock.resume()` */
async function holdTimers(page: Page): Promise<void> {
  const now = await page.evaluate(() => Date.now());
  await page.clock.pauseAt(new Date(now + 50));
}

async function typeInRoom(page: Page, text: string): Promise<void> {
  await composer(page).fill(text);
  await expect(composer(page)).toHaveValue(text);
}

/** 클라이언트 이동(목 상태가 산다). 같은 라우트 안 방 이동을 만든다 — 알림 링크와 같은 경로 */
async function clientGo(page: Page, path: string): Promise<void> {
  await page.evaluate((p) => {
    (
      window as unknown as { next: { router: { push: (p: string) => void } } }
    ).next.router.push(p);
  }, path);
  await expect(page).toHaveURL(path);
}

/** A로 방 1에 글을 쓰고 저장까지(300ms 타이머) 기다린다 */
async function draftInRoom1(page: Page): Promise<void> {
  await openRoomById(page, ROOM_1);
  await typeInRoom(page, TEXT);
  await expect.poll(() => stored(page, keyOf(A, ROOM_1))).toBe(TEXT);
}

for (const viewport of [
  { width: 390, height: 844 },
  { width: 1280, height: 800 },
]) {
  test.describe(`S2-2 [방 화면 전환, 쓰던 글] ${viewport.width}`, () => {
    test.use({ viewport });

    test("① 방 1 글 → /chats → 방 33 빈칸 → 방 1 글 그대로, 커서 끝 ② 새로고침 그대로 ③ 보내면 방 왕복 뒤 빈칸", async ({
      page,
    }) => {
      await start(page, "/");
      await openRoomById(page, ROOM_1);
      await typeInRoom(page, TEXT);

      await test.step("① 방 33 빈칸 → 방 1 글, 커서 글 끝", async () => {
        await openRoomById(page, ROOM_33);
        await expect(composer(page)).toHaveValue("");
        await openRoomById(page, ROOM_1);
        await expect(composer(page)).toHaveValue(TEXT);
        await expect(composer(page)).toBeFocused();
        expect(await cursorAtEnd(page)).toBe(true);
      });

      await test.step("② 새로고침 → 그대로", async () => {
        await page.reload();
        await expect(composer(page)).toHaveValue(TEXT);
        expect(await cursorAtEnd(page)).toBe(true);
      });

      await test.step("③ 보냄 → 방 33 → 방 1 → 빈칸, 키 0", async () => {
        await composer(page).press("Enter");
        await expect(composer(page)).toHaveValue("");
        await expect(log(page).getByText(TEXT)).toBeVisible();
        await openRoomById(page, ROOM_33);
        await openRoomById(page, ROOM_1);
        await expect(composer(page)).toHaveValue("");
        expect(await stored(page, keyOf(A, ROOM_1))).toBeNull();
      });
    });

    test("④ 같은 라우트 안 방 1 → 방 33 빈칸, 1:33 키 0 → 뒤로 → 방 1 글 그대로", async ({
      page,
    }) => {
      await start(page, "/");
      await openRoomById(page, ROOM_1);
      await typeInRoom(page, TEXT);
      await clientGo(page, `/chats/${ROOM_33}`);
      await expect(composer(page)).toBeVisible();
      await expect(composer(page)).toHaveValue("");
      expect(await stored(page, keyOf(A, ROOM_33))).toBeNull();
      expect(await draftKeys(page)).toEqual([keyOf(A, ROOM_1)]);
      await page.goBack();
      await expect(page).toHaveURL(`/chats/${ROOM_1}?from=/chats`);
      await expect(composer(page)).toHaveValue(TEXT);
    });
  });
}

test.describe("S2-2 ⑤ 저장 시점 1280", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("입력 뒤 200ms 안에 값 없음, 400ms 뒤 있음", async ({ page }) => {
    await start(page, "/");
    await openRoomById(page, ROOM_1);
    await holdTimers(page);
    await typeInRoom(page, TEXT);
    await page.clock.runFor(200);
    expect(await stored(page, keyOf(A, ROOM_1))).toBeNull();
    await page.clock.runFor(200);
    expect(await stored(page, keyOf(A, ROOM_1))).toBe(TEXT);
    await page.clock.resume();
  });

  test("입력 직후 visibilitychange hidden → 바로 있음", async ({ page }) => {
    await start(page, "/");
    await openRoomById(page, ROOM_1);
    await holdTimers(page);
    await typeInRoom(page, TEXT);
    expect(await stored(page, keyOf(A, ROOM_1))).toBeNull();
    await setVisibility(page, "hidden");
    expect(await stored(page, keyOf(A, ROOM_1))).toBe(TEXT);
    await setVisibility(page, "visible");
    await page.clock.resume();
  });

  test("입력 직후 pagehide → 바로 있음", async ({ page }) => {
    await start(page, "/");
    await openRoomById(page, ROOM_1);
    await holdTimers(page);
    await typeInRoom(page, TEXT);
    expect(await stored(page, keyOf(A, ROOM_1))).toBeNull();
    await page.evaluate(() => window.dispatchEvent(new Event("pagehide")));
    expect(await stored(page, keyOf(A, ROOM_1))).toBe(TEXT);
    await page.clock.resume();
  });

  test("/me에 retailerId 없음 → 저장 0(400ms, hidden, pagehide 뒤에도), 방 왕복 뒤 빈칸", async ({
    page,
  }) => {
    const url = test.info().project.use.baseURL ?? "http://localhost:3101";
    await page
      .context()
      .addCookies([{ name: "stub_me", value: "no-retailer-id", url }]);
    await start(page, "/");
    await openRoomById(page, ROOM_1);
    await holdTimers(page);
    await typeInRoom(page, TEXT);
    await page.clock.runFor(400);
    await setVisibility(page, "hidden");
    await page.evaluate(() => window.dispatchEvent(new Event("pagehide")));
    await setVisibility(page, "visible");
    await page.clock.resume();
    expect(await draftKeys(page)).toEqual([]);
    await openRoomById(page, ROOM_33);
    await openRoomById(page, ROOM_1);
    await expect(composer(page)).toHaveValue("");
    expect(await draftKeys(page)).toEqual([]);
  });
});

test.describe("S2-5 [다른 계정, 다른 탭] 1280", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("탭 1 A 방 1 글 + 실패 말풍선 → 탭 2 B 로그인 → 탭 1 로그인 화면, 1: 키 0 → 탭 1 A 재로그인 → 방 1 글 0", async ({
    page,
  }) => {
    await routeAuth(page);
    await start(page, "/");
    await draftInRoom1(page);
    await chatMock(page, "fail", { op: "send", status: 500 });
    await typeInRoom(page, "못 보낼 말");
    await composer(page).press("Enter");
    await expect(log(page).locator('[data-pending="failed"]')).toHaveCount(1);
    await typeInRoom(page, TEXT);
    await expect.poll(() => stored(page, keyOf(A, ROOM_1))).toBe(TEXT);

    const tab = await page.context().newPage();
    await tab.goto("/login");
    await loginAs(tab, "miso");

    await page.bringToFront();
    await expect(page).toHaveURL(/\/login$/);
    expect(
      (await draftKeys(page)).filter((k) => k.startsWith(`${PREFIX}${A}:`)),
    ).toEqual([]);

    await loginAs(page, "bombom");
    expect(await draftKeys(page)).toEqual([]);
    await openRoomById(page, ROOM_1);
    await expect(composer(page)).toHaveValue("");
    await expect(log(page).locator("[data-pending]")).toHaveCount(0);
    await tab.close();
  });
});

test.describe("S2-9 ② [401 뒤 /login] 1280", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  /** 방 1 글 → 상품 상세 `문의하기` 401 → `/login`. 그 사이 글은 지우지 않는다(D28) */
  async function draftThenLost(page: Page): Promise<void> {
    await routeAuth(page);
    await start(page, "/");
    await draftInRoom1(page);
    await clientGo(page, "/products/11");
    await expect(inquiryButton(page)).toBeVisible();
    await chatMock(page, "fail", { op: "create", status: 401 });
    await inquiryButton(page).click();
    await expect(page).toHaveURL(/\/login$/);
    expect(await stored(page, keyOf(A, ROOM_1))).toBe(TEXT);
  }

  test("R6 같은 계정 bombom으로 로그인 → 1:1 글 그대로, 방 1 입력창 글. 순서: 초안 정리 → 채팅 캐시 정리 → 방송 → 이동", async ({
    page,
  }) => {
    await draftThenLost(page);
    await exposeQueryClient(page);
    /* 로그인 화면의 네 지점을 일어난 순서로 적는다. 초안 정리 = 세대 칸 쓰기(`keepOnly`), 채팅 캐시 정리 =
       `runSessionChange`의 chat 쿼리 지우기, 방송 = BroadcastChannel, 이동 = 홈으로 가는 history 기록 */
    await page.evaluate(() => {
      const events: string[] = [];
      const w = window as unknown as Record<string, unknown>;
      w.__loginOrder = events;
      const setItem = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key: string, value: string) {
        if (key === "ondo.chat.draft-meta.v1") events.push("drafts");
        return setItem.call(this, key, value);
      };
      const client = w.__ondoQueryClient as {
        removeQueries: (f?: { queryKey?: readonly unknown[] }) => void;
      };
      const removeQueries = client.removeQueries.bind(client);
      client.removeQueries = (filters) => {
        if (filters?.queryKey?.[0] === "chat") events.push("chat-cache");
        removeQueries(filters);
      };
      const post = BroadcastChannel.prototype.postMessage;
      BroadcastChannel.prototype.postMessage = function (message: unknown) {
        events.push("broadcast");
        post.call(this, message);
      };
      for (const name of ["pushState", "replaceState"] as const) {
        const original = history[name].bind(history);
        history[name] = (
          data: unknown,
          unused: string,
          url?: string | URL | null,
        ) => {
          if (url != null && new URL(url, location.href).pathname === "/")
            events.push("navigate");
          original(data, unused, url);
        };
      }
    });
    await loginAs(page, "bombom");
    const events = await page.evaluate(
      () => (window as unknown as { __loginOrder?: string[] }).__loginOrder,
    );
    /* 같은 문서에서 이동했다 — 기록이 남아 있어야 순서를 볼 수 있다 */
    expect(events).toBeDefined();
    /* 넷 다 있고, 처음 일어난 자리가 이 순서다 */
    const at = ["drafts", "chat-cache", "broadcast", "navigate"].map(
      (name) => events?.indexOf(name) ?? -1,
    );
    expect(
      at.every((i, n) => i >= 0 && i > (at[n - 1] ?? -1)),
      JSON.stringify(events),
    ).toBe(true);

    expect(await stored(page, keyOf(A, ROOM_1))).toBe(TEXT);
    await openRoomById(page, ROOM_1);
    await expect(composer(page)).toHaveValue(TEXT);
  });

  test("miso로 로그인 → 1: 키 0, 방 1 입력창 빈칸", async ({ page }) => {
    await draftThenLost(page);
    await loginAs(page, "miso");
    expect(
      (await draftKeys(page)).filter((k) => k.startsWith(`${PREFIX}${A}:`)),
    ).toEqual([]);
    await openRoomById(page, ROOM_1);
    await expect(composer(page)).toHaveValue("");
  });

  test("로그인 응답 retailerId 없음 → 초안 키 전부 0, 첫 방 화면 입력창 빈칸", async ({
    page,
  }) => {
    await draftThenLost(page);
    /* 다른 소매처 키도 하나 둔다 — "전부"를 보려고 */
    await page.evaluate(
      (k) => sessionStorage.setItem(k, "다른 소매처 글"),
      keyOf(RETAILERS.miso.retailerId, 5),
    );
    expect(await draftKeys(page)).toHaveLength(2);
    /* page 경로가 context 경로(`routeAuth`)보다 먼저 받는다. 칸만 빼고 나머지는 같다 */
    await page.route("**/api/retail/auth/login", async (route) => {
      await signIn(page, "bombom");
      const { email, shopName, approvalStatus } = RETAILERS.bombom;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            email,
            shopName,
            approvalStatus,
            appliedAt: "2026-10-01T01:05:00Z",
            approvedAt: "2026-10-02T01:00:00Z",
            rejection: null,
          },
        }),
      });
    });
    await loginAs(page, "bombom");
    expect(await draftKeys(page)).toEqual([]);
    await openRoomById(page, ROOM_1);
    await expect(composer(page)).toHaveValue("");
  });
});
