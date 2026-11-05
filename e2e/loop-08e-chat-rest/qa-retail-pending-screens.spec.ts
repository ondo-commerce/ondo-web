/* 08e QA 재현 spec, 08f에서 회귀 시험으로 커밋(08f-Q3) */
import { expect, test, type Locator, type Page } from "@playwright/test";
import { routeAuth } from "../loop-06b-retail-notify/helpers";
import {
  assertStubServers,
  chatMock,
  chatNav,
  composer,
  count,
  CREATE_POST,
  inquiryButton,
  log,
  openRoomById,
  requests,
  roomRow,
  start,
} from "./helpers";
import {
  advance,
  expectReadOnly,
  failedBubbleAndDraft,
  failedBubbles,
  lastSettled,
  lostAlert,
  otherTabLogin,
  pendingBubbles,
  pressLogout,
  RELOGIN_ENTRY_TEXT,
  removeOf,
  retryOf,
  ROOM_1,
  ROOM_33,
  sendText,
} from "./pending-helpers";

/**
 * loop-08e QA — #362 방 화면(보류 말풍선, 로그아웃 대기 읽기 전용, 방 만들기 안내 문구) 390, 1280 화면 확인과
 * 리뷰 R8 R9 브라우저 재현. 스크린샷: .claude/harness/runs/loop-08e-chat-rest/qa/*.png. `pnpm e2e:stub`.
 * 고정 지연 없음 — 시간은 페이지 시계, 로그아웃 응답은 문(gate)으로 붙잡는다.
 */

assertStubServers();

const SHOTS = ".claude/harness/runs/loop-08e-chat-rest/qa";
const LATE = 30_000;
const LIST_GET = {
  path: /\/api\/retail\/chat\/rooms(\?|$)/,
  method: "GET",
} as const;
const ROOM1_GET = {
  path: /\/api\/retail\/chat\/rooms\/1(\?|$)/,
  method: "GET",
} as const;
const ROOM1_MESSAGES_GET = {
  path: /\/api\/retail\/chat\/rooms\/1\/messages/,
  method: "GET",
} as const;

/** 토큰 클래스를 단 임시 요소의 계산값(같은 토큰이면 같은 값) */
function tokenValue(page: Page, className: string, prop: string) {
  return page.evaluate(
    ([cls, p]) => {
      const probe = document.createElement("span");
      probe.className = cls!;
      document.body.append(probe);
      const v = getComputedStyle(probe).getPropertyValue(p!);
      probe.remove();
      return v;
    },
    [className, prop],
  );
}

function box(locator: Locator) {
  return locator.evaluate((el) => {
    const s = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return {
      top: r.top,
      bottom: r.bottom,
      left: r.left,
      right: r.right,
      h: Math.round(r.height),
      color: s.color,
      bg: s.backgroundColor,
      font: s.fontSize,
      lines: Math.round(r.height / parseFloat(s.lineHeight || "16")),
    };
  });
}

function horizontalOverflow(page: Page) {
  return page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
}

/** 로그아웃 응답을 붙잡는다. 돌려준 함수를 부르면 응답한다 */
async function holdLogout(page: Page): Promise<() => void> {
  let release = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.context().route("**/api/retail/auth/logout", async (route) => {
    await held;
    await page.context().clearCookies({ name: "stub_retailer" });
    await route.fulfill({ status: 204 });
  });
  return release;
}

for (const viewport of [
  { width: 390, height: 844 },
  { width: 1280, height: 800 },
]) {
  test.describe(`QA #362 화면 ${viewport.width}`, () => {
    test.use({ viewport });
    test.beforeEach(async ({ page }) => {
      await routeAuth(page);
    });

    test("보류 말풍선(실패 + 보내는 중) → 로그아웃 대기 읽기 전용", async ({
      page,
    }) => {
      const release = await holdLogout(page);
      await start(page, "/");
      await failedBubbleAndDraft(page, "QA 못 간 말", "QA 쓰던 글", chatMock);
      await chatMock(page, "delay", { op: "send", ms: LATE });
      await sendText(page, "QA 보내는 중인 말");
      await expect(
        pendingBubbles(page).filter({ hasText: "QA 보내는 중인 말" }),
      ).toHaveAttribute("data-pending", "sending");
      await composer(page).fill("QA 쓰던 글");
      const sendButton = page.getByRole("button", {
        name: "보내기",
        exact: true,
      });
      /* 스크린샷에서 보내기 버튼 색이 대기 전후로 달라 상태를 같이 남긴다 */
      const sendBefore = await sendButton.evaluate((el) => ({
        disabled: (el as HTMLButtonElement).disabled,
        bg: getComputedStyle(el).backgroundColor,
        opacity: getComputedStyle(el).opacity,
        focus: document.activeElement?.tagName,
      }));

      const failed = failedBubbles(page).filter({ hasText: "QA 못 간 말" });
      const logBox = await box(log(page));
      const failedBox = await box(failed);
      const alertLine = await box(failed.getByRole("alert"));
      const retry = await box(retryOf(failed));
      const remove = await box(removeOf(failed));
      await page.screenshot({
        path: `${SHOTS}/s2-pending-${viewport.width}.png`,
      });
      /* 실패 말풍선은 log 안, 실패 줄은 한 줄, 색은 destructive-strong 토큰 */
      expect(failedBox.right).toBeLessThanOrEqual(logBox.right + 0.5);
      expect(failedBox.left).toBeGreaterThanOrEqual(logBox.left - 0.5);
      expect(alertLine.h).toBeLessThanOrEqual(retry.h + 4);
      expect(alertLine.color).toBe(
        await tokenValue(page, "text-destructive-strong", "color"),
      );
      expect(retry.top).toBeCloseTo(remove.top, 0);
      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
      test.info().annotations.push({
        type: "measure",
        description: JSON.stringify({ logBox, failedBox, alertLine, retry }),
      });

      await pressLogout(page);
      await expect(pendingBubbles(page)).toHaveCount(0);
      await expectReadOnly(page);
      await expect(sendButton).toBeDisabled();
      test.info().annotations.push({
        type: "send-button",
        description: JSON.stringify({
          sendBefore,
          sendLeaving: await sendButton.evaluate((el) => ({
            disabled: (el as HTMLButtonElement).disabled,
            bg: getComputedStyle(el).backgroundColor,
            opacity: getComputedStyle(el).opacity,
          })),
        }),
      });
      await expect(lostAlert(page)).toHaveCount(0);
      const field = await box(composer(page));
      expect(field.bg).toBe(
        await tokenValue(page, "bg-muted", "background-color"),
      );
      await expect(composer(page)).toHaveValue("QA 쓰던 글");
      await page.screenshot({
        path: `${SHOTS}/s2-15-leaving-${viewport.width}.png`,
      });
      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
      release();
      await expect(page).toHaveURL(/\/login$/);
    });

    test("방 만들기 늦은 401 + 탭 2 같은 계정 → 입구 안내 문구", async ({
      page,
    }) => {
      await start(page, "/products/11");
      await expect(inquiryButton(page)).toBeVisible();
      await chatMock(page, "fail", { op: "create", status: 401 });
      await chatMock(page, "delay", { op: "create", ms: LATE });
      await inquiryButton(page).click();
      const tab = await otherTabLogin(page, "bombom");
      await advance(page, LATE);
      expect(await lastSettled(page, CREATE_POST)).toBe(401);
      const alert = page
        .getByRole("alert")
        .filter({ hasText: RELOGIN_ENTRY_TEXT });
      await expect(alert).toBeVisible();
      await expect(inquiryButton(page)).toBeEnabled();
      await alert.scrollIntoViewIfNeeded();
      const a = await box(alert);
      const button = await box(inquiryButton(page));
      await page.screenshot({
        path: `${SHOTS}/s2-8-entry-${viewport.width}.png`,
      });
      expect(a.color).toBe(
        await tokenValue(page, "text-destructive-strong", "color"),
      );
      /* 버튼 바로 아래, 버튼 폭 안. 겹치지 않는다 */
      expect(a.top).toBeGreaterThanOrEqual(button.bottom - 0.5);
      expect(a.right).toBeLessThanOrEqual(viewport.width);
      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
      test.info().annotations.push({
        type: "measure",
        description: JSON.stringify({ alert: a, button }),
      });
      await tab.close();
    });
  });
}

test.describe("QA 리뷰 재현 1280", () => {
  test.use({ viewport: { width: 1280, height: 800 } });
  test.beforeEach(async ({ page }) => {
    await routeAuth(page);
  });

  /* 리뷰 R8(08e-N3). 기획 §4-1 표 A 둘째 행: 로그아웃 대기 중 새 조회 0. 목록 화면에서 확인한다 */
  test("R8 /chats에서 로그아웃 대기 중 목록 GET 0", async ({ page }) => {
    /* QA 11-03 재현: 15초 갱신은 0, 탭 복귀에서 GET /api/retail/chat/rooms?size=30 200이 1건 나가 지운 목록 캐시를
       A 쿠키 응답으로 다시 채운다. 08e에서 고쳐졌다. 08f-Q3에서 test.fail을 떼고 회귀 시험으로 둔다 */
    const release = await holdLogout(page);
    await start(page, "/");
    await chatNav(page).click();
    await expect(page).toHaveURL("/chats");
    await expect(roomRow(page, ROOM_1)).toBeVisible();
    const before = await count(page, LIST_GET);
    await pressLogout(page);
    /* 15초 갱신 */
    await advance(page, 16_000);
    const afterTick = await count(page, LIST_GET);
    /* 탭 복귀(리뷰 R8이 든 경로). visibilityState를 바꿔 visibilitychange를 보낸다 */
    for (const state of ["hidden", "visible"])
      await page.evaluate((s) => {
        Object.defineProperty(document, "visibilityState", {
          configurable: true,
          get: () => s,
        });
        Object.defineProperty(document, "hidden", {
          configurable: true,
          get: () => s === "hidden",
        });
        document.dispatchEvent(new Event("visibilitychange"));
      }, state);
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await advance(page, 1_000);
    const after = await requests(page, LIST_GET);
    test.info().annotations.push({
      type: "evidence-tick",
      description: JSON.stringify({ before, afterTick }),
    });
    test.info().annotations.push({
      type: "evidence",
      description: JSON.stringify({
        before,
        after: after.length,
        url: page.url(),
        newRequests: after.slice(before).map((r) => [r.url, r.status]),
        rowsShown: await page
          .locator("main li")
          .count()
          .catch(() => -1),
      }),
    });
    expect(after.length).toBe(before);
    release();
  });

  /* 리뷰 R9. 기획 §4-1 잠금 범위와 AC S2-7 ②: 다시 열면 확인 요청(방 머리, messages)이 401이면 다시 잠금.
     AC대로 방 33 → 방 1을 바로 하면 캐시가 신선해 확인 요청 0, 잠금 0이다(QA 11-03 재현, roomGets 0,
     messageGets 0, readonly null, 끊김 줄 0). 08e에서 고쳐졌다. 08f-Q3에서 test.fail을 떼고 회귀 시험으로 둔다 */
  test("R9 지금 세션 401로 잠긴 방을 바로 다시 열면 확인 요청이 나간다", async ({
    page,
  }) => {
    await start(page, "/");
    await openRoomById(page, ROOM_1);
    await chatMock(page, "fail", { op: "send", status: 401 });
    await sendText(page, "QA 첫 글");
    await expect(lostAlert(page)).toBeVisible();
    await openRoomById(page, ROOM_33);
    await chatMock(page, "fail", { op: "room", status: 401, times: 1 });
    await chatMock(page, "fail", {
      op: "messages",
      page: "latest",
      status: 401,
      times: 1,
    });
    const roomBefore = await count(page, ROOM1_GET);
    const messagesBefore = await count(page, ROOM1_MESSAGES_GET);
    await chatNav(page).click();
    await roomRow(page, ROOM_1).click();
    await expect(composer(page)).toBeVisible();
    await advance(page, 1_000);
    const roomGets = (await count(page, ROOM1_GET)) - roomBefore;
    const messageGets =
      (await count(page, ROOM1_MESSAGES_GET)) - messagesBefore;
    const readOnly = await composer(page).getAttribute("readonly");
    test.info().annotations.push({
      type: "evidence",
      description: JSON.stringify({
        roomGets,
        messageGets,
        readOnly,
        lost: await lostAlert(page).count(),
        url: page.url(),
      }),
    });
    expect(roomGets + messageGets).toBeGreaterThan(0);
    await expect(lostAlert(page)).toBeVisible();
  });
});
