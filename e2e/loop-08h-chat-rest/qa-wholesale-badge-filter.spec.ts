import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  chatLink,
  chatRows,
  composer,
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
  sendFromOtherDevice,
  settled,
  signIn,
  storedDraft,
  watchRequests,
} from "./helpers";

/**
 * QA loop-08h S2(#387). 개발 spec과 다른 길로 같은 AC를 본다.
 * - 대시보드가 아니라 `/orders`(주 메뉴 다른 화면)에서 배지를 누른다
 * - 링크를 키보드(Enter)로도 누른다
 * - 배지 숫자와 걸러진 행 수를 같은 화면에서 맞춘다
 * - 답을 다 한 뒤 count가 0이 되면 링크가 `/chats`로 돌아오는지(Q1 ①을 끝까지)
 * locator가 잡은 요소는 annotations에 남긴다(QA 규칙 8). 텍스트 locator는 exact.
 */

const NEEDS_URL = /\/chats\?filter=NEEDS_REPLY$/;
const PICK = "왼쪽 목록에서 대화를 고르세요";
const NO_MATCH = "조건에 맞는 대화가 없어요";
const COUNT_GET = {
  path: /\/api\/wholesale\/notifications\/unread-count(\?|$)/,
  method: "GET",
} as const;

function chip(page: Page, name: string): Locator {
  return page
    .getByRole("radiogroup", { name: "대화 필터" })
    .getByRole("radio", { name, exact: true });
}

function listRegion(page: Page): Locator {
  return page.getByRole("region", { name: "대화 목록", exact: true });
}

async function shot(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: test.info().outputPath(`${name}.png`) });
}

/** 헤더 채팅 링크가 실제로 잡은 요소(태그, 이름, href, 알약 글자) */
async function linkEvidence(page: Page, step: string) {
  const ev = await chatLink(page).evaluate((el) => ({
    tag: el.tagName,
    ariaLabel: el.getAttribute("aria-label"),
    href: el.getAttribute("href"),
    pill: el.querySelector('[data-ac="S11-2 S11-15"]')?.textContent ?? null,
    inBanner: el.closest('[role="banner"], header') !== null,
  }));
  note(`link ${step}`, ev);
  return ev;
}

/** 로그인 화면 → reset → 로그인(`/dashboard`) → 셸 라우터로 `path`(클라이언트 이동이라 목 상태가 산다) */
async function enterAt(
  page: Page,
  path: string,
  options: { seed?: string; rooms?: number } = {},
): Promise<void> {
  await watchRequests(page);
  await installClock(page);
  await page.goto("/login");
  await expect(
    page.getByText("도매 사장님 로그인", { exact: true }),
  ).toBeVisible();
  const body: Record<string, unknown> = {};
  if (options.seed !== undefined) body.seed = options.seed;
  if (options.rooms !== undefined) body.rooms = options.rooms;
  await knob(page, "reset", body);
  await signIn(page, ME);
  if (path !== "/dashboard") {
    await expect(chatLink(page)).toBeVisible();
    await page.evaluate(
      (href) =>
        (
          window as unknown as {
            next: { router: { push: (href: string) => void } };
          }
        ).next.router.push(href),
      path,
    );
    await page.waitForURL(new RegExp(`${path.replace("?", "\\?")}$`));
  }
}

test.describe("QA S2 배지 → 답 필요 목록", () => {
  test("S2-2 1470 /orders에서 배지 17 → 행 17 전부 답 필요, 칩, 고르세요, 화면 전체 스크롤 없음", async ({
    page,
  }) => {
    await enterAt(page, "/orders", { seed: "rooms-70" });
    await expect(chatLink(page)).toHaveAccessibleName("채팅, 답 필요 17건");
    const ev = await linkEvidence(page, "orders");
    expect(ev.tag).toBe("A");
    expect(ev.href).toBe("/chats?filter=NEEDS_REPLY");
    expect(ev.pill).toBe("17");
    await chatLink(page).click();
    await expect(page).toHaveURL(NEEDS_URL);
    await expect(chip(page, "답 필요")).toHaveAttribute("aria-checked", "true");
    await expect(chatRows(page)).toHaveCount(17);
    const ids = await chatRows(page).evaluateAll((nodes) =>
      nodes.map((n) => Number((n as HTMLElement).dataset.roomId)),
    );
    note("row ids", ids);
    /* rooms-70 답 필요 = 4의 배수 방(104~168) */
    expect(ids.every((id) => (id - 100) % 4 === 0)).toBe(true);
    await expect(
      chatRows(page).filter({
        has: page.getByText("답 필요", { exact: true }),
      }),
    ).toHaveCount(17);
    await expect(page.getByText(PICK, { exact: true })).toBeVisible();
    const overflow = await page.evaluate(() => ({
      doc: document.documentElement.scrollHeight,
      inner: window.innerHeight,
    }));
    note("page overflow", overflow);
    expect(overflow.doc, "도매 h-dvh: 문서 스크롤 없음").toBeLessThanOrEqual(
      overflow.inner,
    );
    await shot(page, "S2-2-orders-1470");
  });

  test("S2-2 1280 키보드 Enter로 배지 → 같은 목록", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await enterAt(page, "/dashboard", { seed: "rooms-70" });
    await expect(chatLink(page)).toHaveAccessibleName("채팅, 답 필요 17건");
    await chatLink(page).focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(NEEDS_URL);
    await expect(chip(page, "답 필요")).toHaveAttribute("aria-checked", "true");
    await expect(chatRows(page)).toHaveCount(17);
    await settled(page, ROOMS_GET);
    const calls = (await requests(page, ROOMS_GET)).map((r) =>
      new URL(r.url, "http://localhost").searchParams.get("filter"),
    );
    note("rooms GET filter", calls);
    expect(calls).toContain("NEEDS_REPLY");
    await shot(page, "S2-2-keyboard-1280");
  });

  test("사장 시나리오: 답 필요 1 → 배지 → 답함 → 30초 뒤 배지 사라지고 링크는 /chats → 누르면 전체 목록, 방 닫힘", async ({
    page,
  }) => {
    await enterAt(page, "/dashboard", { seed: "rooms-70", rooms: 4 });
    await expect(chatLink(page)).toHaveAccessibleName("채팅, 답 필요 1건");
    await chatLink(page).click();
    await expect(page).toHaveURL(NEEDS_URL);
    await expect(chatRows(page)).toHaveCount(1);
    await openRoomReady(page, 104);
    await composer(page).fill("오늘 보내 드릴게요");
    await composer(page).press("Enter");
    await expect(
      listRegion(page).getByText(NO_MATCH, { exact: true }),
    ).toBeVisible();
    await settled(page, COUNT_GET);
    const before = (await requests(page, COUNT_GET)).length;
    await page.clock.fastForward(30_000);
    await expect
      .poll(() => requests(page, COUNT_GET).then((r) => r.length))
      .toBeGreaterThan(before);
    await settled(page, COUNT_GET);
    await expect(chatLink(page)).toHaveAccessibleName("채팅");
    const ev = await linkEvidence(page, "after-answer");
    expect(ev.href).toBe("/chats");
    expect(ev.pill).toBeNull();
    await chatLink(page).click();
    await expect(page).toHaveURL(/\/chats$/);
    await expect(chip(page, "전체")).toHaveAttribute("aria-checked", "true");
    await expect(chatRows(page)).toHaveCount(4);
    await expect(page.getByText(PICK, { exact: true })).toBeVisible();
    await shot(page, "scenario-answered-badge-gone");
  });

  test("S2-6 ③ 낡은 배지 1로 누름 → 빈 안내 + 조건 지우기 → 조건 지우기 누르면 전체 4행", async ({
    page,
  }) => {
    await enterAt(page, "/dashboard", { seed: "rooms-70", rooms: 4 });
    await expect(chatLink(page)).toHaveAccessibleName("채팅, 답 필요 1건");
    await sendFromOtherDevice(page, 104, "다른 기기 답");
    await linkEvidence(page, "stale");
    await chatLink(page).click();
    await expect(page).toHaveURL(NEEDS_URL);
    await expect(
      listRegion(page).getByText(NO_MATCH, { exact: true }),
    ).toBeVisible();
    const clear = listRegion(page).getByRole("button", {
      name: "조건 지우기",
      exact: true,
    });
    await expect(clear).toBeVisible();
    await shot(page, "S2-6-stale-empty-1470");
    await clear.click();
    await expect(page).toHaveURL(/\/chats$/);
    await expect(chip(page, "전체")).toHaveAttribute("aria-checked", "true");
    await expect(chatRows(page)).toHaveCount(4);
  });
});

test.describe("QA S2 같은 라우트 안", () => {
  test("S2-4 /chats?filter=UNREAD 방 101 쓰던 글 → 배지 → 방 닫힘, 칩 답 필요 → 전체 → 방 101 글 그대로", async ({
    page,
  }) => {
    await enterAt(page, "/chats?filter=UNREAD", { seed: "rooms-70" });
    await expect(chip(page, "안 읽음")).toHaveAttribute("aria-checked", "true");
    await openRoomReady(page, 101);
    await composer(page).fill("QA 쓰던 글");
    await expect
      .poll(() => storedDraft(page, keyOf(ME, 101)))
      .toBe("QA 쓰던 글");
    await expect(chatLink(page)).toHaveAccessibleName("채팅, 답 필요 17건");
    await chatLink(page).click();
    await expect(page).toHaveURL(NEEDS_URL);
    await expect(chip(page, "답 필요")).toHaveAttribute("aria-checked", "true");
    await expect(page.getByText(PICK, { exact: true })).toBeVisible();
    await expect(chatRows(page)).toHaveCount(17);
    await chip(page, "전체").click();
    await openRoomReady(page, 101);
    await expect(composer(page)).toHaveValue("QA 쓰던 글");
  });

  /* 검색 타이머(300ms)가 도는 중에 배지를 누른다. 타이머가 라우터 렌더 앞이나 뒤에 돌아도 끝 주소와 칩은 답 필요,
     검색칸 빈칸이어야 한다(Q2 ① q가 빠진다) */
  test("검색 치자마자(300ms 안) 배지 → 끝 주소 q 없음, 칩 답 필요, 검색칸 빈칸, 행 17", async ({
    page,
  }) => {
    await enterAt(page, "/chats", { seed: "rooms-70" });
    await expect(chatLink(page)).toHaveAccessibleName("채팅, 답 필요 17건");
    const search = page.getByRole("searchbox", {
      name: "소매처 이름 검색",
      exact: true,
    });
    await search.click();
    await search.pressSequentially("소매처 1");
    await chatLink(page).click();
    await expect(page).toHaveURL(NEEDS_URL);
    await expect(chip(page, "답 필요")).toHaveAttribute("aria-checked", "true");
    await expect(search).toHaveValue("");
    await expect(chatRows(page)).toHaveCount(17);
    /* 타이머가 늦게 돌아 주소를 다시 쓰지 않았는지 — 목록 GET이 다 끝난 뒤 한 번 더 본다 */
    await settled(page, ROOMS_GET);
    note("final url", page.url());
    await expect(page).toHaveURL(NEEDS_URL);
    await expect(search).toHaveValue("");
  });

  test("S2-3 /chats 검색칸 포커스 → 배지 → 기록 +1, 검색칸 새 요소, 포커스 검색칸 아님 → 뒤로 → 기록 그대로 전체", async ({
    page,
  }) => {
    await enterAt(page, "/chats", { seed: "rooms-70" });
    await expect(chatLink(page)).toHaveAccessibleName("채팅, 답 필요 17건");
    const search = page.getByRole("searchbox", {
      name: "소매처 이름 검색",
      exact: true,
    });
    await search.click();
    const before = await page.evaluate(() => {
      const el = document.activeElement;
      (window as unknown as { __oldSearch: Element | null }).__oldSearch = el;
      return { len: history.length, tag: el?.tagName ?? null };
    });
    await chatLink(page).click();
    await expect(page).toHaveURL(NEEDS_URL);
    await expect(chip(page, "답 필요")).toHaveAttribute("aria-checked", "true");
    const after = await page.evaluate(() => {
      const old = (window as unknown as { __oldSearch: Element | null })
        .__oldSearch;
      const el = document.activeElement;
      return {
        len: history.length,
        oldConnected: old?.isConnected ?? null,
        active: el?.tagName ?? null,
        activeLabel: el?.getAttribute("aria-label") ?? null,
      };
    });
    note("S2-3", { before, after });
    expect(after.len).toBe(before.len + 1);
    expect(after.oldConnected, "검색칸 다시 마운트").toBe(false);
    expect(after.activeLabel).not.toBe("소매처 이름 검색");
    await page.goBack();
    await expect(page).toHaveURL(/\/chats$/);
    await expect(chip(page, "전체")).toHaveAttribute("aria-checked", "true");
    expect(await page.evaluate(() => history.length)).toBe(after.len);
  });

  test("S2-8 답 필요 칩으로 이미 필터 → 배지 → 주소, 행, 칩 그대로, 목록 GET 늘어남 ≤ 1", async ({
    page,
  }) => {
    await enterAt(page, "/chats", { seed: "rooms-70" });
    await chip(page, "답 필요").click();
    await expect(page).toHaveURL(NEEDS_URL);
    await expect(chatRows(page)).toHaveCount(17);
    await settled(page, ROOMS_GET);
    const base = (await requests(page, ROOMS_GET)).length;
    const len = await page.evaluate(() => history.length);
    await chatLink(page).press("Enter");
    await expect(page).toHaveURL(NEEDS_URL);
    await expect(chatRows(page)).toHaveCount(17);
    await settled(page, ROOMS_GET);
    const extra = (await requests(page, ROOMS_GET)).length - base;
    const lenAfter = await page.evaluate(() => history.length);
    note("S2-8", { extra, len, lenAfter });
    expect(extra).toBeLessThanOrEqual(1);
    await expect(chip(page, "답 필요")).toHaveAttribute("aria-checked", "true");
    await expect(page.getByText(PICK, { exact: true })).toBeVisible();
  });

  test("S2-9 ①② 배지 → 새로고침 → 칩 그대로 → 15초 → 재조회 filter=NEEDS_REPLY", async ({
    page,
  }) => {
    await enterAt(page, "/orders", { seed: "rooms-70" });
    await chatLink(page).click();
    await expect(page).toHaveURL(NEEDS_URL);
    await page.reload();
    await expect(page).toHaveURL(NEEDS_URL);
    await expect(chip(page, "답 필요")).toHaveAttribute("aria-checked", "true");
    await expect(chatRows(page).first()).toBeVisible();
    await settled(page, ROOMS_GET);
    const before = (await requests(page, ROOMS_GET)).length;
    await page.clock.fastForward(15_000);
    await expect
      .poll(async () => (await requests(page, ROOMS_GET)).length)
      .toBeGreaterThan(before);
    const filters = (await requests(page, ROOMS_GET))
      .slice(before)
      .map((r) =>
        new URL(r.url, "http://localhost").searchParams.get("filter"),
      );
    note("S2-9 ② filters", filters);
    expect(filters.every((f) => f === "NEEDS_REPLY")).toBe(true);
  });

  test("S2-5 방 104 보내기 붙잡음 → 배지 → 방 없이 놓음 → 방 104 다시 엶 → 서버 말풍선 1, 보류 0", async ({
    page,
  }) => {
    const BODY = "QA 보류 말풍선";
    await page.addInitScript(() => {
      const w = window as unknown as { __held: number; __release: () => void };
      w.__held = 0;
      let open: () => void = () => undefined;
      const gate = new Promise<void>((r) => {
        open = r;
      });
      w.__release = () => open();
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
          /\/chat\/rooms\/104\/messages$/.test(url)
        ) {
          w.__held += 1;
          await gate;
        }
        return original(input, init);
      };
    });
    const held = () =>
      page.evaluate(() => (window as unknown as { __held: number }).__held);
    await enterAt(page, "/chats", { seed: "rooms-70" });
    await openRoomReady(page, 104);
    await composer(page).fill(BODY);
    await composer(page).press("Enter");
    await expect.poll(held).toBe(1);
    await expect(pendingBubbles(page)).toHaveCount(1);
    await chatLink(page).click();
    await expect(page).toHaveURL(NEEDS_URL);
    await expect(page.getByText(PICK, { exact: true })).toBeVisible();
    await page.evaluate(() =>
      (window as unknown as { __release: () => void }).__release(),
    );
    await openRoomReady(page, 104);
    const log = page.getByRole("log", { name: "대화", exact: true });
    await expect(pendingBubbles(page)).toHaveCount(0);
    await expect(log.getByText(BODY, { exact: true })).toHaveCount(1);
    expect(await held()).toBe(1);
  });

  test("S2-7 /chats?room=101 → 배지 → 뒤로 → 방 101, 전체 → 앞으로 → 답 필요, 방 닫힘 → 뒤로 한 번 더", async ({
    page,
  }) => {
    await enterAt(page, "/chats", { seed: "rooms-70" });
    await openRoomReady(page, 101);
    await expect(page).toHaveURL(/\/chats\?room=101$/);
    await chatLink(page).click();
    await expect(page).toHaveURL(NEEDS_URL);
    await expect(page.getByText(PICK, { exact: true })).toBeVisible();
    await page.goBack();
    await expect(page).toHaveURL(/\/chats\?room=101$/);
    await expect(chip(page, "전체")).toHaveAttribute("aria-checked", "true");
    await expect(roomTitle(page)).toHaveText("소매처 1");
    await expect(page.locator('a[data-room-id="102"]')).toBeVisible();
    await page.goForward();
    await expect(page).toHaveURL(NEEDS_URL);
    await expect(chip(page, "답 필요")).toHaveAttribute("aria-checked", "true");
    await expect(chatRows(page)).toHaveCount(17);
    await expect(page.getByText(PICK, { exact: true })).toBeVisible();
    await page.goBack();
    await expect(page).toHaveURL(/\/chats\?room=101$/);
    await expect(chip(page, "전체")).toHaveAttribute("aria-checked", "true");
    await expect(roomTitle(page)).toHaveText("소매처 1");
  });
});
