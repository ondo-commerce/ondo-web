import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  bubbles,
  captureSends,
  chatRows,
  collectPageErrors,
  composer,
  draftKeys,
  enterChats,
  gotoChats,
  keyOf,
  knob,
  ME,
  openRoomReady,
  OTHER,
  pendingBubbles,
  READ_POST,
  requests,
  ROOMS_GET,
  row,
  settled,
  signIn,
  signOut,
  storedDraft,
} from "./helpers";

/**
 * loop-08b QA 사장 시나리오(brief-qa 3). 개발 spec과 다르게 **시계를 멈추지 않고** 실제 시간으로 떠난다.
 * 기본 설정 wholesale 프로젝트(3100, MSW mock). 스크린샷은 `.claude/harness/runs/loop-08b-chat-filter-history/qa/`.
 */

const SHOTS = ".claude/harness/runs/loop-08b-chat-filter-history/qa";
const SEARCH = "소매처 이름 검색";

function search(page: Page): Locator {
  return page.getByRole("searchbox", { name: SEARCH, exact: true });
}

function chip(page: Page, name: string): Locator {
  return page
    .getByRole("radiogroup", { name: "대화 필터", exact: true })
    .getByRole("radio", { name, exact: true });
}

function roomTitle(page: Page): Locator {
  return page.locator('[data-ac="S2-5 S3-9"]').getByRole("heading");
}

async function roomCalls(page: Page) {
  return (await requests(page, ROOMS_GET)).map((r) => {
    const u = new URL(r.url, "http://localhost");
    return {
      filter: u.searchParams.get("filter"),
      q: u.searchParams.get("q"),
      status: r.status,
    };
  });
}

test.describe("(a) 쓰던 글 — 실제 시간", () => {
  test.beforeEach(async ({ page }) => {
    await enterChats(page);
  });

  test("QA-a1 방 1 글 → 방 2 → 방 1, 마지막 글자 직후 새로고침(시계 안 멈춤)", async ({
    page,
  }) => {
    await openRoomReady(page, 1);
    await composer(page).fill("레드 M 내일 들어와요");
    await openRoomReady(page, 2);
    await expect(composer(page)).toHaveValue("");
    await openRoomReady(page, 1);
    await expect(composer(page)).toHaveValue("레드 M 내일 들어와요");

    await composer(page).press("End");
    const t0 = Date.now();
    await page.keyboard.type("!");
    const elapsed = Date.now() - t0;
    await page.reload();
    test.info().annotations.push({
      type: "typed→reload ms",
      description: String(elapsed),
    });
    await expect(composer(page)).toHaveValue("레드 M 내일 들어와요!");
  });

  test("QA-a2 글 입력 직후 상단 주문 → 채팅 → 방 1 같은 글, 실패 말풍선은 사라짐(Q7 ① 한계)", async ({
    page,
  }) => {
    await openRoomReady(page, 1);
    await knob(page, "fail", { op: "send", status: 500 });
    await composer(page).fill("실패할 글");
    await composer(page).press("Enter");
    await expect(pendingBubbles(page)).toHaveCount(1);
    await composer(page).fill("주문 다녀올 글");
    await page.getByRole("link", { name: "주문", exact: true }).click();
    await page.waitForURL(/\/orders/);
    expect(await storedDraft(page, keyOf(ME, 1))).toBe("주문 다녀올 글");
    await gotoChats(page);
    await openRoomReady(page, 1);
    await expect(composer(page)).toHaveValue("주문 다녀올 글");
    /* 기획 Q7 ①: 업무 화면 왕복에서 실패 말풍선은 사라진다(알려진 한계). 바뀌면 이 단언이 알려 준다 */
    await expect(pendingBubbles(page)).toHaveCount(0);
  });
});

test("QA-b 오프라인 전송 실패 → 방 2 → 방 1 → 온라인 → 다시 보내기, 같은 clientMessageId 한 번만", async ({
  page,
  context,
}) => {
  await enterChats(page);
  const sends = captureSends(page);
  const body = "오프라인에서 쓴 답";
  await openRoomReady(page, 1);
  await context.setOffline(true);
  await composer(page).fill(body);
  await composer(page).press("Enter");
  await expect(pendingBubbles(page)).toHaveCount(1);
  await expect(pendingBubbles(page).first()).toHaveAttribute(
    "data-pending",
    "failed",
  );
  expect(sends).toHaveLength(0);
  await context.setOffline(false);
  await openRoomReady(page, 2);
  await expect(pendingBubbles(page)).toHaveCount(0);
  await openRoomReady(page, 1);
  await expect(pendingBubbles(page)).toHaveCount(1);
  await pendingBubbles(page)
    .first()
    .getByRole("button", { name: "다시 보내기", exact: true })
    .click();
  await expect(pendingBubbles(page)).toHaveCount(0);
  await expect(bubbles(page).filter({ hasText: body })).toHaveCount(1);
  expect(sends).toHaveLength(1);
  expect(sends[0]?.key).toBeTruthy();
  /* 서버(목) thread에도 한 번만 */
  const count = await page.evaluate(async (text) => {
    const r = await fetch("/api/wholesale/chat/rooms/1/messages?size=100");
    const j = (await r.json()) as { data: { body?: string }[] };
    return j.data.filter((m) => m.body === text).length;
  }, body);
  expect(count).toBe(1);
});

test.describe("(c) 계정", () => {
  test("QA-c1 글 → 로그아웃 → 다른 계정 → 방 1 빈칸, 키 0", async ({
    page,
  }) => {
    await enterChats(page);
    await openRoomReady(page, 1);
    await composer(page).fill("남이 보면 안 되는 글");
    await expect
      .poll(() => storedDraft(page, keyOf(ME, 1)))
      .toBe("남이 보면 안 되는 글");
    await signOut(page);
    expect(await draftKeys(page)).toEqual([]);
    await signIn(page, OTHER);
    await gotoChats(page);
    await openRoomReady(page, 1);
    await expect(composer(page)).toHaveValue("");
  });

  test("QA-c2 401 끊김 → /login에서 같은 계정 다시 로그인 → 글 남음", async ({
    page,
  }) => {
    await enterChats(page);
    await openRoomReady(page, 1);
    await composer(page).fill("끊겨도 남을 글");
    await expect
      .poll(() => storedDraft(page, keyOf(ME, 1)))
      .toBe("끊겨도 남을 글");
    await knob(page, "fail", { op: "messages", status: 401 });
    await expect(
      page.getByRole("alert").filter({ hasText: "로그인이 끊겼어요" }).first(),
    ).toBeVisible({ timeout: 10_000 });
    await expect(composer(page)).toHaveValue("끊겨도 남을 글");
    /* 끊김 안내에 로그인 링크가 없다(#252). 사장이 주소창으로 /login 에 간 경우 */
    await page.goto("/login");
    const landed = new URL(page.url()).pathname;
    test.info().annotations.push({ type: "/login 결과", description: landed });
    if (landed.startsWith("/login")) await signIn(page, ME);
    await gotoChats(page);
    await openRoomReady(page, 1);
    await expect(composer(page)).toHaveValue("끊겨도 남을 글");
  });
});

test.describe("rooms-70", () => {
  test.beforeEach(async ({ page }) => {
    await enterChats(page, { seed: "rooms-70" });
    await expect(chatRows(page)).toHaveCount(30);
  });

  test("QA-d 안 읽음 + 소매처 6 → 소매처 63 열기 → 15초 재조회 뒤 목록에서 빠짐, 오른쪽 방 그대로", async ({
    page,
  }) => {
    await chip(page, "안 읽음").click();
    await search(page).fill("소매처 6");
    await expect(chatRows(page)).toHaveCount(5);
    await row(page, "소매처 63").click();
    await expect(roomTitle(page)).toHaveText("소매처 63");
    await expect
      .poll(async () => (await requests(page, READ_POST)).length)
      .toBe(1);
    await settled(page, READ_POST);
    await expect(row(page, "소매처 63")).toBeVisible();
    await page.clock.fastForward(15_000);
    await expect(row(page, "소매처 63")).toHaveCount(0);
    await expect(chatRows(page)).toHaveCount(4);
    await expect(roomTitle(page)).toHaveText("소매처 63");
    await expect(composer(page)).toBeVisible();
    const last = (await roomCalls(page)).at(-1);
    expect(last).toMatchObject({ filter: "UNREAD", q: "소매처 6" });
    await page.screenshot({ path: `${SHOTS}/qa-d-dropped.png` });
  });

  test("QA-e 한글 조합(CDP IME) 중 요청 0, 확정 뒤 1회", async ({ page }) => {
    const cdp = await page.context().newCDPSession(page);
    await search(page).focus();
    const before = (await roomCalls(page)).length;
    for (const t of ["ㅅ", "소", "솜"]) {
      await cdp.send("Input.imeSetComposition", {
        text: t,
        selectionStart: t.length,
        selectionEnd: t.length,
      });
      await page.clock.runFor(400);
    }
    await page.clock.runFor(1000);
    expect((await roomCalls(page)).length).toBe(before);
    await cdp.send("Input.insertText", { text: "소" });
    await page.clock.runFor(350);
    await expect
      .poll(async () => (await roomCalls(page)).length)
      .toBe(before + 1);
    expect((await roomCalls(page)).at(-1)?.q).toBe("소");
    await expect(search(page)).toHaveValue("소");
  });

  for (const size of [
    { width: 1280, height: 800 },
    { width: 1470, height: 900 },
  ]) {
    test(`QA-f ${size.width} 화면 전체 스크롤 0 — 목록 끝, 방 열림, 조건 0`, async ({
      page,
    }) => {
      await page.setViewportSize(size);
      const docScroll = () =>
        page.evaluate(() => ({
          x:
            document.documentElement.scrollWidth -
            document.documentElement.clientWidth,
          y:
            document.documentElement.scrollHeight -
            document.documentElement.clientHeight,
        }));
      await chip(page, "안 읽음").click();
      await expect(row(page, "소매처 2")).toHaveCount(0);
      await expect
        .poll(async () => {
          await chatRows(page).last().scrollIntoViewIfNeeded();
          return chatRows(page).count();
        })
        .toBe(35);
      expect(await docScroll()).toEqual({ x: 0, y: 0 });
      await row(page, "소매처 69").click();
      await expect(roomTitle(page)).toHaveText("소매처 69");
      await expect(composer(page)).toBeVisible();
      expect(await docScroll()).toEqual({ x: 0, y: 0 });
      await page.screenshot({ path: `${SHOTS}/qa-f-${size.width}-room.png` });
      await search(page).fill("없는상회");
      await expect(page.getByText("조건에 맞는 대화가 없어요")).toBeVisible();
      expect(await docScroll()).toEqual({ x: 0, y: 0 });
      await page.screenshot({
        path: `${SHOTS}/qa-f-${size.width}-nomatch.png`,
      });
    });
  }
});

/**
 * 검색 디바운스 타이머가 **예약할 때의 조건**을 쥐고 도는지(stale closure). 검색 글자를 친 뒤 300ms 안에 칩이나
 * 행을 누르는 경우.
 *
 * findings F1(03-review R1) 재현으로 시작했다. 고친 뒤 `test.fail`을 지웠다(타이머가 부를 때의 최신 `onQuery`).
 * 고치기 전 실패 증거(2026-11-01, da4654b): QA-g 칩 locator는 radiogroup "대화 필터" 안
 * `button role=radio` "안 읽음"을 잡았고 aria-checked="false", URL `?q=소매처+6`(filter 없음), 눌린 칩 "전체".
 * QA-h URL `/chats?q=소매처+1`(room 없음), 오른쪽 "왼쪽 목록에서 대화를 고르세요".
 */
test.describe("검색 타이머와 겹친 조작", () => {
  test.beforeEach(async ({ page }) => {
    await enterChats(page, { seed: "rooms-70" });
    await expect(chatRows(page)).toHaveCount(30);
  });

  test("QA-g 검색 입력 직후 300ms 안에 안 읽음 → 칩은 안 읽음 그대로, 요청 filter=UNREAD q=소매처 6", async ({
    page,
  }) => {
    const errors = collectPageErrors(page);
    await search(page).focus();
    await page.keyboard.insertText("소매처 6");
    await chip(page, "안 읽음").click();
    await expect(chip(page, "안 읽음")).toHaveAttribute("aria-checked", "true");
    await page.clock.runFor(400);
    await settled(page, ROOMS_GET);
    const proof = await page.evaluate(() => ({
      url: location.href,
      checked: document.querySelector(
        '[role="radiogroup"] [aria-checked="true"]',
      )?.textContent,
    }));
    test.info().annotations.push({
      type: "타이머 뒤",
      description: JSON.stringify(proof),
    });
    await expect(chip(page, "안 읽음")).toHaveAttribute("aria-checked", "true");
    await expect(chatRows(page)).toHaveCount(5);
    expect(errors).toEqual([]);
  });

  test("QA-h 검색 입력 직후 300ms 안에 행 클릭 → 타이머 뒤에도 그 방이 열려 있다", async ({
    page,
  }) => {
    await search(page).focus();
    await page.keyboard.insertText("소매처 1");
    await row(page, "소매처 10").click();
    await expect(roomTitle(page)).toHaveText("소매처 10");
    await page.clock.runFor(400);
    await settled(page, ROOMS_GET);
    const proof = await page.evaluate(() => location.href);
    test.info().annotations.push({ type: "타이머 뒤 URL", description: proof });
    await expect(page).toHaveURL(/[?&]room=110(&|$)/);
    await expect(roomTitle(page)).toHaveText("소매처 10");
  });
});

/**
 * 03-review R2(findings F2) 브라우저 재현. 칩, 검색은 replace라 조건 차이가 기록에 남는 건 행 링크(push) 앞뒤뿐이다.
 * 조건 없이 방을 연 기록으로 뒤로 가면 URL은 조건 없음인데 칩은 안 읽음으로 남는가.
 * `test.fail`. 실패 시점 증거(2026-11-01, da4654b): 뒤로 두 번 뒤 URL `/chats`(filter 없음), 칩 locator는
 * radiogroup "대화 필터" 안 radio "전체"를 잡았고 aria-checked="false", 눌린 칩 "안 읽음".
 */
test.fail(
  "QA-i 조건 없이 방 2 → 안 읽음 → 방 1 → 뒤로 두 번 → URL 조건 없음이면 칩도 전체",
  async ({ page }) => {
    await enterChats(page, { seed: "rooms-70" });
    await expect(chatRows(page)).toHaveCount(30);
    await row(page, "소매처 2").click();
    await expect(page).toHaveURL(/\/chats\?room=102$/);
    await chip(page, "안 읽음").click();
    await expect(page).toHaveURL(/\/chats\?filter=UNREAD&room=102$/);
    await expect(row(page, "소매처 2")).toHaveCount(0);
    await row(page, "소매처 1").click();
    await expect(page).toHaveURL(/\/chats\?filter=UNREAD&room=101$/);
    await page.goBack();
    await expect(page).toHaveURL(/\/chats\?filter=UNREAD&room=102$/);
    await page.goBack();
    const proof = await page.evaluate(() => ({
      url: location.href,
      checked: document.querySelector(
        '[role="radiogroup"][aria-label="대화 필터"] [aria-checked="true"]',
      )?.textContent,
    }));
    test.info().annotations.push({
      type: "뒤로 두 번 뒤",
      description: JSON.stringify(proof),
    });
    expect(new URL(page.url()).searchParams.get("filter")).toBeNull();
    await expect(chip(page, "전체")).toHaveAttribute("aria-checked", "true");
  },
);
