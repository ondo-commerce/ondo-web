import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  armChatGate,
  chatRows,
  composer,
  enterChats,
  installChatGate,
  knob,
  openChatGate,
  READ_POST,
  requests,
  ROOMS_GET,
  row,
  settled,
} from "./helpers";

/**
 * loop-08b #328 S4 목록 필터와 검색(01-plan §4-2, §6 S4, 와이어프레임 17 `#state-filter-*`, 디자인 결정 52~59).
 *
 * 시드 `rooms-70`(S1-2 손 계산): 내 방 70개, 방 id = 100 + i, 이름 "소매처 i", i가 작을수록 최근.
 * 안 읽음 = 홀수 35개(첫 장 30 + 둘째 장 61 63 65 67 69), 답 필요 = 4의 배수 17개(4~68),
 * "소매처 6" = 6, 60~69 11개, 그중 안 읽음 = 61 63 65 67 69 5개.
 *
 * 칩은 `Segmented`(Radix ToggleGroup single)라 `role=radio aria-checked`다(디자인 결정 53, AC S4-2의 aria-pressed를
 * 이 값으로 읽는다, 01-plan D43 D44). 순서 역전은 `delay {op: rooms}`로만 만든다.
 */

const SEARCH = "소매처 이름 검색";

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

/** 행 자리(aria-busy가 붙는 곳). 제목 옆 "찾는 중"도 data-ac S4-6이라 div로 고른다 */
function rowsArea(page: Page): Locator {
  return listRegion(page).locator('div[data-ac="S4-6"]');
}

function roomTitle(page: Page): Locator {
  return page.locator('[data-ac="S2-5 S3-9"]').getByRole("heading");
}

/** 목록 요청의 조건. 요청 시점 URL에서 읽는다 */
async function roomListCalls(page: Page) {
  return (await requests(page, ROOMS_GET)).map((r) => {
    const url = new URL(r.url, "http://localhost");
    return {
      filter: url.searchParams.get("filter"),
      q: url.searchParams.get("q"),
      cursor: url.searchParams.get("cursor"),
      status: r.status,
    };
  });
}

async function countCalls(
  page: Page,
  match: { filter?: string | null; q?: string | null },
): Promise<number> {
  return (await roomListCalls(page)).filter(
    (c) =>
      (match.filter === undefined || c.filter === match.filter) &&
      (match.q === undefined || c.q === match.q),
  ).length;
}

function urlParams(page: Page): URLSearchParams {
  return new URL(page.url()).searchParams;
}

/** 이어 받기 표지가 보이도록 끝 행까지 내린다 */
async function scrollToEnd(page: Page, expected: number): Promise<void> {
  await expect
    .poll(async () => {
      await chatRows(page).last().scrollIntoViewIfNeeded();
      return chatRows(page).count();
    })
    .toBe(expected);
}

async function holdTimers(page: Page): Promise<void> {
  const now = await page.evaluate(() => Date.now());
  await page.clock.pauseAt(new Date(now + 50));
}

test.describe("rooms-70", () => {
  test.beforeEach(async ({ page }) => {
    await enterChats(page, { seed: "rooms-70" });
    await expect(chatRows(page)).toHaveCount(30);
  });

  test("S4-2 안 읽음 → 30행 → 끝까지 35행(끝 소매처 69), URL filter=UNREAD, 칩 aria-checked", async ({
    page,
  }) => {
    await expect(chip(page, "전체")).toHaveAttribute("aria-checked", "true");
    await chip(page, "안 읽음").click();
    await expect(chip(page, "안 읽음")).toHaveAttribute("aria-checked", "true");
    await expect(chip(page, "전체")).toHaveAttribute("aria-checked", "false");
    await expect(row(page, "소매처 2")).toHaveCount(0);
    await expect(chatRows(page)).toHaveCount(30);
    expect(urlParams(page).get("filter")).toBe("UNREAD");
    await scrollToEnd(page, 35);
    await expect(chatRows(page).last()).toHaveAccessibleName(/^소매처 69 /);
    expect(
      (await roomListCalls(page)).filter((c) => c.filter === "UNREAD"),
    ).toHaveLength(2);
  });

  test("S4-3 글자 사이 50ms로 소매처 6 → 요청 1회, 11행, + 안 읽음 5행, history.length 그대로", async ({
    page,
  }) => {
    const historyBefore = await page.evaluate(() => history.length);
    await search(page).pressSequentially("소매처 6", { delay: 50 });
    await expect(chatRows(page)).toHaveCount(11);
    expect(await countCalls(page, { q: "소매처 6" })).toBe(1);
    /* 중간 글자("소", "소매" …)로 나간 요청 0 */
    expect(
      (await roomListCalls(page)).filter((c) => c.q !== null),
    ).toHaveLength(1);

    await chip(page, "안 읽음").click();
    await expect(chatRows(page)).toHaveCount(5);
    expect(
      await chatRows(page).evaluateAll((links) =>
        links.map((a) => a.getAttribute("data-room-id")),
      ),
    ).toEqual(["161", "163", "165", "167", "169"]);
    expect(urlParams(page).get("filter")).toBe("UNREAD");
    expect(urlParams(page).get("q")).toBe("소매처 6");
    expect(await page.evaluate(() => history.length)).toBe(historyBefore);
  });

  test("S4-4 소매처 61 열기 → URL 셋 → 새로고침 → 칩, 검색 글, 4행(61 빠짐), 오른쪽 방 61", async ({
    page,
  }) => {
    await installChatGate(page);
    await search(page).fill("소매처 6");
    await expect(chatRows(page)).toHaveCount(11);
    await chip(page, "안 읽음").click();
    await expect(chatRows(page)).toHaveCount(5);

    await row(page, "소매처 61").click();
    await expect(roomTitle(page)).toHaveText("소매처 61");
    expect(urlParams(page).get("filter")).toBe("UNREAD");
    expect(urlParams(page).get("q")).toBe("소매처 6");
    expect(urlParams(page).get("room")).toBe("161");
    await expect(row(page, "소매처 61")).toBeVisible();
    await expect
      .poll(async () => (await requests(page, READ_POST)).length)
      .toBe(1);
    await settled(page, READ_POST);
    const readSequence = await page
      .locator("[data-sequence]")
      .last()
      .getAttribute("data-sequence");

    /* 새로고침. 목이 시드로 돌아가므로 채팅 요청을 막아 두고 서버 상태(rooms-70, 방 61 읽음)를 되돌린 뒤 연다 */
    await armChatGate(page);
    await page.reload();
    await expect(page.getByRole("banner")).toBeVisible();
    await knob(page, "reset", { seed: "rooms-70" });
    const readStatus = await page.evaluate(
      async (seq) =>
        (
          await (window as unknown as { __rawFetch: typeof fetch }).__rawFetch(
            "/api/wholesale/chat/rooms/161/read",
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ lastReadSequence: Number(seq) }),
            },
          )
        ).status,
      readSequence,
    );
    expect(readStatus).toBe(200);
    await openChatGate(page);

    await expect(chip(page, "안 읽음")).toHaveAttribute("aria-checked", "true");
    await expect(search(page)).toHaveValue("소매처 6");
    await expect(chatRows(page)).toHaveCount(4);
    expect(
      await chatRows(page).evaluateAll((links) =>
        links.map((a) => a.getAttribute("data-room-id")),
      ),
    ).toEqual(["163", "165", "167", "169"]);
    await expect(roomTitle(page)).toHaveText("소매처 61");
    const first = (await roomListCalls(page)).at(-1);
    expect(first).toMatchObject({ filter: "UNREAD", q: "소매처 6" });
  });

  test("S4-5 없는상회 → 문구와 조건 지우기 → 전체, 빈칸, 30행", async ({
    page,
  }) => {
    await search(page).fill("없는상회");
    await expect(
      listRegion(page).getByText("조건에 맞는 대화가 없어요"),
    ).toBeVisible();
    await listRegion(page).getByRole("button", { name: "조건 지우기" }).click();
    await expect(chip(page, "전체")).toHaveAttribute("aria-checked", "true");
    await expect(search(page)).toHaveValue("");
    await expect(search(page)).toBeFocused();
    await expect(chatRows(page)).toHaveCount(30);
    expect(urlParams(page).get("q")).toBeNull();
    expect(urlParams(page).get("filter")).toBeNull();
  });

  test("S4-6 바꾸는 중 이전 행 + aria-busy, 스켈레톤 0. rooms 500 → 목록 자리 오류, 칩과 검색칸 그대로, 다시 시도 1회", async ({
    page,
  }) => {
    await knob(page, "delay", { op: "rooms", ms: 3000 });
    await chip(page, "안 읽음").click();
    await expect(chip(page, "안 읽음")).toHaveAttribute("aria-checked", "true");
    await expect(rowsArea(page)).toHaveAttribute("aria-busy", "true");
    await expect(listRegion(page).getByText("찾는 중")).toBeVisible();
    /* 이전(전체) 행 그대로 — 소매처 2는 안 읽음에 없는 방이다 */
    await expect(row(page, "소매처 2")).toBeVisible();
    await expect(chatRows(page)).toHaveCount(30);
    await expect(
      listRegion(page).getByRole("status", { name: "불러오는 중" }),
    ).toHaveCount(0);
    await expect(row(page, "소매처 2")).toHaveCount(0, { timeout: 10_000 });
    await expect(rowsArea(page)).not.toHaveAttribute("aria-busy", "true");
    await expect(listRegion(page).getByText("찾는 중")).toHaveCount(0);

    await knob(page, "fail", { op: "rooms", status: 500 });
    await chip(page, "답 필요").click();
    const error = rowsArea(page).getByRole("alert");
    await expect(error).toBeVisible();
    await expect(search(page)).toBeVisible();
    await expect(chip(page, "답 필요")).toHaveAttribute("aria-checked", "true");
    const before = await countCalls(page, { filter: "NEEDS_REPLY" });
    await error.getByRole("button", { name: "다시 시도" }).click();
    await expect(chatRows(page)).toHaveCount(17);
    expect(await countCalls(page, { filter: "NEEDS_REPLY" })).toBe(before + 1);
  });

  test("S4-7 소매처 6(3초 늦음) → 응답 전 소매처 7 → 화면은 7, 70 두 행", async ({
    page,
  }) => {
    await knob(page, "delay", { op: "rooms", ms: 3000 });
    await search(page).fill("소매처 6");
    await expect.poll(() => countCalls(page, { q: "소매처 6" })).toBe(1);
    await search(page).fill("소매처 7");
    await expect(chatRows(page)).toHaveCount(2);
    await settled(page, ROOMS_GET);
    expect(
      (await roomListCalls(page)).find((c) => c.q === "소매처 6")?.status,
    ).toBe(200);
    await expect(chatRows(page)).toHaveCount(2);
    expect(
      await chatRows(page).evaluateAll((links) =>
        links.map((a) => a.getAttribute("data-room-id")),
      ),
    ).toEqual(["107", "170"]);
    await expect(search(page)).toHaveValue("소매처 7");
  });

  test("S4-8 maxLength 50(60자 → 50), 1280 1470에서 칩과 검색칸이 360 안, 가로 넘침 0", async ({
    page,
  }) => {
    await expect(search(page)).toHaveAttribute("maxlength", "50");
    await search(page).focus();
    await page.keyboard.insertText("가나다라마바사아자차".repeat(6));
    await expect(search(page)).toHaveValue("가나다라마바사아자차".repeat(5));

    for (const size of [
      { width: 1280, height: 800 },
      { width: 1470, height: 900 },
    ]) {
      await page.setViewportSize(size);
      const panel = await listRegion(page).boundingBox();
      const box = await search(page).locator("xpath=..").boundingBox();
      const group = await page
        .getByRole("radiogroup", { name: "대화 필터" })
        .boundingBox();
      expect(panel?.width).toBe(360);
      for (const inner of [box, group]) {
        expect(inner).not.toBeNull();
        if (inner === null || panel === null) continue;
        expect(inner.x).toBeGreaterThanOrEqual(panel.x);
        expect(inner.x + inner.width).toBeLessThanOrEqual(
          panel.x + panel.width,
        );
      }
      const overflow = await page.evaluate(() => ({
        x:
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
        y:
          document.documentElement.scrollHeight -
          document.documentElement.clientHeight,
      }));
      expect(overflow).toEqual({ x: 0, y: 0 });
    }
  });

  test("S4-9 ① 안 읽음에서 소매처 1 열기 → 15초 갱신 뒤 빠짐 ② 답 필요에서 소매처 4에 답 → 즉시 재조회 1회 뒤 빠짐 ③ 재조회 500이면 행 남음", async ({
    page,
  }) => {
    await test.step("① 15초 갱신(filter=UNREAD) 응답 뒤 빠짐, 오른쪽 방 그대로", async () => {
      await chip(page, "안 읽음").click();
      await expect(row(page, "소매처 2")).toHaveCount(0);
      await row(page, "소매처 1").click();
      await expect(roomTitle(page)).toHaveText("소매처 1");
      await expect
        .poll(async () => (await requests(page, READ_POST)).length)
        .toBe(1);
      await settled(page, READ_POST);
      await expect(row(page, "소매처 1")).toBeVisible();
      const before = await countCalls(page, { filter: "UNREAD" });
      await page.clock.fastForward(15_000);
      await expect
        .poll(() => countCalls(page, { filter: "UNREAD" }))
        .toBe(before + 1);
      await expect(row(page, "소매처 1")).toHaveCount(0);
      await expect(roomTitle(page)).toHaveText("소매처 1");
    });

    await test.step("② 답 필요에서 소매처 4에 답 → 재조회 1회 → 빠짐", async () => {
      await chip(page, "답 필요").click();
      await expect(chatRows(page)).toHaveCount(17);
      await row(page, "소매처 4").click();
      await expect(roomTitle(page)).toHaveText("소매처 4");
      await expect(composer(page)).toBeVisible();
      const before = await countCalls(page, { filter: "NEEDS_REPLY" });
      await composer(page).fill("내일 오전 10시요");
      await composer(page).press("Enter");
      await expect(row(page, "소매처 4")).toHaveCount(0);
      expect(await countCalls(page, { filter: "NEEDS_REPLY" })).toBe(
        before + 1,
      );
      await expect(chatRows(page)).toHaveCount(16);
      await expect(roomTitle(page)).toHaveText("소매처 4");
    });

    await test.step("③ 안 읽음 재조회가 500이면 행이 남고 오류를 안 띄운다", async () => {
      await chip(page, "안 읽음").click();
      await expect(row(page, "소매처 3")).toBeVisible();
      const reads = (await requests(page, READ_POST)).length;
      await row(page, "소매처 3").click();
      await expect(roomTitle(page)).toHaveText("소매처 3");
      await expect
        .poll(async () => (await requests(page, READ_POST)).length)
        .toBe(reads + 1);
      await settled(page, READ_POST);
      await knob(page, "fail", { op: "rooms", status: 500 });
      const before = await countCalls(page, { filter: "UNREAD" });
      await page.clock.fastForward(15_000);
      await expect
        .poll(() => countCalls(page, { filter: "UNREAD" }))
        .toBe(before + 1);
      await settled(page, ROOMS_GET);
      expect((await roomListCalls(page)).at(-1)?.status).toBe(500);
      await expect(row(page, "소매처 3")).toBeVisible();
      await expect(rowsArea(page).getByRole("alert")).toHaveCount(0);
      await expect(roomTitle(page)).toHaveText("소매처 3");
    });
  });

  test("S4-10 조합 중 input 3회 + 1초 → 요청 0, compositionend → 300ms 뒤 1회. 글자 사이 400ms 3글자 → 3회", async ({
    page,
  }) => {
    const input = search(page);
    const typed = (value: string) =>
      input.evaluate((el, v) => {
        const field = el as HTMLInputElement;
        const setter = Object.getOwnPropertyDescriptor(
          HTMLInputElement.prototype,
          "value",
        )?.set;
        setter?.call(field, v);
        field.dispatchEvent(
          new InputEvent("input", { bubbles: true, data: v.slice(-1) }),
        );
      }, value);
    const searched = async () =>
      (await roomListCalls(page)).filter((c) => c.q !== null).length;
    /* 디바운스 타이머가 도는 순간 URL을 같이 바꾼다(replaceState, 같은 호출 안). 요청은 그 뒤 렌더에서 나가
       한 박자 늦으니, "몇 ms에 돌았나"는 URL로 재고 요청 수는 끝에서 센다 */
    const urlQ = () =>
      page.evaluate(() => new URL(location.href).searchParams.get("q"));

    await holdTimers(page);
    await input.dispatchEvent("compositionstart");
    await typed("ㅅ");
    await typed("소");
    await typed("솜");
    await page.clock.runFor(1000);
    expect(await urlQ()).toBeNull();
    expect(await searched()).toBe(0);

    await typed("소");
    await input.dispatchEvent("compositionend", { data: "소" });
    await page.clock.runFor(299);
    expect(await urlQ()).toBeNull();
    await page.clock.runFor(1);
    expect(await urlQ()).toBe("소");
    await expect.poll(searched).toBe(1);

    for (const value of ["소매", "소매처", "소매처 1"]) {
      await typed(value);
      await page.clock.runFor(299);
      expect(await urlQ()).not.toBe(value);
      await page.clock.runFor(101);
      expect(await urlQ()).toBe(value);
    }
    await expect.poll(searched).toBe(4);
    expect(
      (await roomListCalls(page)).filter((c) => c.q !== null).map((c) => c.q),
    ).toEqual(["소", "소매", "소매처", "소매처 1"]);
    await page.clock.resume();
  });

  test("S4-11 ② 선택 없이 없는상회 → 오른쪽 고르세요 그대로 ③ 방 3 열린 채 없는상회 → 오른쪽 방 3 그대로", async ({
    page,
  }) => {
    const pick = page.getByText("왼쪽 목록에서 대화를 고르세요");
    await expect(pick).toBeVisible();
    await search(page).fill("없는상회");
    await expect(
      listRegion(page).getByText("조건에 맞는 대화가 없어요"),
    ).toBeVisible();
    await expect(pick).toBeVisible();

    await search(page).fill("");
    await expect(chatRows(page)).toHaveCount(30);
    await row(page, "소매처 3").click();
    await expect(roomTitle(page)).toHaveText("소매처 3");
    await search(page).fill("없는상회");
    await expect(
      listRegion(page).getByText("조건에 맞는 대화가 없어요"),
    ).toBeVisible();
    await expect(roomTitle(page)).toHaveText("소매처 3");
    await expect(composer(page)).toBeVisible();
  });
});

test("S4-11 ① reset {rooms: 0} → 목록 빈 문구, 칩과 검색칸 0, 오른쪽 빈 패널", async ({
  page,
}) => {
  await enterChats(page, { rooms: 0 });
  await expect(
    listRegion(page).getByText("아직 받은 문의가 없어요"),
  ).toBeVisible();
  await expect(page.getByRole("radiogroup", { name: "대화 필터" })).toHaveCount(
    0,
  );
  await expect(search(page)).toHaveCount(0);
  await expect(page.getByText("왼쪽 목록에서 대화를 고르세요")).toHaveCount(0);
});
