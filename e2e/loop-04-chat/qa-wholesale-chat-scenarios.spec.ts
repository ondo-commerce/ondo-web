import { expect, test, type Page } from "@playwright/test";
import path from "node:path";
import {
  bubbles,
  composer,
  count,
  incoming,
  installClock,
  log,
  login,
  messageGets,
  MESSAGES_GET,
  mock,
  openChats,
  READ_POST,
  roomList,
  row,
  ROOMS_GET,
  SEND_POST,
  settled,
  setVisibility,
  waitCount,
  watchRequests,
} from "./helpers";

/**
 * loop-04-chat QA — 사장 시나리오 (a)~(e)와 개발 e2e가 안 보는 자리.
 * 개발 spec(`wholesale-chat-*.spec.ts`)과 같은 helpers를 쓴다. mock 모드(3100).
 *
 * `test.fail`은 지금 제품이 틀린 자리다(04-qa.md finding 번호를 제목에 붙였다). 고치면 이 표시를 지운다.
 */

const QA_DIR = path.join(
  __dirname,
  "../../.claude/harness/runs/loop-04-chat/qa",
);

/** 보내기 POST의 Idempotency-Key 를 페이지 fetch 에서 직접 적는다(helpers 의 감시는 헤더를 안 남긴다) */
async function watchSendKeys(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const keys: string[] = [];
    (window as unknown as { __sendKeys: string[] }).__sendKeys = keys;
    const original = window.fetch.bind(window);
    window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input.url;
      if (
        (init?.method ?? "GET").toUpperCase() === "POST" &&
        /\/api\/wholesale\/chat\/rooms\/\d+\/messages$/.test(url)
      )
        keys.push(new Headers(init?.headers).get("Idempotency-Key") ?? "");
      return original(input, init);
    };
  });
}

function sendKeys(page: Page): Promise<string[]> {
  return page.evaluate(
    () => (window as unknown as { __sendKeys: string[] }).__sendKeys,
  );
}

/** `/login` 으로 간 횟수. 전체 이동이면 쓴 글이 사라진다 */
function countLoginNavigations(page: Page): () => number {
  let n = 0;
  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame() && /\/login/.test(frame.url())) n++;
  });
  return () => n;
}

function liveRegion(page: Page) {
  return page.locator('[aria-live="polite"][data-ac="S3-8"]');
}

function sendButton(page: Page) {
  return page.getByRole("button", { name: "보내기", exact: true });
}

function pending(page: Page) {
  return log(page).locator("[data-pending]");
}

function sentBubble(page: Page, text: string) {
  return bubbles(page).filter({ has: page.getByText(text, { exact: true }) });
}

/** 개발 polling spec 과 같은 방식: 흐르는 시계를 0.5초 앞에서 멈추고 나간 요청을 받는다 */
async function pauseClock(page: Page): Promise<void> {
  const now = await page.evaluate(() => Date.now());
  await page.clock.pauseAt(new Date(now + 500));
  await settled(page, MESSAGES_GET);
}

test.beforeEach(async ({ page }) => {
  await watchRequests(page);
  await watchSendKeys(page);
  await installClock(page);
  await login(page);
});

test("(a) 헤더 채팅 → 목록 → 안 읽은 방 열기 → 배지 0, 읽음 1회", async ({
  page,
}) => {
  await page.goto("/orders");
  await page.getByRole("link", { name: /^채팅(, 답 필요 \d+건)?$/ }).click();
  await page.waitForURL(/\/chats$/);
  const unread = row(page, "봄봄상회").locator("[data-unread]");
  await expect(unread).toHaveCount(1);
  await page.screenshot({ path: path.join(QA_DIR, "a-list-1470.png") });
  await row(page, "봄봄상회").click();
  await page.waitForURL(/\/chats\?room=1$/);
  await waitCount(page, READ_POST, 1);
  await expect(unread).toHaveCount(0);
  await expect(composer(page)).toBeFocused();
  await page.screenshot({ path: path.join(QA_DIR, "a-room1-1470.png") });
  expect(await count(page, READ_POST)).toBe(1);
});

test.describe("(b) Enter, Shift+Enter, 한글 조합", () => {
  test("Shift+Enter 두 줄 → Enter 1회 → 말풍선 두 줄 그대로", async ({
    page,
  }) => {
    await openChats(page, 1);
    await composer(page).click();
    await page.keyboard.type("블랙 M 12장은 오늘");
    await page.keyboard.press("Shift+Enter");
    await page.keyboard.type("나머지는 금요일");
    expect(await count(page, SEND_POST)).toBe(0);
    await page.keyboard.press("Enter");
    await waitCount(page, SEND_POST, 1);
    await expect(
      sentBubble(page, "블랙 M 12장은 오늘\n나머지는 금요일"),
    ).toHaveCount(1);
    await expect(composer(page)).toHaveValue("");
  });

  test("조합 중 keydown(isComposing, keyCode 229) 은 보내지 않는다", async ({
    page,
  }) => {
    await openChats(page, 1);
    await composer(page).fill("네");
    // Chrome 한글 IME 는 조합을 끝내는 Enter 를 isComposing=true 로, Safari 는 compositionend 뒤 keyCode 229 로 보낸다
    const sentBefore = await count(page, SEND_POST);
    await composer(page).evaluate((el) => {
      el.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Enter",
          isComposing: true,
          bubbles: true,
          cancelable: true,
        }),
      );
      el.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Enter",
          keyCode: 229,
          bubbles: true,
          cancelable: true,
        }),
      );
    });
    await page.clock.runFor(500);
    expect(await count(page, SEND_POST)).toBe(sentBefore);
    await expect(composer(page)).toHaveValue("네");
    await expect(pending(page)).toHaveCount(0);
  });
});

test("(c) fail500once → 다시 보내기 → 성공, 두 요청의 Idempotency-Key 가 같다", async ({
  page,
}) => {
  await openChats(page, 1);
  await composer(page).fill("fail500once 장당 500원 빼 드릴게요");
  await composer(page).press("Enter");
  const failed = pending(page);
  await expect(failed).toHaveAttribute("data-pending", "failed");
  await expect(failed.getByRole("alert")).toContainText("못 보냈어요");
  await page.screenshot({ path: path.join(QA_DIR, "c-failed-1470.png") });
  const clientId = await failed.getAttribute("data-client-id");

  await failed
    .getByRole("button", { name: "다시 보내기", exact: true })
    .click();
  const sent = sentBubble(page, "fail500once 장당 500원 빼 드릴게요");
  await expect(sent).toHaveCount(1);
  await expect(pending(page)).toHaveCount(0);

  const keys = await sendKeys(page);
  expect(keys).toHaveLength(2);
  expect(keys[0]).toMatch(/^[0-9a-f-]{36}$/);
  expect(keys[1]).toBe(keys[0]);
  expect(clientId).toBe(keys[0]);
  await expect(sent).toHaveAttribute("data-client-id", keys[0] ?? "");
  const statuses = (await page.evaluate(() =>
    (
      window as unknown as {
        __watch: {
          requests: { url: string; method: string; status: number | null }[];
        };
      }
    ).__watch.requests
      .filter(
        (r) => r.method === "POST" && /\/chat\/rooms\/1\/messages$/.test(r.url),
      )
      .map((r) => r.status),
  )) as (number | null)[];
  expect(statuses).toEqual([500, 201]);
});

test("(d) 상대 메시지 주입 → 3초 안에 표시, live 영역 갱신 정확히 1회", async ({
  page,
}) => {
  await openChats(page, 1);
  await expect(bubbles(page)).toHaveCount(7);
  await pauseClock(page);
  // live 영역 글자가 바뀐 횟수를 센다(빈 글자 → 무엇, 무엇 → 다른 것)
  await liveRegion(page).evaluate((el) => {
    const w = window as unknown as { __live: string[] };
    w.__live = [];
    let last = el.textContent ?? "";
    new MutationObserver(() => {
      const now = el.textContent ?? "";
      if (now !== last) w.__live.push(now);
      last = now;
    }).observe(el, { childList: true, characterData: true, subtree: true });
  });
  const before = await count(page, MESSAGES_GET);
  await incoming(page, 1, "혹시 차콜 L 있어요?");
  await page.clock.runFor(3_000);
  await waitCount(page, MESSAGES_GET, before + 1);
  await settled(page, MESSAGES_GET);
  await expect
    .poll(async () => {
      await page.clock.runFor(1);
      return sentBubble(page, "혹시 차콜 L 있어요?").count();
    })
    .toBe(1);
  // 새 것 없는 polling 두 번, 그리고 내가 보낸 말 — live 는 그대로
  await page.clock.runFor(6_100);
  await settled(page, MESSAGES_GET);
  await page.clock.runFor(10);
  const changes = await page.evaluate(
    () => (window as unknown as { __live: string[] }).__live,
  );
  expect(changes).toEqual(["봄봄상회: 혹시 차콜 L 있어요?"]);
});

test("(d') 같은 본문의 소매 메시지가 연달아 오면 두 번째도 낭독 갱신이 있어야 한다 — F8", async ({
  page,
}) => {
  await openChats(page, 1);
  await expect(bubbles(page)).toHaveCount(7);
  await pauseClock(page);
  await liveRegion(page).evaluate((el) => {
    const w = window as unknown as { __liveMut: number };
    w.__liveMut = 0;
    new MutationObserver(() => {
      w.__liveMut++;
    }).observe(el, { childList: true, characterData: true, subtree: true });
  });
  for (let i = 0; i < 2; i++) {
    const before = await count(page, MESSAGES_GET);
    await incoming(page, 1, "네");
    await page.clock.runFor(3_000);
    await waitCount(page, MESSAGES_GET, before + 1);
    await settled(page, MESSAGES_GET);
    await expect
      .poll(async () => {
        await page.clock.runFor(1);
        return sentBubble(page, "네").count();
      })
      .toBe(i + 1);
  }
  const mutations = await page.evaluate(
    () => (window as unknown as { __liveMut: number }).__liveMut,
  );
  // 증거: 04-qa.md 에 mutations 값(1)과 live 텍스트를 적었다
  expect(mutations).toBeGreaterThanOrEqual(2);
});

test.describe("(e) 401 — 쓴 글 남고 보내기 잠김, /login 이동 0", () => {
  test("보내기 auth401 → 실패 말풍선에 글, 잠김, 30초 동안 /login 0", async ({
    page,
  }) => {
    const logins = countLoginNavigations(page);
    await openChats(page, 1);
    await composer(page).fill("auth401 30장이면 장당 500원 빼 드릴게요");
    await composer(page).press("Enter");
    await expect(pending(page)).toHaveAttribute("data-pending", "failed");
    await expect(pending(page)).toContainText(
      "30장이면 장당 500원 빼 드릴게요",
    );
    await expect(sendButton(page)).toBeDisabled();
    await expect(composer(page)).toHaveAttribute("readonly", "");
    await page.screenshot({ path: path.join(QA_DIR, "e-401-1470.png") });
    await page.clock.fastForward(30_000);
    expect(logins()).toBe(0);
    expect(page.url()).toContain("/chats?room=1");
  });

  test("세션이 끊긴 뒤 목록 15초 polling 도 401 이어도 /login 으로 가지 않고 쓴 글이 남는다 — F1", async ({
    page,
  }) => {
    const logins = countLoginNavigations(page);
    await openChats(page, 1);
    await composer(page).fill("그리고 차콜 L은 10장 남았어요");
    // 실서버에서 세션이 끊기면 모든 요청이 401 이다. 목에선 op 마다 걸어 흉내 낸다
    await mock(page, "fail", { op: "messages", status: 401, times: 5 });
    await mock(page, "fail", { op: "rooms", status: 401, times: 5 });
    await page.clock.fastForward(3_000);
    await expect(composer(page)).toHaveAttribute("readonly", "");
    await page.clock.fastForward(15_000);
    await page.clock.fastForward(1_000);
    // 증거: 실패 시점 URL 과 /login 이동 수를 04-qa.md 에 적었다
    expect(logins(), `url=${page.url()}`).toBe(0);
    await expect(composer(page)).toHaveValue("그리고 차콜 L은 10장 남았어요");
  });

  test("세션이 끊긴 뒤 창 복귀만으로는 /login 으로 가지 않는다(가드, 방 머리와 목록 401)", async ({
    page,
  }) => {
    const logins = countLoginNavigations(page);
    await openChats(page, 1);
    await composer(page).fill("auth401 장당 500원");
    await composer(page).press("Enter");
    await expect(composer(page)).toHaveAttribute("readonly", "");
    await mock(page, "fail", { op: "room", status: 401, times: 5 });
    await mock(page, "fail", { op: "rooms", status: 401, times: 5 });
    await setVisibility(page, "hidden");
    await setVisibility(page, "visible");
    await page.clock.fastForward(1_000);
    expect(logins(), `url=${page.url()}`).toBe(0);
    await expect(pending(page)).toContainText("장당 500원");
  });
});

test("cursor 가드: 보내는 사이 커밋된 소매 메시지를 다음 polling 이 받는다", async ({
  page,
}) => {
  await openChats(page, 1);
  await expect(bubbles(page)).toHaveCount(7);
  await pauseClock(page);
  const before = await count(page, MESSAGES_GET);
  // 소매 8번이 먼저 커밋되고, 내 보내기가 9번이 된다. polling 은 아직 8번을 못 봤다
  await incoming(page, 1, "보내는 사이 온 소매 글");
  await composer(page).fill("사장 답");
  await composer(page).press("Enter");
  // 목 보내기 지연(300ms)은 요청이 목에 닿은 뒤 걸린다 — 닿을 때까지 기다린 뒤 50ms씩 민다(합쳐도 3초 전)
  await waitCount(page, SEND_POST, 1);
  await expect
    .poll(async () => {
      await page.clock.runFor(50);
      return sentBubble(page, "사장 답").count();
    })
    .toBe(1);
  await page.clock.runFor(3_000);
  await waitCount(page, MESSAGES_GET, before + 1);
  expect((await messageGets(page)).at(-1)?.url).toContain("afterSequence=7");
  await settled(page, MESSAGES_GET);
  await expect
    .poll(async () => {
      await page.clock.runFor(1);
      return sentBubble(page, "보내는 사이 온 소매 글").count();
    })
    .toBe(1);
  // 순서: 소매 8 → 나 9
  const seqs = await bubbles(page).evaluateAll((n) =>
    n.slice(-2).map((x) => Number((x as HTMLElement).dataset.sequence)),
  );
  expect(seqs).toEqual([8, 9]);
});

test.describe("키보드 계약 보강", () => {
  test("방이 열린 상태로 Tab 으로 목록에 들어오면 선택 행이 포커스", async ({
    page,
  }) => {
    await openChats(page);
    await row(page, "대기상회").click();
    await page.waitForURL(/room=2$/);
    await page.getByRole("link", { name: /^채팅(, 답 필요 \d+건)?$/ }).focus();
    let id: string | undefined;
    for (let i = 0; i < 8; i++) {
      await page.keyboard.press("Tab");
      id = await page.evaluate(
        () => (document.activeElement as HTMLElement | null)?.dataset.roomId,
      );
      if (id !== undefined) break;
    }
    expect(id).toBe("2");
  });

  test("↓ 로 끝 행까지 가면 이어 받기, 32행", async ({ page }) => {
    await openChats(page);
    const first = roomList(page).locator("a[data-room-id]").first();
    await first.focus();
    for (let i = 0; i < 31; i++) await page.keyboard.press("ArrowDown");
    await expect(roomList(page).locator("a[data-room-id]")).toHaveCount(32);
  });
});

test("디자인 실측 — 목록 폭, 말풍선 색과 반경, 보내는 중 대비, 헤더 아이콘", async ({
  page,
}) => {
  await openChats(page, 1);
  await composer(page).fill("slow5s 보내는 중 실측");
  await composer(page).press("Enter");
  await expect(pending(page)).toHaveAttribute("data-pending", "sending");
  await page.screenshot({ path: path.join(QA_DIR, "design-sending-1470.png") });

  const m = await page.evaluate(() => {
    const ctx = document.createElement("canvas").getContext("2d");
    const rgb = (c: string) => {
      if (!ctx) return [0, 0, 0];
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = "#000";
      ctx.fillStyle = c;
      ctx.fillRect(0, 0, 1, 1);
      return [...ctx.getImageData(0, 0, 1, 1).data].slice(0, 3);
    };
    const lum = ([r, g, b]: number[]) => {
      const f = (v: number) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * f(r ?? 0) + 0.7152 * f(g ?? 0) + 0.0722 * f(b ?? 0);
    };
    const ratio = (a: string, b: string) => {
      const [x, y] = [lum(rgb(a)), lum(rgb(b))].sort((p, q) => q - p);
      return Math.round((((x ?? 0) + 0.05) / ((y ?? 0) + 0.05)) * 100) / 100;
    };
    const root = getComputedStyle(document.documentElement);
    const token = (n: string) => rgb(root.getPropertyValue(n).trim()).join(",");
    const cs = (el: Element | null) => (el ? getComputedStyle(el) : null);
    const q = (s: string) => document.querySelector(s);
    const listPanel = document.querySelector(
      '[role="region"][aria-label="대화 목록"]',
    );
    const themBubble = [...document.querySelectorAll("[data-sequence]")]
      .find((n) => n.classList.contains("self-start"))
      ?.querySelector("div");
    const meBubble = [
      ...document.querySelectorAll('[data-sequence][data-kind="TEXT"]'),
    ]
      .find((n) => n.classList.contains("self-end"))
      ?.querySelector("div");
    const sendingMeta = q('[data-pending="sending"] > span:last-child');
    const chat = q('a[aria-label^="채팅"]');
    const bell = q('button[aria-label^="알림"]');
    const card = root.getPropertyValue("--color-card").trim();
    return {
      listWidth: listPanel?.getBoundingClientRect().width,
      themBg: rgb(cs(themBubble ?? null)?.backgroundColor ?? "").join(","),
      tokenSecondary: token("--color-secondary"),
      meBg: rgb(cs(meBubble ?? null)?.backgroundColor ?? "").join(","),
      tokenPrimary: token("--color-primary"),
      themRadius: cs(themBubble ?? null)?.borderRadius,
      tokenRadiusControl: root.getPropertyValue("--radius-control").trim(),
      meText: ratio(
        cs(meBubble ?? null)?.color ?? "",
        cs(meBubble ?? null)?.backgroundColor ?? "",
      ),
      themText: ratio(
        cs(themBubble ?? null)?.color ?? "",
        cs(themBubble ?? null)?.backgroundColor ?? "",
      ),
      sendingColor: cs(sendingMeta)?.color,
      sendingFont: cs(sendingMeta)?.fontSize,
      sendingOnCard: ratio(cs(sendingMeta)?.color ?? "", card),
      chatSize: chat?.getBoundingClientRect().width,
      bellSize: bell?.getBoundingClientRect().width,
    };
  });
  test
    .info()
    .annotations.push({ type: "design", description: JSON.stringify(m) });
  expect(m.listWidth).toBe(360);
  expect(m.themBg).toBe(m.tokenSecondary);
  expect(m.meBg).toBe(m.tokenPrimary);
  expect(m.sendingOnCard).toBeGreaterThanOrEqual(4.5);
  expect(m.meText).toBeGreaterThanOrEqual(4.5);
  expect(m.themText).toBeGreaterThanOrEqual(4.5);
});

test("디자인 실측 2 — 실패 말풍선, 선택 행, 시스템 줄, 근거 칸 대비", async ({
  page,
}) => {
  await openChats(page);
  await row(page, "대기상회").click();
  await expect(log(page).getByRole("note")).toBeVisible();
  await composer(page).fill("fail500 실측");
  await composer(page).press("Enter");
  await expect(pending(page)).toHaveAttribute("data-pending", "failed");
  await page.screenshot({
    path: path.join(QA_DIR, "design-failed-room2-1470.png"),
  });

  const m = await page.evaluate(() => {
    const ctx = document.createElement("canvas").getContext("2d");
    const rgb = (c: string) => {
      if (!ctx) return [0, 0, 0];
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = "#000";
      ctx.fillStyle = c;
      ctx.fillRect(0, 0, 1, 1);
      return [...ctx.getImageData(0, 0, 1, 1).data].slice(0, 3);
    };
    const lum = ([r, g, b]: number[]) => {
      const f = (v: number) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * f(r ?? 0) + 0.7152 * f(g ?? 0) + 0.0722 * f(b ?? 0);
    };
    const ratio = (a: string, b: string) => {
      const [x, y] = [lum(rgb(a)), lum(rgb(b))].sort((p, q) => q - p);
      return Math.round((((x ?? 0) + 0.05) / ((y ?? 0) + 0.05)) * 100) / 100;
    };
    const root = getComputedStyle(document.documentElement);
    const token = (n: string) => rgb(root.getPropertyValue(n).trim()).join(",");
    const card = root.getPropertyValue("--color-card").trim();
    const cs = (el: Element | null | undefined) =>
      el ? getComputedStyle(el) : null;
    const failedBubble = document.querySelector(
      '[data-pending="failed"] > div',
    );
    const failText = document.querySelector(
      '[data-pending="failed"] [role="alert"]',
    );
    const retry = [
      ...document.querySelectorAll('[data-pending="failed"] button'),
    ].find((b) => b.textContent === "다시 보내기");
    const selected = document.querySelector(
      'a[aria-current="true"][data-room-id]',
    );
    const selPreview = selected?.querySelectorAll(":scope > span")[2];
    const selBg = cs(selected)?.backgroundColor ?? "";
    const note = document.querySelector('[role="note"]');
    return {
      failedBorder: rgb(cs(failedBubble)?.borderTopColor ?? "").join(","),
      tokenDestructive: token("--color-destructive"),
      failTextOnCard: ratio(cs(failText)?.color ?? "", card),
      retryColor: rgb(cs(retry)?.color ?? "").join(","),
      tokenPrimary: token("--color-primary"),
      retryOnCard: ratio(cs(retry)?.color ?? "", card),
      selectedPreviewOnSecondary: ratio(cs(selPreview)?.color ?? "", selBg),
      selectedBg: rgb(selBg).join(","),
      tokenSecondary: token("--color-secondary"),
      noteBorder: rgb(cs(note)?.borderTopColor ?? "").join(","),
      tokenBorderStrong: token("--color-border-strong"),
      noteTextOnCard: ratio(cs(note)?.color ?? "", card),
    };
  });
  test
    .info()
    .annotations.push({ type: "design", description: JSON.stringify(m) });
  expect(m.failedBorder).toBe(m.tokenDestructive);
  expect(m.selectedBg).toBe(m.tokenSecondary);
  expect(m.noteBorder).toBe(m.tokenBorderStrong);
  expect(m.failTextOnCard).toBeGreaterThanOrEqual(4.5);
  expect(m.retryOnCard).toBeGreaterThanOrEqual(4.5);
  expect(m.selectedPreviewOnSecondary).toBeGreaterThanOrEqual(4.5);
  expect(m.noteTextOnCard).toBeGreaterThanOrEqual(4.5);
});

test("1280 폭 — 목록 360 고정, 가로 스크롤 0, 긴 말풍선 방 안", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openChats(page, 1);
  await expect(bubbles(page)).toHaveCount(7);
  await page.screenshot({ path: path.join(QA_DIR, "room1-1280.png") });
  const r = await page.evaluate(() => ({
    scrollW: document.documentElement.scrollWidth,
    list: document
      .querySelector('[role="region"][aria-label="대화 목록"]')
      ?.getBoundingClientRect().width,
  }));
  expect(r.scrollW).toBe(1280);
  expect(r.list).toBe(360);
});

test("I-4 #4 목록 15초 재조회는 받은 페이지 전부(2장 → 요청 2), 32행 중복 0", async ({
  page,
}) => {
  await openChats(page);
  const links = roomList(page).locator("a[data-room-id]");
  await links.last().scrollIntoViewIfNeeded();
  await expect(links).toHaveCount(32);
  await settled(page, ROOMS_GET);
  const before = await count(page, ROOMS_GET);
  // 2페이지에 있던 방(가장 오래된 방)에 새 말 → 다음 재조회 뒤 맨 위로, 두 번 보이지 않는다
  const lastId = await links.last().getAttribute("data-room-id");
  await incoming(page, Number(lastId), "오래된 방의 새 문의");
  await page.clock.fastForward(15_000);
  await waitCount(page, ROOMS_GET, before + 2);
  await settled(page, ROOMS_GET);
  await expect(links.first()).toHaveAttribute("data-room-id", lastId ?? "");
  const ids = await links.evaluateAll((n) =>
    n.map((x) => (x as HTMLElement).dataset.roomId),
  );
  expect(ids).toHaveLength(32);
  expect(new Set(ids).size).toBe(32);
});
