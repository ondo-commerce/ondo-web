import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  chatLink,
  chatRows,
  composer,
  enterChats,
  frames,
  installClock,
  keyOf,
  knob,
  ME,
  note,
  openRoomReady,
  pendingBubbles,
  requests,
  ROOMS_GET,
  roomTitle,
  SEND_POST,
  sendFromOtherDevice,
  settled,
  signIn,
  storedDraft,
  watchRequests,
} from "./helpers";

/**
 * loop-08h S2(#387) 헤더 `답 필요` 배지 → 답 필요 목록(01-plan §4-2, §6 S2, D55 Q1 ① Q2 ①).
 *
 * 시드 `rooms-70`(08b): 내 방 70개, 방 id = 100 + i, 이름 "소매처 i". 답 필요 = 4의 배수 17개(104~168),
 * 안 읽음 = 홀수 35개. 방 101(소매처 1)은 안 읽음이지만 답 필요가 아니다. `rooms: 4`를 같이 주면 최근 4개
 * (101~104)만 남아 답 필요가 104 하나다.
 *
 * 같은 라우트 안 주소 변화 계약(§4-2 표): 칩, 검색 = `replaceState`(재마운트 0), 헤더 배지 = push(주소를 따름,
 * 검색칸 재마운트 1회, 포커스 안 옮김), 뒤로, 앞으로 = popstate(재마운트 1회).
 */

const NEEDS = "/chats?filter=NEEDS_REPLY";
const NEEDS_URL = /\/chats\?filter=NEEDS_REPLY$/;
const SEARCH = "소매처 이름 검색";
const SEARCH_SELECTOR = `input[aria-label="${SEARCH}"]`;
const PICK = "왼쪽 목록에서 대화를 고르세요";
const NO_MATCH = "조건에 맞는 대화가 없어요";
const COUNT_GET = {
  path: /\/api\/wholesale\/notifications\/unread-count(\?|$)/,
  method: "GET",
} as const;

function search(page: Page): Locator {
  return page.getByRole("searchbox", { name: SEARCH });
}

function chip(page: Page, name: string): Locator {
  return page
    .getByRole("radiogroup", { name: "대화 필터" })
    .getByRole("radio", { name, exact: true });
}

function listRegion(page: Page): Locator {
  return page.getByRole("region", { name: "대화 목록", exact: true });
}

/** 헤더 채팅 링크의 숫자 알약 */
function badge(page: Page): Locator {
  return chatLink(page).locator('[data-ac="S11-2 S11-15"]');
}

/** `/__mock/notifications/*` 손잡이(알림 목). 채팅 `knob`은 `/__mock/chat/`만 부른다 */
async function notificationKnob(
  page: Page,
  path: string,
  body: Record<string, unknown>,
): Promise<void> {
  const status = await page.evaluate(
    async ({ path, body }) =>
      (
        await fetch(`/__mock/notifications/${path}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        })
      ).status,
    { path, body },
  );
  expect(status, `손잡이 notifications/${path}`).toBe(200);
}

/** 요청 감시 + 시계 → 로그인 화면 → reset → `before` → 로그인 → `/dashboard`(클라이언트 이동, 목 상태가 산다) */
async function enterDashboard(
  page: Page,
  options: {
    seed?: string;
    rooms?: number;
    before?: (page: Page) => Promise<void>;
  } = {},
): Promise<void> {
  await watchRequests(page);
  await installClock(page);
  await page.goto("/login");
  await expect(page.getByText("도매 사장님 로그인")).toBeVisible();
  const body: Record<string, unknown> = {};
  if (options.seed !== undefined) body.seed = options.seed;
  if (options.rooms !== undefined) body.rooms = options.rooms;
  await knob(page, "reset", body);
  await options.before?.(page);
  await signIn(page, ME);
}

/** 목록 요청의 조건(요청 시점 URL). `from`번째 요청부터 */
async function roomListCalls(page: Page, from = 0) {
  return (await requests(page, ROOMS_GET)).slice(from).map((r) => {
    const url = new URL(r.url, "http://localhost");
    return {
      filter: url.searchParams.get("filter"),
      q: url.searchParams.get("q"),
      cursor: url.searchParams.get("cursor"),
      status: r.status,
    };
  });
}

async function roomListCount(page: Page): Promise<number> {
  return (await requests(page, ROOMS_GET)).length;
}

/** 배지가 n건을 보이고 링크가 필터로 간다 */
async function expectBadge(page: Page, n: number): Promise<void> {
  await expect(chatLink(page)).toHaveAccessibleName(`채팅, 답 필요 ${n}건`);
  await expect(badge(page)).toHaveText(n > 99 ? "99+" : String(n));
  await expect(chatLink(page)).toHaveAttribute("href", NEEDS);
}

/** 배지 없음: 아이콘은 있고 이름 "채팅", 링크는 `/chats` */
async function expectNoBadge(page: Page): Promise<void> {
  await expect(chatLink(page)).toBeVisible();
  await expect(chatLink(page)).toHaveAccessibleName("채팅");
  await expect(badge(page)).toHaveCount(0);
  await expect(chatLink(page)).toHaveAttribute("href", "/chats");
}

/**
 * 검색칸 재마운트 세기. 지금 검색칸을 핸들로 쥐고, 그 뒤 DOM에 새로 들어온 검색칸 수를 MutationObserver로 센다.
 * `ListFilterBar`가 `key`로 다시 마운트되면 옛 칸이 빠지고 새 칸이 들어온다
 */
async function watchSearchMounts(page: Page): Promise<void> {
  await page.evaluate((selector) => {
    const w = window as unknown as {
      __searchEl: Element | null;
      __searchMounts: number;
      __searchObserver?: MutationObserver;
    };
    w.__searchObserver?.disconnect();
    w.__searchEl = document.querySelector(selector);
    w.__searchMounts = 0;
    w.__searchObserver = new MutationObserver((records) => {
      for (const r of records)
        for (const n of r.addedNodes)
          if (
            n instanceof Element &&
            (n.matches(selector) || n.querySelector(selector) !== null)
          )
            w.__searchMounts += 1;
    });
    w.__searchObserver.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }, SEARCH_SELECTOR);
}

async function searchState(page: Page) {
  return page.evaluate((selector) => {
    const w = window as unknown as {
      __searchEl: Element | null;
      __searchMounts: number;
    };
    const now = document.querySelectorAll(selector);
    return {
      mounts: w.__searchMounts,
      sameHandle: w.__searchEl !== null && w.__searchEl.isConnected,
      boxes: now.length,
      focusInSearch:
        document.activeElement !== null &&
        document.activeElement.matches(selector),
      historyLength: window.history.length,
    };
  }, SEARCH_SELECTOR);
}

/** 목록 스켈레톤(`role=status` "불러오는 중")이 지금부터 몇 번 DOM에 들어오나 */
async function watchSkeletons(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as { __skeletons: number };
    w.__skeletons = 0;
    const selector = '[role="status"][aria-label="불러오는 중"]';
    new MutationObserver((records) => {
      for (const r of records)
        for (const n of r.addedNodes)
          if (
            n instanceof Element &&
            (n.matches(selector) || n.querySelector(selector) !== null)
          )
            w.__skeletons += 1;
    }).observe(document.body, { childList: true, subtree: true });
  });
}

function skeletons(page: Page): Promise<number> {
  return page.evaluate(
    () => (window as unknown as { __skeletons: number }).__skeletons,
  );
}

/** 칩이 눌렸다(Radix ToggleGroup single이라 radio aria-checked) */
async function expectChip(page: Page, name: string): Promise<void> {
  await expect(chip(page, name)).toHaveAttribute("aria-checked", "true");
}

/** 검색어를 한 글자씩 치고 300ms 뒤 주소에 `q`가 적힐 때까지 */
async function typeSearch(page: Page, text: string): Promise<void> {
  await search(page).click();
  await search(page).pressSequentially(text);
  await expect.poll(() => new URL(page.url()).searchParams.get("q")).toBe(text);
}

test.describe("S2 헤더 답 필요 배지 → 답 필요 목록", () => {
  test("S2-2 1280 대시보드, rooms-70 배지 17 → 누름 → 주소, 칩 답 필요, GET filter=NEEDS_REPLY만, 행 17 전부 답 필요, 고르세요", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await enterDashboard(page, { seed: "rooms-70" });
    await expectBadge(page, 17);
    const base = await roomListCount(page);
    await chatLink(page).click();
    await expect(page).toHaveURL(NEEDS_URL);
    await expectChip(page, "답 필요");
    await expect(chatRows(page)).toHaveCount(17);
    await expect(
      chatRows(page).filter({
        has: page.locator('[data-ac="S2-2"]', { hasText: "답 필요" }),
      }),
    ).toHaveCount(17);
    await settled(page, ROOMS_GET);
    const calls = await roomListCalls(page, base);
    note("S2-2 rooms GET", calls);
    expect(
      calls.filter((c) => c.filter === "NEEDS_REPLY").length,
    ).toBeGreaterThanOrEqual(1);
    expect(calls.filter((c) => c.filter === null)).toHaveLength(0);
    await expect(page.getByText(PICK)).toBeVisible();
  });

  test("S2-6 ① 첫 count 500 → 아이콘 있음, 배지 0, href /chats", async ({
    page,
  }) => {
    await enterDashboard(page, {
      seed: "rooms-70",
      before: (p) =>
        notificationKnob(p, "fail", { op: "count", status: 500, times: 1 }),
    });
    await expect
      .poll(() => requests(page, COUNT_GET).then((r) => r.length))
      .toBeGreaterThan(0);
    await settled(page, COUNT_GET);
    expect((await requests(page, COUNT_GET)).at(-1)?.status).toBe(500);
    await expectNoBadge(page);
  });

  test("S2-6 ② ok 17 뒤 다음 count 500(시계 30초) → 배지 사라짐, href /chats", async ({
    page,
  }) => {
    await enterDashboard(page, { seed: "rooms-70" });
    await expectBadge(page, 17);
    await settled(page, COUNT_GET);
    const before = (await requests(page, COUNT_GET)).length;
    await notificationKnob(page, "fail", {
      op: "count",
      status: 500,
      times: 1,
    });
    await page.clock.fastForward(30_000);
    await expect
      .poll(() => requests(page, COUNT_GET).then((r) => r.length))
      .toBeGreaterThan(before);
    await settled(page, COUNT_GET);
    expect((await requests(page, COUNT_GET)).at(-1)?.status).toBe(500);
    await expectNoBadge(page);
  });

  test("S2-6 ③ ok 1 뒤 다른 기기가 그 방에 답함(count 안 돎) → 배지 1인 채 누름 → 필터, 조건에 맞는 대화가 없어요 + 조건 지우기", async ({
    page,
  }) => {
    await enterDashboard(page, { seed: "rooms-70", rooms: 4 });
    await expectBadge(page, 1);
    const counts = (await requests(page, COUNT_GET)).length;
    await sendFromOtherDevice(page, 104, "다른 기기에서 답했어요");
    await expectBadge(page, 1);
    await chatLink(page).click();
    await expect(page).toHaveURL(NEEDS_URL);
    await expectChip(page, "답 필요");
    await expect(listRegion(page).getByText(NO_MATCH)).toBeVisible();
    await expect(
      listRegion(page).getByRole("button", { name: "조건 지우기" }),
    ).toBeVisible();
    expect(
      (await requests(page, COUNT_GET)).length,
      "누를 때까지 count는 안 돌았다",
    ).toBe(counts);
  });

  test("S2-8 이미 /chats?filter=NEEDS_REPLY에서 배지 → 칩, 행, 스크롤 그대로, 스켈레톤 0, 추가 GET ≤ 1", async ({
    page,
  }) => {
    await enterChats(page, { seed: "rooms-70" });
    await chip(page, "답 필요").click();
    await expect(page).toHaveURL(NEEDS_URL);
    await expect(chatRows(page)).toHaveCount(17);
    await expectBadge(page, 17);
    await settled(page, ROOMS_GET);
    const scroller = listRegion(page).locator("div.scroll-slim");
    await scroller.evaluate((el) => {
      el.scrollTop = 200;
    });
    await expect
      .poll(() => scroller.evaluate((el) => el.scrollTop))
      .toBeGreaterThan(0);
    const scrollBefore = await scroller.evaluate((el) => el.scrollTop);
    const idsBefore = await chatRows(page).evaluateAll((nodes) =>
      nodes.map((n) => (n as HTMLElement).dataset.roomId),
    );
    await watchSkeletons(page);
    await watchSearchMounts(page);
    const base = await roomListCount(page);

    await chatLink(page).click();
    await expect(page).toHaveURL(NEEDS_URL);
    await frames(page);
    await frames(page);
    await settled(page, ROOMS_GET);
    const extra = (await roomListCount(page)) - base;
    note("S2-8 추가 rooms GET", extra);
    await expectChip(page, "답 필요");
    expect(
      await chatRows(page).evaluateAll((nodes) =>
        nodes.map((n) => (n as HTMLElement).dataset.roomId),
      ),
    ).toEqual(idsBefore);
    expect(await scroller.evaluate((el) => el.scrollTop)).toBe(scrollBefore);
    expect(await skeletons(page), "스켈레톤 0").toBe(0);
    expect(extra, "추가 목록 GET ≤ 1").toBeLessThanOrEqual(1);
    expect((await searchState(page)).mounts, "같은 조건이라 재마운트 0").toBe(
      0,
    );
  });

  test("S2-9 ① 배지로 온 주소 새로고침 → 주소, 칩 그대로 ② 시계 15초 → 재조회 GET filter=NEEDS_REPLY", async ({
    page,
  }) => {
    await enterDashboard(page, { seed: "rooms-70" });
    await expectBadge(page, 17);
    await chatLink(page).click();
    await expect(page).toHaveURL(NEEDS_URL);
    await expectChip(page, "답 필요");

    await page.reload();
    await expect(page).toHaveURL(NEEDS_URL);
    await expectChip(page, "답 필요");
    await expect(chatRows(page).first()).toBeVisible();
    await settled(page, ROOMS_GET);

    const before = await roomListCount(page);
    await page.clock.fastForward(15_000);
    await expect.poll(() => roomListCount(page)).toBeGreaterThan(before);
    const calls = await roomListCalls(page, before);
    note("S2-9 ② rooms GET", calls);
    expect(calls.every((c) => c.filter === "NEEDS_REPLY")).toBe(true);
  });

  test("S2-9 ③ 배지 → 행 104 열고 답 보냄 → 재조회 뒤 행 104 빠짐, 방 104와 room=104 그대로", async ({
    page,
  }) => {
    await enterDashboard(page, { seed: "rooms-70" });
    await expectBadge(page, 17);
    await chatLink(page).click();
    await expect(page).toHaveURL(NEEDS_URL);
    await expect(chatRows(page)).toHaveCount(17);
    await openRoomReady(page, 104);
    await expect(page).toHaveURL(/\/chats\?filter=NEEDS_REPLY&room=104$/);
    const before = await roomListCount(page);
    await composer(page).fill("내일 오전에 보내 드려요");
    await composer(page).press("Enter");
    await expect(page.locator('a[data-room-id="104"]')).toHaveCount(0);
    const calls = await roomListCalls(page, before);
    expect(
      calls.some((c) => c.filter === "NEEDS_REPLY" && c.status === 200),
    ).toBe(true);
    await expect(chatRows(page)).toHaveCount(16);
    await expect(roomTitle(page)).toHaveText("소매처 4");
    await expect(page).toHaveURL(/\/chats\?filter=NEEDS_REPLY&room=104$/);
  });

  test("S2-9 ③ 답 필요 하나뿐(rooms 4) → 배지 → 방 104 답 → 조건에 맞는 대화가 없어요 + 방 그대로", async ({
    page,
  }) => {
    await enterDashboard(page, { seed: "rooms-70", rooms: 4 });
    await expectBadge(page, 1);
    await chatLink(page).click();
    await expect(page).toHaveURL(NEEDS_URL);
    await expect(chatRows(page)).toHaveCount(1);
    await openRoomReady(page, 104);
    await composer(page).fill("확인했어요");
    await composer(page).press("Enter");
    await expect(listRegion(page).getByText(NO_MATCH)).toBeVisible();
    await expect(roomTitle(page)).toHaveText("소매처 4");
    await expect(page).toHaveURL(/\/chats\?filter=NEEDS_REPLY&room=104$/);
  });

  /* 원문 S2-9 ③은 행 101이다. rooms-70에서 101(i=1, 홀수)은 안 읽음이고 답 필요가 아니라 걸러진 목록에 없다.
     위 두 시험은 첫 답 필요 방 104로 바꿨다(02-dev-2 §5). 원래 조건을 실패로 남긴다(brief 규칙 5) */
  test.fail(
    "S2-9 ③ 원문: 배지로 온 답 필요 목록에 행 101이 있다",
    async ({ page }) => {
      await enterDashboard(page, { seed: "rooms-70" });
      await expectBadge(page, 17);
      await chatLink(page).click();
      await expect(page).toHaveURL(NEEDS_URL);
      await expect(chatRows(page)).toHaveCount(17);
      await expect(page.locator('a[data-room-id="101"]')).toBeVisible({
        timeout: 2_000,
      });
    },
  );
});

/* `/chats` 안에서 배지를 누름(같은 라우트 push). 고치기 전(5009d04)엔 주소만 바뀌고 칩과 목록이 그대로였다 */
test.describe("S2 같은 라우트 안에서 배지", () => {
  test("S2-3 push와 replace: ① 검색 한 글자씩 + 칩 안 읽음 → 기록, 핸들 그대로 ② 배지 → 기록 +1, 재마운트 1, 포커스 밖 ③ 뒤로 → 이전 조건, 재마운트 1회", async ({
    page,
  }) => {
    await enterChats(page, { seed: "rooms-70" });
    await expectBadge(page, 17);
    await watchSearchMounts(page);
    const start = await searchState(page);

    await test.step('① 검색 "소매처 1" 한 글자씩 + 칩 안 읽음', async () => {
      await typeSearch(page, "소매처 1");
      const typed = await searchState(page);
      expect(typed.focusInSearch, "칩 누르기 전 포커스 검색칸").toBe(true);
      await chip(page, "안 읽음").click();
      await expectChip(page, "안 읽음");
      await expect(page).toHaveURL(/\/chats\?filter=UNREAD&q=/);
      await frames(page);
      const after = await searchState(page);
      note("S2-3 ①", { start, typed, after });
      expect(after.historyLength, "기록 수 그대로").toBe(start.historyLength);
      expect(after.sameHandle, "검색칸 핸들 그대로").toBe(true);
      expect(after.mounts, "재마운트 0").toBe(0);
    });

    await test.step("② 배지 → 기록 +1, 옛 핸들 끊김 + 새 칸 1(재마운트 1회), 포커스 검색칸 아님", async () => {
      await chatLink(page).click();
      await expect(page).toHaveURL(NEEDS_URL);
      await expectChip(page, "답 필요");
      await expect(search(page)).toHaveValue("");
      await frames(page);
      const after = await searchState(page);
      note("S2-3 ②", after);
      expect(after.historyLength, "기록 +1").toBe(start.historyLength + 1);
      expect(after.sameHandle, "옛 검색칸 끊김").toBe(false);
      expect(after.boxes, "새 검색칸 1개").toBe(1);
      expect(after.mounts, "재마운트 1회").toBe(1);
      expect(after.focusInSearch, "포커스 검색칸 아님").toBe(false);
    });

    await test.step("③ 뒤로 → 안 읽음 + 소매처 1, 재마운트 1회 더(2회 아님)", async () => {
      await watchSearchMounts(page);
      await page.goBack();
      await expect(page).toHaveURL(/\/chats\?filter=UNREAD&q=/);
      await expectChip(page, "안 읽음");
      await expect(search(page)).toHaveValue("소매처 1");
      await frames(page);
      await frames(page);
      const after = await searchState(page);
      note("S2-3 ③", after);
      expect(after.mounts, "뒤로 가기 재마운트 1회").toBe(1);
      expect(after.boxes).toBe(1);
    });
  });

  test("S2-4 /chats + 검색 소매처 1 + 방 101 쓰던 글 → 배지 → q, room 없음, 칩 답 필요, 빈칸, GET q 없음, 스켈레톤 0, 고르세요 → 방 101 글 그대로", async ({
    page,
  }) => {
    await enterChats(page, { seed: "rooms-70" });
    await expectBadge(page, 17);
    await typeSearch(page, "소매처 1");
    await openRoomReady(page, 101);
    await expect(roomTitle(page)).toHaveText("소매처 1");
    await composer(page).fill("답장 쓰는 중");
    await expect
      .poll(() => storedDraft(page, keyOf(ME, 101)))
      .toBe("답장 쓰는 중");
    await settled(page, ROOMS_GET);
    await watchSkeletons(page);
    const base = await roomListCount(page);

    await chatLink(page).click();
    await expect(page).toHaveURL(NEEDS_URL);
    await expectChip(page, "답 필요");
    await expect(search(page)).toHaveValue("");
    await expect(page.getByText(PICK)).toBeVisible();
    await expect(chatRows(page)).toHaveCount(17);
    await settled(page, ROOMS_GET);
    const calls = await roomListCalls(page, base);
    note("S2-4 rooms GET", calls);
    expect(
      calls.filter((c) => c.q !== null),
      "GET에 q 없음",
    ).toHaveLength(0);
    expect(
      calls.filter((c) => c.filter === "NEEDS_REPLY").length,
    ).toBeGreaterThanOrEqual(1);
    expect(await skeletons(page), "스켈레톤 0").toBe(0);

    await chip(page, "전체").click();
    await openRoomReady(page, 101);
    await expect(composer(page)).toHaveValue("답장 쓰는 중");
  });

  test("S2-5 방 104 보내기를 붙잡은 채 배지 → 방 104 → 보류 1 → 놓음 → 서버 말풍선 1, 보류 0, 중복 0", async ({
    page,
  }) => {
    const BODY = "보류 중 배지 시험";
    /* brief는 `page.context().route`였다. 이 POST는 MSW worker가 페이지 안에서 답해 네트워크로 나가지 않아
       context route에 안 걸린다(30초 시간 초과, 02-dev-2 §5). 08b `installChatGate`(helpers 176행) 꼴로 fetch를
       감싸 **목에 닿기 전에** 붙잡는다. 응답은 바꾸지 않는다 — 나가는 시각만 늦춘다 */
    await page.addInitScript(() => {
      const w = window as unknown as {
        __sendHeld: number;
        __releaseSend: () => void;
      };
      w.__sendHeld = 0;
      let open: () => void = () => undefined;
      const gate = new Promise<void>((resolve) => {
        open = resolve;
      });
      w.__releaseSend = () => open();
      const original = window.fetch.bind(window);
      window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
        const url =
          typeof input === "string"
            ? input
            : input instanceof URL
              ? input.href
              : input.url;
        if (
          (init?.method ?? "GET").toUpperCase() === "POST" &&
          /\/api\/wholesale\/chat\/rooms\/104\/messages$/.test(url)
        ) {
          w.__sendHeld += 1;
          await gate;
        }
        return original(input, init);
      };
    });
    const held = () =>
      page.evaluate(
        () => (window as unknown as { __sendHeld: number }).__sendHeld,
      );
    await enterChats(page, { seed: "rooms-70" });
    await expectBadge(page, 17);
    await openRoomReady(page, 104);
    await composer(page).fill(BODY);
    await composer(page).press("Enter");
    await expect.poll(held).toBe(1);
    await expect(pendingBubbles(page)).toHaveCount(1);

    await chatLink(page).click();
    await expect(page).toHaveURL(NEEDS_URL);
    await expectChip(page, "답 필요");
    await openRoomReady(page, 104);
    await expect(pendingBubbles(page)).toHaveCount(1);
    await expect(pendingBubbles(page)).toContainText(BODY);

    expect(await held(), "아직 붙잡힌 채 1건").toBe(1);
    await page.evaluate(() =>
      (window as unknown as { __releaseSend: () => void }).__releaseSend(),
    );
    await expect(pendingBubbles(page)).toHaveCount(0);
    await settled(page, SEND_POST);
    const log = page.getByRole("log", { name: "대화", exact: true });
    await expect(log.locator("[data-sequence]", { hasText: BODY })).toHaveCount(
      1,
    );
    await expect(log.getByText(BODY, { exact: true })).toHaveCount(1);
  });

  test("S2-7 /chats?room=101 → 배지 → 뒤로 → room=101, 전체, 방 101 → 앞으로 → 답 필요, 방 닫힘", async ({
    page,
  }) => {
    await enterChats(page, { seed: "rooms-70" });
    await expectBadge(page, 17);
    await openRoomReady(page, 101);
    await expect(page).toHaveURL(/\/chats\?room=101$/);
    await chatLink(page).click();
    await expect(page).toHaveURL(NEEDS_URL);
    await expectChip(page, "답 필요");
    await expect(page.getByText(PICK)).toBeVisible();

    await page.goBack();
    await expect(page).toHaveURL(/\/chats\?room=101$/);
    await expectChip(page, "전체");
    await expect(roomTitle(page)).toHaveText("소매처 1");

    await page.goForward();
    await expect(page).toHaveURL(NEEDS_URL);
    await expectChip(page, "답 필요");
    await expect(page.getByText(PICK)).toBeVisible();
    await expect(chatRows(page)).toHaveCount(17);
  });
});
