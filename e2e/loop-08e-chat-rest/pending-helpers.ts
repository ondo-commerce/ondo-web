import { expect, type Locator, type Page } from "@playwright/test";
import { RETAILERS, type RetailerKey } from "../side-02/retail/stub-api";
import {
  ANY_CHAT,
  chatNav,
  composer,
  count,
  log,
  openRoomById,
  requests,
  SEND_POST,
} from "./helpers";

/**
 * #362 보류 말풍선과 세션 칸 시험 도우미(기획 §4-1 표 A B). spec은 상태표 열로 나눈다 — 계정 변경, 같은 계정 갱신,
 * 지금 세션 401, 화면 전환, 로그아웃 대기. 시간은 페이지 시계(`page.clock`)로 민다 — 목 지연과 polling이 같은 시계를
 * 쓴다. "N초 동안 변화 0"은 그 시계를 N초 민 뒤 본다(고정 대기 없음).
 */

export const ROOM_1 = 1;
export const ROOM_33 = 33;
export const DRAFT_PREFIX = "ondo.chat.draft.v1:";
export const LOST_TEXT = "로그인이 끊겼어요";
export const RELOGIN_ENTRY_TEXT =
  "로그인이 바뀌어 방을 못 열었어요. 다시 눌러 주세요";

/** 방 log 안 보류 말풍선(보내는 중, 실패) */
export function pendingBubbles(page: Page): Locator {
  return log(page).locator("[data-pending]");
}

export function failedBubbles(page: Page): Locator {
  return log(page).locator('[data-pending="failed"]');
}

export function retryOf(bubble: Locator): Locator {
  return bubble.getByRole("button", { name: "다시 보내기", exact: true });
}

export function removeOf(bubble: Locator): Locator {
  return bubble.getByRole("button", { name: "지우기", exact: true });
}

/** 실패 R+D: `다시 보내기`와 `지우기` 둘 다 */
export async function expectRetryAndRemove(bubble: Locator): Promise<void> {
  await expect(bubble).toHaveAttribute("data-pending", "failed");
  await expect(retryOf(bubble)).toBeVisible();
  await expect(removeOf(bubble)).toBeVisible();
}

/** 실패 D: `지우기`만 */
export async function expectRemoveOnly(bubble: Locator): Promise<void> {
  await expect(bubble).toHaveAttribute("data-pending", "failed");
  await expect(retryOf(bubble)).toHaveCount(0);
  await expect(removeOf(bubble)).toBeVisible();
}

/** 세션 끊김 줄 */
export function lostAlert(page: Page): Locator {
  return page.getByRole("alert").filter({ hasText: LOST_TEXT });
}

/** 서버 말풍선(보류가 아닌 것) 중 그 본문 */
export function serverBubbles(page: Page, body: string): Locator {
  return log(page).locator("[data-sequence]").filter({ hasText: body });
}

export async function expectReadOnly(page: Page): Promise<void> {
  await expect(composer(page)).toHaveAttribute("readonly", "");
}

export async function expectWritable(page: Page): Promise<void> {
  await expect(composer(page)).not.toHaveAttribute("readonly", "");
}

/** 보내기 POST 상태 목록(보낸 순서) */
export async function sendStatuses(page: Page): Promise<(number | null)[]> {
  return (await requests(page, SEND_POST)).map((r) => r.status);
}

/** 보내기 POST가 n개 전부 응답을 받을 때까지 */
export async function waitSendsSettled(page: Page, n: number): Promise<void> {
  await expect
    .poll(async () => {
      const list = await requests(page, SEND_POST);
      return list.length === n && list.every((r) => r.status !== null);
    })
    .toBe(true);
}

/** 채팅 요청(손잡이 제외) 수 */
export function chatRequestCount(page: Page): Promise<number> {
  return count(page, ANY_CHAT);
}

/** 그 필터의 마지막 요청이 응답을 받을 때까지, 그 상태를 돌려준다 */
export async function lastSettled(
  page: Page,
  filter: { path: RegExp; method?: string },
  timeout = 5_000,
): Promise<number> {
  let status: number | null = null;
  await expect
    .poll(
      async () => {
        status = (await requests(page, filter)).at(-1)?.status ?? null;
        return status;
      },
      { timeout },
    )
    .not.toBeNull();
  return status ?? 0;
}

/** 페이지 시계를 민다. 목 지연, polling, React 알림이 같은 시계다 */
export async function advance(page: Page, ms: number): Promise<void> {
  await page.clock.runFor(ms);
}

/** 입력창에 쓰고 Enter */
export async function sendText(page: Page, text: string): Promise<void> {
  await composer(page).fill(text);
  await composer(page).press("Enter");
}

/**
 * 로그인 화면에서 그 계정으로 로그인 → 홈. 전체 이동(`location.assign`)으로 온 로그인 화면은 주소가 먼저 바뀌고
 * hydration이 뒤에 온다 — 그 사이 채운 칸은 hydration이 비운다(이메일 빈칸 검증 오류로 남는 걸 봤다). 그래서 채우고
 * 누르고 홈을 확인하는 한 묶음을 통과할 때까지 다시 한다. 이미 홈이면 끝(앞 묶음의 이동이 늦게 끝난 경우)
 */
export async function loginAs(page: Page, key: RetailerKey): Promise<void> {
  await expect(async () => {
    if (new URL(page.url()).pathname === "/") return;
    await page.getByLabel("이메일").fill(RETAILERS[key].email);
    await page.getByLabel("비밀번호").fill("ondo1234!");
    await page.getByRole("button", { name: "로그인", exact: true }).click();
    await expect(page).toHaveURL(/\/$/, { timeout: 3_000 });
  }).toPass();
  await expect(chatNav(page)).toBeVisible();
}

/** 둘째 탭에서 그 계정으로 로그인하고 첫 탭으로 돌아온다. 둘째 탭을 돌려준다(끝나면 닫는다) */
export async function otherTabLogin(
  page: Page,
  key: RetailerKey,
): Promise<Page> {
  const tab = await page.context().newPage();
  await tab.goto("/login");
  await loginAs(tab, key);
  await page.bringToFront();
  return tab;
}

/** 계정 메뉴 → 로그아웃 누름(이동은 기다리지 않는다) */
export async function pressLogout(page: Page): Promise<void> {
  await page.getByRole("button", { name: /계정 메뉴$/ }).click();
  await page.getByRole("button", { name: "로그아웃", exact: true }).click();
}

/** 클라이언트 이동(목 상태와 셸이 산다) */
export async function clientGo(page: Page, path: string): Promise<void> {
  await page.evaluate((p) => {
    (
      window as unknown as { next: { router: { push: (p: string) => void } } }
    ).next.router.push(p);
  }, path);
  await expect(page).toHaveURL(path);
}

/** sessionStorage 쓰던 글 키(정렬) */
export function draftKeys(page: Page): Promise<string[]> {
  return page.evaluate(
    (prefix) =>
      Object.keys(sessionStorage)
        .filter((k) => k.startsWith(prefix))
        .sort(),
    DRAFT_PREFIX,
  );
}

export function storedDraft(
  page: Page,
  retailerId: number,
  roomId: number,
): Promise<string | null> {
  return page.evaluate(
    (k) => sessionStorage.getItem(k),
    `${DRAFT_PREFIX}${retailerId}:${roomId}`,
  );
}

/** 방 1을 열고 실패 말풍선(500) 하나와 쓰던 글을 둔다 */
export async function failedBubbleAndDraft(
  page: Page,
  failed: string,
  draft: string,
  chatMock: (
    page: Page,
    path: string,
    body?: Record<string, unknown>,
  ) => Promise<void>,
  roomId = ROOM_1,
): Promise<void> {
  await openRoomById(page, roomId);
  await chatMock(page, "fail", { op: "send", status: 500 });
  await sendText(page, failed);
  await expectRetryAndRemove(failedBubbles(page).filter({ hasText: failed }));
  await composer(page).fill(draft);
  await expect(composer(page)).toHaveValue(draft);
}

/**
 * 화면에 한 번이라도 그 글이 나타났나(MutationObserver). `page.goto` 전에 건다 — 이동 사이도 문서마다 다시 건다.
 * 기록은 sessionStorage가 아니라 window라 문서가 바뀌면 비고, 클라이언트 이동은 이어진다
 */
export async function recordTexts(
  page: Page,
  needles: string[],
): Promise<void> {
  await page.addInitScript((list) => {
    (window as unknown as { __seen: string[] }).__seen = [];
    const check = () => {
      const seen = (window as unknown as { __seen: string[] }).__seen;
      const text = document.body?.innerText ?? "";
      const values = [...document.querySelectorAll("textarea")].map(
        (t) => t.value,
      );
      for (const needle of list)
        if (
          !seen.includes(needle) &&
          (text.includes(needle) || values.some((v) => v.includes(needle)))
        )
          seen.push(needle);
    };
    new MutationObserver(check).observe(document, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
    });
  }, needles);
}

/** 기록을 비운다 — 그 순간부터 다시 쌓는다(앞 계정 단계를 빼려고) */
export async function resetSeen(page: Page): Promise<void> {
  await page.evaluate(() => {
    (window as unknown as { __seen: string[] }).__seen = [];
  });
}

export function seenTexts(page: Page): Promise<string[]> {
  return page.evaluate(
    () => (window as unknown as { __seen?: string[] }).__seen ?? [],
  );
}

/** `pageerror`를 모은다 */
export function capturePageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  return errors;
}
