import { expect, test, type Page } from "@playwright/test";
import {
  ANY_CHAT,
  appAlert,
  assertStubServers,
  box,
  bubbles,
  composer,
  count,
  enterRoom,
  incoming,
  log,
  mock,
  openProduct,
  openRoom,
  pageOverflow,
  sendButton,
  signIn,
  watchRequests,
} from "./helpers";

/**
 * loop-05a QA — #285 기능(열린 방 polling, 세션 끊김)을 보는 것만 모았다. `qa-retail-chat.spec.ts`에서
 * 떼어 #285 커밋에 둔다 — #284 HEAD에는 polling과 세션 어댑터가 없어 여기 테스트가 돌 수 없다.
 * 실행은 `pnpm e2e:stub`(stub 3199 + retail 3101 목 모드).
 *
 * F3 테스트(긴 대화 뒤 페이지 스크롤 0)는 처음엔 `test.fail`이었다. review-fix(#284)에서 고쳐 표시를 지웠다.
 */

const QA = ".claude/harness/runs/loop-05a-retail-chat/qa";
const SESSION_LOST = "로그인이 끊겼어요. 다시 로그인하기 전엔 보낼 수 없어요";

assertStubServers();

test.beforeEach(async ({ page }) => {
  await watchRequests(page);
  await signIn(page);
});

/** live 영역에 새 노드가 붙을 때마다 그 글을 모은다 */
async function watchLive(page: Page) {
  await page.locator('[aria-live="polite"][data-ac="S6-11"]').evaluate((el) => {
    const w = window as unknown as { __live: string[] };
    w.__live = [];
    new MutationObserver((records) => {
      for (const r of records)
        for (const n of r.addedNodes) w.__live.push(n.textContent ?? "");
    }).observe(el, { childList: true });
  });
  return () =>
    page.evaluate(() => (window as unknown as { __live: string[] }).__live);
}

async function center(page: Page) {
  const area = await box(log(page));
  return area.x + area.width / 2;
}

test("(b) 내 글은 오른쪽이고 낭독 안 함, 도매 답은 왼쪽에 1회 낭독, 그 뒤 내 글도 낭독 안 함", async ({
  page,
}) => {
  await page.clock.install({ time: new Date("2026-10-28T10:30:00+09:00") });
  await openRoom(page, "/chats/1");
  // 05b(#288)부터 소매 보내기에 자동 답이 붙는다. 이 테스트는 "내 글" 낭독만 보므로 이 탭의 자동 답을 끈다
  // (꺼지면 넘김 줄만 생긴다 — SYSTEM 줄은 낭독하지 않고 말풍선 수에도 안 든다)
  await mock(page, "auto-reply", { enabled: false });
  const live = await watchLive(page);
  const mid = await center(page);

  await composer(page).fill("레드 M 몇 장 있어요?");
  await composer(page).press("Enter");
  const mine = bubbles(page).filter({
    has: page.getByText("레드 M 몇 장 있어요?", { exact: true }),
  });
  await expect(mine).toHaveCount(1);
  expect((await box(mine)).x).toBeGreaterThan(mid);
  await page.clock.fastForward(3_000);
  expect(await live()).toEqual([]);

  await incoming(page, 1, "네 10장 넘게 있어요");
  await page.clock.fastForward(3_000);
  const reply = bubbles(page).filter({
    has: page.getByText("네 10장 넘게 있어요", { exact: true }),
  });
  await expect(reply).toHaveCount(1);
  await expect(reply).toHaveAttribute("data-sender", "WHOLESALER");
  const r = await box(reply);
  expect(r.x + r.width).toBeLessThan(mid);
  await expect.poll(live).toEqual(["무드온: 네 10장 넘게 있어요"]);

  // 답을 받은 뒤 내가 또 써도 live는 그대로(새 노드 0)
  await composer(page).fill("감사해요");
  await composer(page).press("Enter");
  await expect(
    bubbles(page).filter({ has: page.getByText("감사해요", { exact: true }) }),
  ).toHaveCount(1);
  await page.clock.fastForward(3_000);
  await page.clock.fastForward(3_000);
  expect(await live()).toEqual(["무드온: 네 10장 넘게 있어요"]);
  await page.screenshot({ path: `${QA}/b-send-receive-1470.png` });
});

test("(e) 쓰는 중 401 → 쓴 글 그대로, 전역 이동 0, 주소 그대로, 이후 채팅 요청 0", async ({
  page,
}) => {
  await page.clock.install({ time: new Date("2026-10-28T10:30:00+09:00") });
  await openProduct(page, 11);
  await enterRoom(page, 1, "/products/11");
  await expect(log(page)).toBeVisible();
  let navigations = 0;
  page.on("framenavigated", (f) => {
    if (f === page.mainFrame()) navigations += 1;
  });
  // 실패 말풍선 하나 + 쓰던 글 하나를 같이 둔다
  await composer(page).fill("auth401 오늘 출고 되나요?");
  await composer(page).press("Enter");
  await expect(appAlert(page).filter({ hasText: SESSION_LOST })).toBeVisible();
  await expect(log(page).locator('[data-pending="failed"]')).toContainText(
    "오늘 출고 되나요?",
  );
  await expect(composer(page)).toHaveAttribute("readonly", "");
  await expect(sendButton(page)).toBeDisabled();

  const chatBefore = await count(page, ANY_CHAT);
  await page.clock.fastForward(60_000);
  expect(await count(page, ANY_CHAT)).toBe(chatBefore);
  expect(navigations).toBe(0);
  expect(new URL(page.url()).pathname).toBe("/chats/1");
  await page.screenshot({ path: `${QA}/e-session-lost-1470.png` });
});

test("(e2) polling 401 때 입력창에 쓰던 글이 그대로 남는다", async ({
  page,
}) => {
  await page.clock.install({ time: new Date("2026-10-28T10:30:00+09:00") });
  await openRoom(page, "/chats/1");
  let navigations = 0;
  page.on("framenavigated", (f) => {
    if (f === page.mainFrame()) navigations += 1;
  });
  await composer(page).fill("블랙 L도 같이 주세요");
  await mock(page, "fail", { op: "messages", status: 401, times: 5 });
  await page.clock.fastForward(3_000);
  await expect(appAlert(page).filter({ hasText: SESSION_LOST })).toBeVisible();
  await expect(composer(page)).toHaveValue("블랙 L도 같이 주세요");
  expect(navigations).toBe(0);
});

test.describe("390", () => {
  for (const height of [844, 544]) {
    test(`오류 두 줄(세션 끊김 안내) 390x${height}: 보내기와 입력창이 창 안`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: 390, height });
      await openRoom(page, "/chats/1");
      await composer(page).fill("auth401 레드 M 있어요?");
      await composer(page).press("Enter");
      const note = appAlert(page).filter({ hasText: SESSION_LOST });
      await expect(note).toBeVisible();
      const lines = await note.evaluate((el) =>
        Math.round(el.getBoundingClientRect().height / 20),
      );
      expect(lines).toBeGreaterThanOrEqual(2);
      const send = await box(sendButton(page));
      const input = await box(composer(page));
      expect(send.y + send.height).toBeLessThanOrEqual(height);
      expect(input.y + input.height).toBeLessThanOrEqual(height);
      await page.screenshot({ path: `${QA}/session-note-390x${height}.png` });
    });
  }
});

/**
 * F3 — 대화가 메시지 영역보다 길어지면 페이지 자체에 세로 스크롤이 생긴다(S5-9 위반). 말풍선 앞 숨긴
 * 발신자(`sr-only`, position:absolute)의 기준 상자가 메시지 영역 밖이라 스크롤에 안 잘리고 문서 높이를 늘린다.
 * 증거: 390x544 시드 방에서 문서 scrollHeight 730(창 544), 가장 아래 요소가 `SPAN.sr-only` bottom 730.
 */
test.describe("F3 긴 대화의 페이지 스크롤", () => {
  for (const vp of [
    { width: 1470, height: 900 },
    { width: 390, height: 844 },
    { width: 390, height: 544 },
  ]) {
    test(`${vp.width}x${vp.height}: 도매 답 20개 뒤에도 페이지 세로 스크롤 0(390x480 하한 밖)`, async ({
      page,
    }) => {
      await page.clock.install({ time: new Date("2026-10-28T10:30:00+09:00") });
      await page.setViewportSize(vp);
      await openRoom(page, "/chats/1");
      await incoming(page, 1, "새 답", { count: 20 });
      await page.clock.fastForward(3_000);
      await expect(bubbles(page)).toHaveCount(27);
      const overflow = await pageOverflow(page);
      // 규칙 8 증거: 문서 높이를 늘린 요소(가장 아래 bottom)가 무엇인가
      const deepest = await page.evaluate(() => {
        const el = [...document.querySelectorAll("body *")].sort(
          (a, b) =>
            b.getBoundingClientRect().bottom - a.getBoundingClientRect().bottom,
        )[0];
        return el
          ? `${el.tagName}.${el.className} "${el.textContent}" pos=${getComputedStyle(el).position} bottom=${Math.round(el.getBoundingClientRect().bottom + scrollY)}`
          : "";
      });
      test.info().annotations.push({ type: "deepest", description: deepest });
      await page.evaluate(() =>
        window.scrollTo(0, document.documentElement.scrollHeight),
      );
      await page.screenshot({
        path: `${QA}/F3-page-scroll-${vp.width}x${vp.height}.png`,
      });
      expect(overflow.y).toBeLessThanOrEqual(1);
    });
  }
});
