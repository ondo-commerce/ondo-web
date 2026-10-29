import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  composer,
  count,
  countLoginNavigations,
  installClock,
  log,
  login,
  mock,
  openChats,
  ROOMS_GET,
  row,
  settled,
  waitCount,
  watchRequests,
} from "../loop-04-chat/helpers";
import { requests } from "../loop-03-upload-lifecycle/helpers";

/**
 * #289 S9 도매 자동 답 끄기 + S7-13 도매 조회 시각. 와이어프레임 `17_wholesale-chat`
 * `#state-autoreply-switch` `#state-autoreply-off-flow` `#state-scene5` `#state-seen-f12`.
 *
 * 목은 페이지 안(MSW)이다 — `page.goto`마다 설정도 켜짐으로 돌아간다. `beforeEach`가 목 reset 200을 단언한다.
 */

const SETTINGS_GET = {
  path: /\/api\/wholesale\/chat\/auto-reply-settings$/,
  method: "GET",
} as const;
const SETTINGS_PUT = {
  path: /\/api\/wholesale\/chat\/auto-reply-settings$/,
  method: "PUT",
} as const;

const OFF_NOTICE =
  "자동 답변이 꺼져 있어요. 소매 문의는 사장님께 바로 전달돼요";
const FAILED = "설정을 바꾸지 못했어요. 다시 눌러 주세요";
const SESSION_LOST = "로그인이 끊겼어요. 다시 로그인하기 전엔 보낼 수 없어요";
const ASK = "레드 M 몇 장 있어요";

/** PUT 본문을 남긴다. `watchRequests`는 본문을 안 남겨서 따로 감싼다(`page.goto` 전에) */
async function recordSettingsPuts(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const puts: unknown[] = [];
    (window as unknown as { __settingsPuts: unknown[] }).__settingsPuts = puts;
    const original = window.fetch.bind(window);
    window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input.url;
      if (
        /auto-reply-settings$/.test(url) &&
        (init?.method ?? "GET").toUpperCase() === "PUT" &&
        typeof init?.body === "string"
      )
        puts.push(JSON.parse(init.body));
      return original(input, init);
    };
  });
}

function settingsPuts(page: Page): Promise<unknown[]> {
  return page.evaluate(
    () => (window as unknown as { __settingsPuts: unknown[] }).__settingsPuts,
  );
}

function autoSwitch(page: Page): Locator {
  return page.getByRole("switch", { name: "자동 답변", exact: true });
}

function listPanel(page: Page): Locator {
  return page.getByRole("region", { name: "대화 목록", exact: true });
}

/** 목 reset — 응답 200 을 단언한다(목이 살아 있다) */
async function resetMock(page: Page): Promise<void> {
  const status = await page.evaluate(async () => {
    const response = await fetch("/__mock/chat/reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    return response.status;
  });
  expect(status, "목 reset").toBe(200);
}

/** 흐르는 시계를 멈춘다. 멈춘 동안 목 지연(300ms)과 TanStack 알림(setTimeout 0)은 `runFor`로만 돈다 */
async function pauseClock(page: Page): Promise<void> {
  const now = await page.evaluate(() => Date.now());
  await page.clock.pauseAt(new Date(now + 200));
}

/** 설정 PUT 응답까지 멈춘 시계를 100ms씩 민다. 2초 안에 끝나 목록 polling(15초)은 안 나간다 */
async function flushPut(page: Page): Promise<void> {
  await expect
    .poll(async () => {
      await page.clock.runFor(100);
      const puts = await requests(page, SETTINGS_PUT);
      return (
        puts.length > 0 &&
        puts.every((r) => r.status !== null) &&
        (await autoSwitch(page).isEnabled())
      );
    })
    .toBe(true);
}

/** 꺼짐으로 바꾸고 안내가 뜰 때까지 */
async function turnOff(page: Page): Promise<void> {
  await autoSwitch(page).click();
  await expect(autoSwitch(page)).not.toBeChecked();
  await expect(listPanel(page).getByRole("status")).toHaveText(OFF_NOTICE);
}

/** 소매 메시지 주입 + 방 상품 문맥(2001). 목이 같은 생성기를 돌려 자동 답이나 넘김을 붙인다 */
function askStock(page: Page, roomId: number): Promise<void> {
  return mock(page, `rooms/${roomId}/incoming`, {
    body: ASK,
    contextListingId: 2001,
  });
}

/** 방 안 소매 말풍선 중 이 본문 */
function retailBubbles(page: Page, text: string): Locator {
  return log(page)
    .locator("[data-sequence]")
    .filter({ has: page.getByText(text, { exact: true }) });
}

test.beforeEach(async ({ page }) => {
  await watchRequests(page);
  await recordSettingsPuts(page);
  await installClock(page);
  await login(page);
  await openChats(page);
  await resetMock(page);
  await settled(page, SETTINGS_GET);
});

test.describe("S9-1 S9-2 목록 머리 스위치", () => {
  test("S9-1 /chats → 설정 GET 1회, 스위치 '자동 답변' 켜짐. 목록 polling 이 돌아도 GET 그대로", async ({
    page,
  }) => {
    await expect(autoSwitch(page)).toBeVisible();
    await expect(autoSwitch(page)).toBeChecked();
    await expect(autoSwitch(page)).toBeEnabled();
    // 이름은 스위치 하나만 — 보이는 글자는 낭독에서 숨긴다
    await expect(
      listPanel(page).getByText("자동 답변", { exact: true }),
    ).toHaveAttribute("aria-hidden", "true");
    // 자리: 목록 머리("채팅") 오른쪽, 방 패널에는 없다
    const title = await listPanel(page)
      .getByRole("heading", { name: "채팅" })
      .boundingBox();
    const sw = await autoSwitch(page).boundingBox();
    if (!title || !sw) throw new Error("상자 없음");
    expect(sw.x).toBeGreaterThan(title.x + title.width);
    expect(
      Math.abs(sw.y + sw.height / 2 - (title.y + title.height / 2)),
    ).toBeLessThan(12);

    const rooms = await count(page, ROOMS_GET);
    await page.clock.runFor(15_500);
    await waitCount(page, ROOMS_GET, rooms + 1);
    expect(await count(page, SETTINGS_GET)).toBe(1);
    await expect(listPanel(page).getByRole("status")).toHaveCount(0);
  });

  test("S9-2 끄기 → 즉시 저장 중 + 잠김(손잡이 그대로), 3연타 PUT 1회 {enabled false, intents 전부 true}, 꺼짐 안내", async ({
    page,
  }) => {
    await pauseClock(page);
    // 같은 틱 3연타 — disabled 가 그려지기 전의 두 번째, 세 번째 누름도 막혀야 한다
    await autoSwitch(page).evaluate((el) => {
      (el as HTMLButtonElement).click();
      (el as HTMLButtonElement).click();
      (el as HTMLButtonElement).click();
    });
    await page.clock.runFor(1);
    await expect(
      listPanel(page).getByText("저장 중", { exact: true }),
    ).toBeVisible();
    await expect(autoSwitch(page)).toBeDisabled();
    await expect(autoSwitch(page)).toHaveAttribute("aria-busy", "true");
    // 낙관 반영 없음 — 응답 전까지 켜짐
    await expect(autoSwitch(page)).toBeChecked();

    await flushPut(page);
    expect(await count(page, SETTINGS_PUT)).toBe(1);
    expect(await settingsPuts(page)).toEqual([
      {
        enabled: false,
        intents: { STOCK: true, BACKORDER: true, RECEIVABLE: true },
      },
    ]);
    await expect(autoSwitch(page)).not.toBeChecked();
    await expect(autoSwitch(page)).not.toHaveAttribute("aria-busy", "true");
    await expect(listPanel(page).getByText("저장 중")).toHaveCount(0);
    await expect(listPanel(page).getByRole("status")).toHaveText(OFF_NOTICE);

    // 다시 켜면 안내가 사라진다
    await autoSwitch(page).click();
    await flushPut(page);
    await expect(autoSwitch(page)).toBeChecked();
    await expect(listPanel(page).getByRole("status")).toHaveCount(0);
    expect(await count(page, SETTINGS_PUT)).toBe(2);
    expect(await count(page, SETTINGS_GET)).toBe(1);
  });
});

test.describe("S9-3 꺼짐 → 넘김만, 다시 켜면 자동 답 + 근거 칸", () => {
  test("꺼진 채 incoming 재고 문장 → HANDOFF 줄만(AUTO_REPLY 0). 켜고 같은 주입 → AUTO_REPLY + 근거 + 조회 시각", async ({
    page,
  }) => {
    await turnOff(page);
    await row(page, "봄봄상회").click();
    await expect(page).toHaveURL(/room=1$/);
    // 시드가 그려진 뒤에 센다(시드 재고 답 1개)
    await expect(log(page).locator('[data-kind="AUTO_REPLY"]')).toHaveCount(1);
    const autoBefore = await log(page)
      .locator('[data-kind="AUTO_REPLY"]')
      .count();
    const notesBefore = await log(page).getByRole("note").count();

    await askStock(page, 1);
    await expect(retailBubbles(page, ASK)).toHaveCount(1);
    await expect(log(page).getByRole("note")).toHaveCount(notesBefore + 1);
    await expect(log(page).getByRole("note").last()).toContainText(
      "자동 답변이 답하지 못했어요. 직접 답해 주세요",
    );
    await expect(log(page).locator('[data-kind="AUTO_REPLY"]')).toHaveCount(
      autoBefore,
    );
    // 넘김 줄이 방금 넣은 소매 글 뒤에 온다
    const order = await log(page)
      .locator("[data-sequence], [role=note]")
      .evaluateAll((nodes) =>
        nodes
          .slice(-2)
          .map((n) =>
            n.getAttribute("role") === "note" ? "note" : n.textContent,
          ),
      );
    expect(order[1]).toBe("note");
    expect(order[0]).toContain(ASK);
    await expect(row(page, "봄봄상회")).toContainText("답 필요");

    await autoSwitch(page).click();
    await expect(autoSwitch(page)).toBeChecked();
    await expect(listPanel(page).getByRole("status")).toHaveCount(0);

    await askStock(page, 1);
    await expect(retailBubbles(page, ASK)).toHaveCount(2);
    const auto = log(page).locator('[data-kind="AUTO_REPLY"]');
    await expect(auto).toHaveCount(autoBefore + 1);
    const latest = auto.last();
    await expect(latest).toContainText("레드 M은 10~49장 있어요");
    await expect(latest).toContainText("판매가능 35장, 주문 한도 500장");
    await expect(latest.locator('[data-ac~="S7-13"]')).toHaveText(
      /^소매처에게는 "10~49장"으로 보였어요\. \d{2}:\d{2} 조회$/,
    );
    // 넘김 줄은 더 늘지 않는다
    await expect(log(page).getByRole("note")).toHaveCount(notesBefore + 1);
  });
});

test.describe("S9-4 실패와 세션 끊김", () => {
  test("PUT 500 → 켜짐으로 돌아오고 alert 한 줄. 다시 누르면 문구 사라지고 PUT 1회 더", async ({
    page,
  }) => {
    await mock(page, "fail", { op: "settings", status: 500 });
    await autoSwitch(page).click();
    const alert = listPanel(page).getByRole("alert");
    await expect(alert).toHaveText(FAILED);
    await expect(autoSwitch(page)).toBeChecked();
    await expect(autoSwitch(page)).toBeEnabled();
    await expect(listPanel(page).getByRole("status")).toHaveCount(0);
    expect(await count(page, SETTINGS_PUT)).toBe(1);

    await autoSwitch(page).click();
    await expect(alert).toHaveCount(0);
    await expect(autoSwitch(page)).not.toBeChecked();
    await expect(listPanel(page).getByRole("status")).toHaveText(OFF_NOTICE);
    expect(await count(page, SETTINGS_PUT)).toBe(2);
  });

  test("PUT 401 → 채팅 세션 끊김: 쓰던 답 글과 주소 그대로, 스위치 잠김, /login 이동 0", async ({
    page,
  }) => {
    const logins = countLoginNavigations(page);
    await row(page, "봄봄상회").click();
    await expect(page).toHaveURL(/\/chats\?room=1$/);
    const draft = "레드 M 내일 들어와요";
    await composer(page).fill(draft);

    await mock(page, "fail", { op: "settings", status: 401 });
    await autoSwitch(page).click();
    await expect(page.getByText(SESSION_LOST).first()).toBeVisible();
    await expect(autoSwitch(page)).toBeDisabled();
    await expect(autoSwitch(page)).toBeChecked();
    await expect(composer(page)).toHaveValue(draft);
    await expect(composer(page)).toHaveAttribute("readonly", "");
    // 401 은 끊김 상태가 말한다 — 설정 실패 문구는 따로 안 띄운다
    await expect(listPanel(page).getByText(FAILED)).toHaveCount(0);

    await page.clock.runFor(16_000);
    await expect(page).toHaveURL(/\/chats\?room=1$/);
    await expect(composer(page)).toHaveValue(draft);
    expect(logins()).toBe(0);
    expect(await count(page, SETTINGS_PUT)).toBe(1);
  });
});

test.describe("S7-13 도매 조회 시각 (F12)", () => {
  test("방 1 재고, 되묻기 / 방 2 미수 / 새로 붙은 재고 답 — 자동 답 말풍선 전부 근거 칸 끝 줄 'HH:mm 조회'", async ({
    page,
  }) => {
    await row(page, "봄봄상회").click();
    const room1 = log(page).locator(
      '[data-kind="AUTO_REPLY"], [data-kind="CLARIFY"]',
    );
    await expect(room1).toHaveCount(2);
    await expect(
      log(page).locator('[data-kind="CLARIFY"] [data-ac~="S7-13"]'),
    ).toHaveText("09:20 조회");
    await expect(
      log(page).locator('[data-kind="AUTO_REPLY"] [data-ac~="S7-13"]'),
    ).toHaveText('소매처에게는 "10~49장"으로 보였어요. 09:22 조회');

    // 미수 — 앞말 없이 조회 시각만
    await row(page, "대기상회").click();
    await expect(page).toHaveURL(/room=2$/);
    const receivable = log(page).locator('[data-kind="AUTO_REPLY"]').first();
    await expect(receivable).toContainText("미결제 786,000원, 선수금 0원");
    // 시드 checkedAt 06:00(서울). 말풍선 시각이 아니라 checkedAt 이다
    await expect(receivable.locator('[data-ac~="S7-13"]')).toHaveText(
      "06:00 조회",
    );

    // 방마다 자동 답 말풍선 수 = 조회 시각 줄 수(방 2는 미수 1개)
    const room2 = log(page).locator(
      '[data-kind="AUTO_REPLY"], [data-kind="CLARIFY"]',
    );
    await expect(room2).toHaveCount(1);
    await expect(room2.locator('[data-ac~="S7-13"]')).toHaveCount(1);

    // 새로 생긴 자동 답(목 생성기)도 같다 — 방 1에 재고 문장 주입
    await row(page, "봄봄상회").click();
    await expect(page).toHaveURL(/room=1$/);
    await expect(room1).toHaveCount(2);
    await askStock(page, 1);
    await expect(room1).toHaveCount(3);
    await expect(room1.locator('[data-ac~="S7-13"]')).toHaveCount(3);
    for (const text of await room1
      .locator('[data-ac~="S7-13"]')
      .allTextContents())
      expect(text).toMatch(/(^|\. )\d{2}:\d{2} 조회$/);
  });
});
