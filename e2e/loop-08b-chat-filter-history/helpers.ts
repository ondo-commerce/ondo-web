import { expect, type Locator, type Page } from "@playwright/test";
import {
  installClock,
  knob,
  watchRequests,
} from "../loop-08-chat-polish/helpers";

export * from "../loop-08-chat-polish/helpers";

/**
 * loop-08b 도매 채팅(#327 S3 입력 기억, #328 S4 필터와 검색). 기본 설정 wholesale 프로젝트(3100, MSW).
 *
 * 목은 페이지 안(MSW)이라 `page.goto`, 새로고침마다 시드로 돌아간다. 그래서 **로그인 화면에서** reset(200)과
 * 손잡이를 걸고 로그인한 뒤 헤더 `채팅` 링크로(클라이언트 이동) 들어간다. 쓰던 글은 sessionStorage라
 * 새로고침에 산다 — 그 경우만 `page.reload()`를 쓴다.
 */

export const ME = "approved@ondo.test";
export const OTHER = "first@ondo.test";

/** 기획 §4-1 1 키. 손으로 적는다 — 앱의 `draftKey`를 가져다 쓰면 같은 실수를 같이 한다 */
export function keyOf(email: string, roomId: number): string {
  return `ondo.chat.draft.v1:${email}:${roomId}`;
}

export function chatLink(page: Page): Locator {
  return page.getByRole("banner").getByRole("link", { name: /^채팅/ });
}

/** 로그인 화면에서 로그인 → `/dashboard`(클라이언트 이동) */
export async function signIn(page: Page, email: string): Promise<void> {
  await expect(
    page.getByRole("heading", { name: "도매 사장님 로그인" }),
  ).toBeVisible();
  await page.getByLabel("이메일").fill(email);
  await page.getByLabel("비밀번호").fill("ondo1234!");
  await page.getByRole("button", { name: "로그인" }).click();
  await page.waitForURL(/\/dashboard/);
}

/** 헤더 계정 메뉴 → 로그아웃 → `/login`(클라이언트 이동이라 목 상태가 남는다) */
export async function signOut(page: Page): Promise<void> {
  await page
    .getByRole("banner")
    .getByRole("button", { name: /계정 메뉴$/ })
    .click();
  await page.getByRole("button", { name: "로그아웃" }).click();
  await page.waitForURL(/\/login/);
}

/** 헤더 `채팅` → `/chats` 목록 첫 행까지 */
export async function gotoChats(page: Page): Promise<void> {
  await chatLink(page).click();
  await page.waitForURL(/\/chats/);
  await expect(chatRows(page).first()).toBeVisible();
}

/**
 * 시계 고정(흐름) → 로그인 화면 → reset(200) → `before` → 로그인 → 헤더 `채팅`.
 * `init`은 문서보다 먼저 도는 스크립트(저장소 막기 같은 것). `watch`면 fetch 감시(요청 수 세기)도 건다.
 */
export async function enterChats(
  page: Page,
  options: {
    seed?: string;
    rooms?: number;
    email?: string;
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
  await signIn(page, options.email ?? ME);
  if (options.rooms === 0) {
    await chatLink(page).click();
    await page.waitForURL(/\/chats/);
    return;
  }
  await gotoChats(page);
}

export function chatRows(page: Page): Locator {
  return page
    .getByRole("list", { name: "대화 목록", exact: true })
    .getByRole("link");
}

/** 목록에서 방 id로 연다(이름은 시드마다 다르다). URL `room=` 까지 */
export async function openRoomById(page: Page, roomId: number): Promise<void> {
  await page.locator(`a[data-room-id="${roomId}"]`).click();
  await expect(page).toHaveURL(new RegExp(`[?&]room=${roomId}(&|$)`));
}

/** 방을 열고 입력창이 뜰 때까지(방 머리와 메시지 첫 조회가 끝났다) */
export async function openRoomReady(page: Page, roomId: number): Promise<void> {
  await openRoomById(page, roomId);
  await expect(
    page.getByRole("textbox", { name: "메시지", exact: true }),
  ).toBeVisible();
}

/** 방 패널(오른쪽) */
export function roomPanel(page: Page): Locator {
  return page.locator('[data-ac="S2-5 S3-9"]');
}

export function roomTitle(page: Page): Locator {
  return roomPanel(page).getByRole("heading");
}

export function storedDraft(page: Page, key: string): Promise<string | null> {
  return page.evaluate((k) => window.sessionStorage.getItem(k), key);
}

export function draftKeys(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    Object.keys(window.sessionStorage).filter((k) =>
      k.startsWith("ondo.chat.draft.v1:"),
    ),
  );
}

/** 보류 말풍선(보내는 중, 실패). 서버 sequence가 붙으면 빠진다 */
export function pendingBubbles(page: Page): Locator {
  return page
    .getByRole("log", { name: "대화", exact: true })
    .locator("[data-pending]");
}

/** 보내기 POST의 Idempotency-Key 를 쌓는다(= clientMessageId, 계약 §5-2) */
export function captureSends(page: Page) {
  const sent: { roomId: number; key: string | null }[] = [];
  page.on("request", (r) => {
    const m = /\/chat\/rooms\/(\d+)\/messages$/.exec(r.url());
    if (r.method() === "POST" && m?.[1] !== undefined)
      sent.push({
        roomId: Number(m[1]),
        key: r.headers()["idempotency-key"] ?? null,
      });
  });
  return sent;
}

/** 페이지 오류 수. 0이어야 한다(S3-8, S3-13) */
export function collectPageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  return errors;
}
