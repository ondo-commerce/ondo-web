import { expect, type Locator, type Page } from "@playwright/test";
import { installClock, log, login, roomList } from "../loop-04-chat/helpers";

export { log } from "../loop-04-chat/helpers";

/**
 * loop-08i-chat-packing 도매 e2e 준비(#391 S2-7 S2-8). 기본 설정 wholesale 프로젝트(3100, MSW). 이슈 03(#392)의
 * 이유 줄 e2e도 같은 준비(reset + 포장 + 방 열기)를 쓴다.
 *
 * 시계: T0 = 2026-10-29(목) 14:20 서울에 **reset 전에** 고정한다(`page.clock`). 흐르는 시계다.
 *
 * 목은 페이지 안(MSW)이다. reset, 주문 op, 출고 op, incoming은 전부 그 문서 안에서 fetch로 부른다 — 사용자 길과
 * 같은 op(주문 탭 포장 준비, 출고 탭 봉투 담기와 출고 확정)로 상태를 바꾼다. `page.goto`마다 시드로 돌아가서
 * 방을 연 뒤에는 클라이언트 이동만 한다. 목이 답하는 요청은 `page.context().route`로 못 잡는다.
 */

export const T0 = new Date("2026-10-29T14:20:00+09:00");
export const ASK = "미송 언제 와요?";
export const PACKING_ONE = "출고 준비 중인 주문이 있어요(#7002)";

/** incoming 응답의 메시지 한 줄(필요한 칸만) */
export interface Line {
  kind: string;
  sequence: number;
  body: string;
  handoff?: { reason: string | null; intent: string | null } | null;
}

/** 페이지 안 fetch 한 번. 상태와 JSON(없으면 null) */
async function pageFetch<T>(
  page: Page,
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; json: T }> {
  return page.evaluate(
    async ({ method, path, body }) => {
      const response = await fetch(path, {
        method,
        headers: { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const text = await response.text();
      return {
        status: response.status,
        json: (text === "" ? null : JSON.parse(text)) as T,
      };
    },
    { method, path, body },
  );
}

/** 채팅 목 reset. 주문, 출고, 미송, 정산 목도 같이 시드로 돌아간다 */
export async function resetChat(
  page: Page,
  input: Record<string, unknown> = { noBackorders: true },
): Promise<void> {
  const { status } = await pageFetch(page, "POST", "/__mock/chat/reset", input);
  expect(status, "채팅 목 reset").toBe(200);
}

/**
 * 시작: T0 시계 → 로그인 → 방 1 → reset(기본 `{noBackorders: true}`, 미송 0). 방 1 대화가 보일 때까지.
 */
export async function openRoomOne(
  page: Page,
  input: Record<string, unknown> = { noBackorders: true },
): Promise<void> {
  await installClock(page, T0);
  await login(page);
  await page.goto("/chats?room=1");
  await expect(roomList(page).getByRole("link").first()).toBeVisible();
  await resetChat(page, input);
  await expect(log(page)).toBeVisible();
}

/** 주문 탭 `포장 준비` op. 만든 포장 id와 포장 줄 id */
export async function createPacking(
  page: Page,
  orderId: number,
  orderItemId: number,
  qty: number,
): Promise<{ id: number; itemIds: number[] }> {
  const { status, json } = await pageFetch<{
    data: { id: number; items: { id: number }[] };
  }>(page, "POST", `/api/wholesale/orders/${orderId}/packings`, {
    items: [{ orderItemId, allocateQty: qty }],
  });
  expect(status, `POST /orders/${orderId}/packings`).toBe(201);
  return { id: json.data.id, itemIds: json.data.items.map((i) => i.id) };
}

/** 주문 탭 확정 op(이번 출고 수량). 확정이 그 수량으로 READY 포장 하나를 만든다. 그 포장 줄 id */
export async function confirmOrder(
  page: Page,
  orderId: number,
  orderItemId: number,
  qty: number,
): Promise<number[]> {
  const confirmed = await pageFetch(
    page,
    "POST",
    `/api/wholesale/orders/${orderId}/confirm`,
    { items: [{ orderItemId, allocateQty: qty }] },
  );
  expect(confirmed.status, `POST /orders/${orderId}/confirm`).toBe(200);
  const queue = await pageFetch<{ data: { items: { id: number }[] }[] }>(
    page,
    "GET",
    `/api/wholesale/orders/${orderId}/packings`,
  );
  expect(queue.json.data, "확정이 만든 포장").toHaveLength(1);
  return queue.json.data.flatMap((p) => p.items.map((i) => i.id));
}

/** 출고 탭 봉투 담기 op. 봉투 id */
export async function createOutbound(
  page: Page,
  packingItemIds: number[],
): Promise<number> {
  const { status, json } = await pageFetch<{ data: { id: number } }>(
    page,
    "POST",
    "/api/wholesale/outbounds",
    { packingItemIds },
  );
  expect(status, "POST /outbounds").toBe(201);
  return json.data.id;
}

/** 출고 탭 출고 확정 op */
export async function shipOutbound(
  page: Page,
  outboundId: number,
): Promise<void> {
  const { status } = await pageFetch(
    page,
    "POST",
    `/api/wholesale/outbounds/${outboundId}/ship`,
  );
  expect(status, `POST /outbounds/${outboundId}/ship`).toBe(200);
}

/** 주문 탭 포장 삭제 op */
export async function deletePacking(
  page: Page,
  packingId: number,
): Promise<void> {
  const { status } = await pageFetch(
    page,
    "DELETE",
    `/api/wholesale/packings/${packingId}`,
  );
  expect(status, `DELETE /packings/${packingId}`).toBe(204);
}

/** 방 1에 소매 질문을 넣고 판정을 돌린다. 소매 글과 판정이 만든 줄(generatedMessages 몫) */
export async function ask(
  page: Page,
  body = ASK,
): Promise<{ question: Line; lines: Line[] }> {
  const { status, json } = await pageFetch<{ data: Line[] }>(
    page,
    "POST",
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

/** 그 말풍선 바로 다음 형제 요소의 `data-kind`(넘김 줄은 sequence 속성이 없어 형제로 본다) */
export function nextKind(bubble: Locator): Promise<string | null> {
  return bubble.evaluate(
    (el) => (el.nextElementSibling as HTMLElement | null)?.dataset.kind ?? null,
  );
}

/** 방 안 넘김 줄(가운데 note) */
export function handoffLines(page: Page): Locator {
  return log(page).locator('[role="note"][data-kind="HANDOFF"]');
}

/** 그 소매 글 뒤에 그려진 형제 요소의 `data-kind` 목록(DOM 순서) */
export function kindsAfter(page: Page, sequence: number): Promise<string[]> {
  return bubbleOf(page, sequence).evaluate((el) => {
    const out: string[] = [];
    let next = el.nextElementSibling as HTMLElement | null;
    while (next !== null) {
      if (next.dataset.kind !== undefined) out.push(next.dataset.kind);
      next = next.nextElementSibling as HTMLElement | null;
    }
    return out;
  });
}
