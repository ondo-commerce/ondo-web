import { expect, type Locator, type Page } from "@playwright/test";
import {
  installClock,
  log,
  login,
  pushChats,
  roomList,
  row,
} from "../loop-04-chat/helpers";

export { log } from "../loop-04-chat/helpers";

/**
 * loop-08j-backorder-packing 도매 e2e 준비(#397 S2). 기본 설정 wholesale 프로젝트(3100, MSW).
 *
 * 시계: T0 = 2026-10-29(목) 14:20 서울에 **reset 전에** 고정한다(`page.clock`). 미송 시드 입고일이 reset 시각 기준
 * 상대값이라 실행 날짜에 흔들리지 않는다.
 *
 * 목은 페이지 안(MSW)이다. 탭 사이는 주 메뉴 링크(클라이언트 이동)만 쓴다 — `page.goto`면 배분과 포장이 시드로
 * 돌아간다. 목이 답하는 요청은 `page.context().route`로 못 잡아서 응답은 `page.waitForResponse`로 본다.
 *
 * `openLinenSku`, `allocateLinen`은 06 `wholesale-backorder-facts.spec.ts` 안 함수를 옮겨 적은 것이다(06 spec은 그대로).
 * 바꾼 점: `allocateLinen`이 배분 응답 본문을 돌려준다(S2-2가 포장 id를 주문 탭 카드와 맞춘다).
 */

export const T0 = new Date("2026-10-29T14:20:00+09:00");
export const ASK = "미송 언제 와요?";
export const LINEN_PRODUCT = "린넨 셋업 자켓";
export const PACKING_7003 = "출고 준비 중인 주문이 있어요(#7003)";
export const NOT_LISTED = "다른 주문이에요";
/** 미송 탭 9003 배분 칸. 7003의 표시 주문번호는 1이다 */
export const LINEN_INPUT = "주문 1 봄봄상회 배분 수량";

/** 남은 수량 n장인 9003 보기 글자 */
export function linenChoice(remaining: number): string {
  return `린넨 셋업 자켓 베이지/L, 남은 ${remaining}장, 9/7 주문 #7003`;
}

/** incoming 응답의 메시지 한 줄(필요한 칸만) */
export interface Line {
  kind: string;
  sequence: number;
  body: string;
}

/** 배분 응답(필요한 칸만) */
export interface AllocationResult {
  packings: { id: number; orderId: number; items: { qty: number }[] }[];
  resolvedBackorderIds: number[];
}

/** 페이지 안 fetch 한 번. 상태와 JSON */
async function pageFetch<T>(
  page: Page,
  path: string,
  body: unknown,
): Promise<{ status: number; json: T }> {
  return page.evaluate(
    async ({ path, body }) => {
      const response = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      return { status: response.status, json: (await response.json()) as T };
    },
    { path, body },
  );
}

/**
 * 시작: T0 시계 → 로그인 → 방 1 → reset `{backorderIds: [9003]}`(방 1 열린 미송을 9003 하나로). 방 1 대화가 보일 때까지.
 * 채팅 reset이 주문, 출고, 미송 목도 같이 되돌린다.
 */
export async function startWith9003(page: Page): Promise<void> {
  await installClock(page, T0);
  await login(page);
  await page.goto("/chats?room=1");
  await expect(roomList(page).getByRole("link").first()).toBeVisible();
  const { status } = await pageFetch(page, "/__mock/chat/reset", {
    backorderIds: [9003],
  });
  expect(status, "채팅 목 reset {backorderIds: [9003]}").toBe(200);
  await expect(log(page)).toBeVisible();
}

/** 주 메뉴 미송 → SKU 1-2(린넨 셋업 자켓 베이지 L, 3019) 펼치기. 클라이언트 이동 */
export async function openLinenSku(page: Page): Promise<void> {
  await page.getByRole("link", { name: "미송", exact: true }).click();
  await expect(page).toHaveURL(/\/backorders/);
  await page.getByRole("button", { name: "SKU 1-2 펼치기" }).click();
  await expect(page.getByRole("textbox", { name: LINEN_INPUT })).toBeVisible();
}

/** 펼친 3019에서 9003(주문 1, 봄봄상회)에 qty장 배분. 201 단언, 응답 본문 */
export async function allocateLinen(
  page: Page,
  qty: number,
): Promise<AllocationResult> {
  await page.getByRole("textbox", { name: LINEN_INPUT }).fill(String(qty));
  const done = page.waitForResponse(
    (r) =>
      /\/api\/wholesale\/backorders\/allocations$/.test(r.url()) &&
      r.request().method() === "POST",
  );
  await page.getByRole("button", { name: "배분 확정" }).click();
  const response = await done;
  expect(response.status(), "배분 확정").toBe(201);
  return ((await response.json()) as { data: AllocationResult }).data;
}

/** 주 메뉴 출고 → 포장 대기(기본 단계) → 봄봄상회 펼치기. 펼친 영역 */
export async function openShipmentBombom(page: Page): Promise<Locator> {
  await page.getByRole("link", { name: "출고", exact: true }).click();
  await expect(page).toHaveURL(/\/shipments/);
  await page.getByRole("button", { name: "봄봄상회 펼치기" }).click();
  const detail = page.locator('[id^="shipment-detail-"]');
  await expect(detail).toBeVisible();
  return detail;
}

/** 주 메뉴 주문 → 주문 id 7003 펼치기(표시 번호는 소매처마다 따로라 id로 찾는다). 펼친 영역 */
export async function openOrder7003(page: Page): Promise<Locator> {
  await page.getByRole("link", { name: "주문", exact: true }).click();
  await expect(page).toHaveURL(/\/orders/);
  await page.locator('button[aria-controls="order-detail-7003"]').click();
  const detail = page.locator("#order-detail-7003");
  await expect(detail).toBeVisible();
  return detail;
}

/** 주문 탭 우측 포장 대기열 카드 머리(h4 "포장 대기 #N … · id n") */
export function packingCardHeads(page: Page): Locator {
  return page.getByRole("heading", { name: /^포장 대기 #/ });
}

/** 헤더 채팅 → 전체 목록 → 방 1. 클라이언트 이동 */
export async function openRoomOneAgain(page: Page): Promise<void> {
  await pushChats(page);
  await row(page, "봄봄상회").click();
  await expect(page).toHaveURL(/room=1$/);
  await expect(log(page)).toBeVisible();
}

/** 방 1에 소매 질문을 넣고 판정을 돌린다. 소매 글과 판정이 만든 줄(generatedMessages 몫) */
export async function ask(
  page: Page,
  body = ASK,
): Promise<{ question: Line; lines: Line[] }> {
  const { status, json } = await pageFetch<{ data: Line[] }>(
    page,
    "/__mock/chat/rooms/1/incoming",
    { body, autoReply: true },
  );
  expect(status, `incoming ${body}`).toBe(201);
  const [question, ...lines] = json.data;
  if (question === undefined) throw new Error("incoming 응답에 소매 글 없음");
  return { question, lines };
}

export function bubbleOf(page: Page, sequence: number): Locator {
  return log(page).locator(`[data-sequence="${sequence}"]`);
}

/** 미송 되묻기 말풍선의 보기 줄 */
export function choiceItems(bubble: Locator): Locator {
  return bubble.locator('[data-ac="S4-1 S4-2"]').locator('[data-ac="S4-1"]');
}

/** 그 말풍선 바로 다음 형제 요소의 `data-kind`(넘김 줄은 sequence 속성이 없어 형제로 본다) */
export function nextKind(bubble: Locator): Promise<string | null> {
  return bubble.evaluate(
    (el) => (el.nextElementSibling as HTMLElement | null)?.dataset.kind ?? null,
  );
}
