import { expect, type Locator, type Page } from "@playwright/test";
import { chatNav, log, roomRow } from "../loop-06-backorder-reply/helpers";

export * from "../loop-06-backorder-reply/helpers";

/**
 * loop-07-receivable-reply 소매 쪽(#268 S2). `pnpm e2e:stub`으로 돈다(`playwright.stub.config.ts`).
 * 06a 공통(`../loop-06-backorder-reply/helpers.ts`) 위에 미수 카드 locator와 "보낸 질문 뒤 새 줄" 읽기를 더한다.
 *
 * 시각과 금액: T0 = 2026-10-29 14:20(서울)을 **reset 전에** 고정한다(06a `start`). 정산 목 시드 7004(봄봄상회, 9/4 출고
 * 37,500원)라 T0 연체 일수는 10/29 − 9/4 − 외상 1일 = 54일. 방 33(도매처 102)은 52,000원 연체 0.
 *
 * "새 줄"은 보낸 질문 뒤에 그려진 줄만 본다(앞 회차 교훈: 새 말풍선만 정확 값 단언). 시드 말풍선이나 앞 답에 같은
 * 글자가 있어도 통과하지 않게, DOM 순서(= sequence 순서)로 그 질문 다음 줄들을 잘라 온다.
 */

/** 장면 3 소매 문장(기획 Q1) */
export const ASK_RECEIVABLE = "지금 미수 얼마예요?";
export const ASK_DISCOUNT = "조금 깎아 주세요";
export const PAYMENT_REPORT = "방금 입금했어요";

/** 장면 3 첫 답(기획 §2-1 1, 템플릿 B) */
export const SCENE3_BODY =
  "갚을 돈은 37,500원이에요. 그중 기한 지난 것 1건, 37,500원이에요";

/** 보낸 질문 뒤에 그려진 줄 하나 */
export interface LineAfter {
  kind: string;
  sender: string | null;
  /** 말풍선이면 sequence, 가운데 넘김 줄은 null(그 줄엔 sequence 속성이 없다) */
  sequence: number | null;
  text: string;
}

/**
 * `nth`번째(1부터)로 보낸 `body`(서버에 들어가 sequence가 붙은 내 TEXT) 뒤의 줄들. 그 번째가 아직 없으면(보내는 중이면
 * 내 말에 `data-kind`가 없다) 빈 배열이다. 같은 질문을 두 번 보내는 장면에서 앞 질문 뒤를 읽지 않으려고 번째를 받는다.
 */
export function linesAfter(
  page: Page,
  body: string,
  nth = 1,
): Promise<LineAfter[]> {
  return log(page).evaluate(
    (root, { body, nth }) => {
      const nodes = [...root.querySelectorAll<HTMLElement>("[data-kind]")];
      const mine = nodes.flatMap((node, i) =>
        node.dataset.sender === "RETAILER" &&
        node.dataset.kind === "TEXT" &&
        node.querySelector(":scope > div")?.textContent === body
          ? [i]
          : [],
      );
      const at = mine[nth - 1];
      if (at === undefined) return [];
      return nodes.slice(at + 1).map((node) => ({
        kind: node.dataset.kind ?? "",
        sender: node.dataset.sender ?? null,
        sequence:
          node.dataset.sequence === undefined
            ? null
            : Number(node.dataset.sequence),
        text: node.textContent ?? "",
      }));
    },
    { body, nth },
  );
}

/** `nth`번째 그 질문 뒤 줄이 `n`개 이상이 될 때까지 기다린 뒤 돌려준다 */
export async function waitLinesAfter(
  page: Page,
  body: string,
  n: number,
  nth = 1,
): Promise<LineAfter[]> {
  await expect
    .poll(async () => (await linesAfter(page, body, nth)).length)
    .toBeGreaterThanOrEqual(n);
  return linesAfter(page, body, nth);
}

/** sequence로 말풍선 하나 */
export function messageBySequence(page: Page, sequence: number): Locator {
  return log(page).locator(`[data-sequence="${sequence}"]`);
}

/** 말풍선 안 서버 본문 */
export function bodyOf(bubble: Locator): Locator {
  return bubble.locator("[data-body]");
}

/** 말풍선 안 미수 카드 칸 */
export function receivableCard(bubble: Locator): Locator {
  return bubble.locator("[data-receivable-card]");
}

/** 방 안 미수 카드 전부 */
export function receivableCards(page: Page): Locator {
  return log(page).locator("[data-receivable-card]");
}

/** 카드 줄 글자들(화면 순서) */
export function cardLines(card: Locator): Promise<string[]> {
  return card
    .locator("[data-line]")
    .evaluateAll((nodes) => nodes.map((n) => n.textContent ?? ""));
}

/** 말풍선 끝 조회 시각 */
export function seenOf(bubble: Locator): Locator {
  return bubble.locator("[data-seen]");
}

export function settlementLink(card: Locator): Locator {
  return card.getByRole("link", { name: "정산 화면에서 보기", exact: true });
}

/** 헤더 → `/chats` → 그 방. 클라이언트 이동이라 걸어 둔 목 상태가 남는다 */
export async function openRoomById(page: Page, roomId: number): Promise<void> {
  await chatNav(page).click();
  await expect(page).toHaveURL("/chats");
  await roomRow(page, roomId).click();
  await expect(page).toHaveURL(`/chats/${roomId}?from=/chats`);
  await expect(
    page.getByRole("textbox", { name: "메시지", exact: true }),
  ).toBeVisible();
}
