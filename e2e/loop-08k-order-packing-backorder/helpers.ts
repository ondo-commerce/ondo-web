import { expect, type Locator, type Page } from "@playwright/test";
import { installClock, login, roomList } from "../loop-04-chat/helpers";
import { log, T0 } from "../loop-08j-backorder-packing/helpers";

export { createPacking } from "../loop-08i-chat-packing/helpers";
export {
  ask,
  bubbleOf,
  choiceItems,
  log,
  NOT_LISTED,
  openRoomOneAgain,
  packingCardHeads,
  type Line,
} from "../loop-08j-backorder-packing/helpers";

/**
 * loop-08k-order-packing-backorder 도매 e2e 준비(#402 S2). 기본 설정 wholesale 프로젝트(3100, MSW).
 *
 * 08j(`startWith9003`)와 다른 점은 reset이 **기본**(`{}`, 방 1 열린 미송 9001 9002 9006 9003)이라는 것뿐이다.
 * 시계는 reset 전에 T0(2026-10-29 14:20 서울)로 고정한다. 포장은 주문 탭 `포장 준비` op를 페이지 안 fetch로
 * 부른다(08i `createPacking`). 화면 `포장 준비` 대화상자는 누르지 않는다(기획 §3 out 9).
 * 탭 사이는 주 메뉴 링크만 쓴다 — `page.goto`면 목이 시드로 돌아간다.
 */

export const DENIM_PRODUCT = "와이드 데님 팬츠";
export const LINEN_PRODUCT = "린넨 셋업 자켓";
/** 미송 탭 9002 배분 칸. 7002의 표시 주문번호는 1이다(3011을 펼쳤을 때만 있다) */
export const DENIM_INPUT = "주문 1 봄봄상회 배분 수량";

/** 기본 시드 방 1 되묻기 보기 글자(기획 §6 L1, L2, L6, L3) */
export const L1 = "빈티지 플라워 셔츠 레드/L, 남은 4장, 9/4 주문 #7001";
export const L2 = "와이드 데님 팬츠 소라/M, 남은 1장, 9/6 주문 #7002";
export const L6 = "빈티지 플라워 셔츠 레드/L, 남은 2장, 9/6 주문 #7006";
export function L3(remaining: number): string {
  return `린넨 셋업 자켓 베이지/L, 남은 ${remaining}장, 9/7 주문 #7003`;
}

/**
 * 시작: T0 시계 → 로그인 → 방 1 → 기본 reset `{}`. 방 1 대화가 보일 때까지.
 * 채팅 reset이 주문, 출고, 미송 목도 같이 되돌린다.
 */
export async function startDefault(page: Page): Promise<void> {
  await installClock(page, T0);
  await login(page);
  await page.goto("/chats?room=1");
  await expect(roomList(page).getByRole("link").first()).toBeVisible();
  const status = await page.evaluate(async () => {
    const response = await fetch("/__mock/chat/reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    return response.status;
  });
  expect(status, "채팅 목 기본 reset").toBe(200);
  await expect(log(page)).toBeVisible();
}

/** 주 메뉴 미송. 클라이언트 이동 */
export async function openBackorders(page: Page): Promise<void> {
  await page.getByRole("link", { name: "미송", exact: true }).click();
  await expect(page).toHaveURL(/\/backorders/);
}

/** 미송 목록에서 그 상품명이 든 행. 아무것도 안 펼쳤을 때 = SKU 행 */
export function skuRows(page: Page, productName: string): Locator {
  return page
    .getByRole("main")
    .getByRole("row")
    .filter({ hasText: productName });
}

/** SKU 1-4(와이드 데님 팬츠 소라 M, 3011) 펼치기. 펼친 영역 */
export async function openDenimSku(page: Page): Promise<Locator> {
  await page.getByRole("button", { name: "SKU 1-4 펼치기" }).click();
  const detail = page.locator("#backorder-detail-3011");
  await expect(
    detail.getByRole("textbox", { name: DENIM_INPUT }),
  ).toBeVisible();
  return detail;
}

/** 펼침 카운터 바의 가용재고 숫자(08j QA spec 꼴) */
export function availableCounter(detail: Locator): Locator {
  return detail
    .getByText("가용재고", { exact: true })
    .locator("xpath=following-sibling::span[1]");
}

/** 주 메뉴 주문 → 주문 id 7002 펼치기. 펼친 영역 */
export async function openOrder7002(page: Page): Promise<Locator> {
  await page.getByRole("link", { name: "주문", exact: true }).click();
  await expect(page).toHaveURL(/\/orders/);
  await page.locator('button[aria-controls="order-detail-7002"]').click();
  const detail = page.locator("#order-detail-7002");
  await expect(detail).toBeVisible();
  return detail;
}
