import { expect, test, type Locator, type Page } from "@playwright/test";
import { routeAuth } from "../loop-06b-retail-notify/helpers";
import {
  assertStubServers,
  chatMock,
  composer,
  count,
  openRoomById,
  requests,
  SEND_POST,
  start,
} from "../loop-08e-chat-rest/helpers";
import {
  advance,
  clientGo,
  expectReadOnly,
  expectRetryAndRemove,
  failedBubbles,
  lastSettled,
  lostAlert,
  otherTabLogin,
  pendingBubbles,
  removeOf,
  retryOf,
  ROOM_1,
  ROOM_33,
  sendText,
  serverBubbles,
  storedDraft,
  waitSendsSettled,
} from "../loop-08e-chat-rest/pending-helpers";
import { RETAILERS } from "../side-02/retail/stub-api";

/**
 * loop-12 #376 소매 채팅 보내기 영구 거절(기획 r2 6절 S1-6 ~ S1-12). `pnpm e2e:stub`.
 * 영구 code 넷(403 404 409 400)이면 `다시 보내기`를 빼고 code별 문구 + 글을 남기는 버튼 하나 + `지우기`. 404는 그 방
 * 입력창을 닫는다. 시간은 페이지 시계(`advance`)로 민다. 말풍선은 본문으로 가른다(`.last()` 금지, wire-01 #422).
 */

assertStubServers();

test.use({
  viewport: { width: 1280, height: 800 },
  permissions: ["clipboard-read", "clipboard-write"],
});

test.beforeEach(async ({ page }) => {
  await routeAuth(page);
});

const BOMBOM = RETAILERS.bombom.retailerId;
const LATE = 3_000;
/** 방 polling 간격(`ROOM_POLL_MS`) */
const POLL = 3_000;

/** 7절 Q1 표 문구 */
const TEXT: Record<number, string> = {
  403: "계정이 승인되면 보낼 수 있어요",
  404: "이 대화방에는 보낼 수 없어요. 글은 복사해 갈 수 있어요",
  409: "이 글은 그대로 다시 보낼 수 없어요. 입력창으로 옮겨 보낼 수 있어요",
  400: "서버가 이 글을 받지 않았어요. 입력창으로 옮겨 확인할 수 있어요",
};
const CLOSED_TEXT =
  "이 대화방에는 더 보낼 수 없어요. 다른 대화는 목록에서 열 수 있어요";
/** 4-2절 표의 글 남기는 버튼 */
const KEEP: Record<number, string> = {
  403: "승인 상태 보기",
  404: "복사하기",
  409: "입력창으로",
  400: "입력창으로",
};
const KEEP_NAMES = ["승인 상태 보기", "복사하기", "입력창으로"];

function bubbleOf(page: Page, body: string): Locator {
  return failedBubbles(page).filter({ hasText: body });
}

function button(scope: Locator | Page, name: string): Locator {
  return scope.getByRole("button", { name, exact: true });
}

function sendButton(page: Page): Locator {
  return button(page, "보내기");
}

function closedNote(page: Page): Locator {
  return page.getByRole("status").filter({ hasText: CLOSED_TEXT });
}

/** 실패 줄의 문구(첫 글자 노드). 버튼 글자를 빼고 정확히 비교한다 */
function failureLine(bubble: Locator): Promise<string> {
  return bubble.getByRole("alert").evaluate((alert) => {
    const node = Array.from(alert.childNodes).find(
      (n) => n.nodeType === Node.TEXT_NODE && (n.textContent ?? "").trim(),
    );
    return node?.textContent ?? "";
  });
}

/** 그 status로 한 번 실패시킬 글을 보내고 실패 말풍선을 돌려준다 */
async function failOnce(
  page: Page,
  status: number,
  body: string,
): Promise<Locator> {
  await chatMock(page, "fail", { op: "send", status });
  await sendText(page, body);
  const bubble = bubbleOf(page, body);
  await expect(bubble).toHaveAttribute("data-pending", "failed");
  return bubble;
}

/** 영구 말풍선 모양: 문구, 다시 보내기 0, 그 종류의 남기는 버튼 하나, 지우기 */
async function expectPermanent(bubble: Locator, status: number) {
  expect(await failureLine(bubble)).toBe(TEXT[status]);
  await expect(retryOf(bubble)).toHaveCount(0);
  for (const name of KEEP_NAMES)
    await expect(button(bubble, name)).toHaveCount(
      name === KEEP[status] ? 1 : 0,
    );
  await expect(removeOf(bubble)).toBeVisible();
}

test.describe("S1-6 [영구 거절 넷]", () => {
  for (const status of [403, 404, 409, 400]) {
    test(`${status} → code 문구, 다시 보내기 0, 남기는 버튼 ${KEEP[status]}, 10초 뒤 POST 1 그대로`, async ({
      page,
    }) => {
      await start(page, "/");
      await openRoomById(page, ROOM_1);
      const bubble = await failOnce(page, status, `${status} 받을 말`);
      await expectPermanent(bubble, status);
      expect(await lastSettled(page, SEND_POST)).toBe(status);
      await expect(page).toHaveURL(`/chats/${ROOM_1}?from=/chats`);
      await advance(page, 10_000);
      expect(await count(page, SEND_POST)).toBe(1);
      await expectPermanent(bubble, status);
      /* 새 보내기는 막지 않는다(404는 S1-9가 방을 닫는다) */
      if (status !== 404) {
        await composer(page).fill("새로 쓴 글");
        await expect(sendButton(page)).toBeEnabled();
      }
    });
  }
});

test.describe("S1-7 [입력창으로, 지우기]", () => {
  test("입력창 빔 → 409 입력창으로 → 말풍선 0, 입력창 값, 포커스, POST 1 → 300ms 뒤 저장", async ({
    page,
  }) => {
    await start(page, "/");
    await openRoomById(page, ROOM_1);
    const bubble = await failOnce(page, 409, "409 받을 말");
    await button(bubble, "입력창으로").click();
    await expect(bubble).toHaveCount(0);
    await expect(composer(page)).toHaveValue("409 받을 말");
    await expect(composer(page)).toBeFocused();
    expect(await count(page, SEND_POST)).toBe(1);
    await advance(page, 300);
    await expect
      .poll(() => storedDraft(page, BOMBOM, ROOM_1))
      .toBe("409 받을 말");
  });

  test("영구 둘 + 쓰던 글 → 가 말 입력창으로는 뒤에 붙고, 나 말 지우기는 그 말풍선만 뺀다", async ({
    page,
  }) => {
    await start(page, "/");
    await openRoomById(page, ROOM_1);
    const ga = await failOnce(page, 409, "가 말");
    const na = await failOnce(page, 400, "나 말");
    await composer(page).fill("남길 초안");
    await button(ga, "입력창으로").click();
    await expect(composer(page)).toHaveValue("남길 초안\n가 말");
    await expect(ga).toHaveCount(0);
    await expectPermanent(na, 400);
    await removeOf(na).click();
    await expect(na).toHaveCount(0);
    await expect(serverBubbles(page, "나 말")).toHaveCount(0);
    await expect(composer(page)).toHaveValue("남길 초안\n가 말");
    expect(await count(page, SEND_POST)).toBe(2);
  });
});

test.describe("S1-8 [403 승인 링크 본문 보존]", () => {
  test("403 → 쓰던 글 → 승인 상태 보기 → /approval, 초안 = 쓰던 글 + 거절된 글 → 방 1 다시 열면 입력창 그대로", async ({
    page,
  }) => {
    const urls: string[] = [];
    page.on("framenavigated", (frame) => {
      if (frame === page.mainFrame()) urls.push(new URL(frame.url()).pathname);
    });
    await start(page, "/");
    await openRoomById(page, ROOM_1);
    const bubble = await failOnce(page, 403, "403 받을 말");
    await composer(page).fill("남길 초안");
    await button(bubble, "승인 상태 보기").click();
    /* 첫 이동만 본다 — 승인된 시드 계정이라 그 뒤 다른 화면으로 옮겨 갈 수 있다 */
    await expect.poll(() => urls).toContain("/approval");
    expect(await storedDraft(page, BOMBOM, ROOM_1)).toBe(
      "남길 초안\n403 받을 말",
    );
    await page.goto(`/chats/${ROOM_1}?from=/chats`);
    await expect(composer(page)).toHaveValue("남길 초안\n403 받을 말");
  });
});

test.describe("S1-9 [404 뒤 방 화면]", () => {
  test("늦은 404 → 읽기 전용, 쓴 글 그대로, 안내 줄 → 복사 → 지워도 닫힌 채 → 대화 목록, 초안 남음, POST 1", async ({
    page,
  }) => {
    await start(page, "/");
    await openRoomById(page, ROOM_1);
    await chatMock(page, "fail", { op: "send", status: 404 });
    await chatMock(page, "delay", { op: "send", ms: LATE });
    await sendText(page, "404 받을 말");
    await expect(pendingBubbles(page)).toHaveAttribute(
      "data-pending",
      "sending",
    );
    await composer(page).fill("남길 초안");
    await advance(page, LATE);
    expect(await lastSettled(page, SEND_POST)).toBe(404);

    const bubble = bubbleOf(page, "404 받을 말");
    await expectPermanent(bubble, 404);
    await expectReadOnly(page);
    await expect(composer(page)).toHaveValue("남길 초안");
    await expect(sendButton(page)).toBeDisabled();
    await expect(closedNote(page)).toBeVisible();
    const list = closedNote(page).getByRole("link", {
      name: "대화 목록",
      exact: true,
    });
    await expect(list).toHaveAttribute("href", "/chats");

    await button(bubble, "복사하기").click();
    await expect(button(bubble, "복사했어요")).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
      "404 받을 말",
    );

    await removeOf(bubble).click();
    await expect(bubble).toHaveCount(0);
    await expectReadOnly(page);
    await expect(closedNote(page)).toBeVisible();

    await list.click();
    await expect(page).toHaveURL("/chats");
    await expect
      .poll(() => storedDraft(page, BOMBOM, ROOM_1))
      .toBe("남길 초안");
    expect(await count(page, SEND_POST)).toBe(1);
  });
});

interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/* 측정은 08g `retail-chat-failed-links.spec.ts`의 상자와 겹침 계산을 옮겨 쓴다 */
async function rectOf(target: Locator): Promise<Rect> {
  const b = await target.boundingBox();
  if (b === null) throw new Error("보이지 않는다");
  return { left: b.x, top: b.y, right: b.x + b.width, bottom: b.y + b.height };
}

function failureTextRect(bubble: Locator): Promise<Rect> {
  return bubble.getByRole("alert").evaluate((alert) => {
    const node = Array.from(alert.childNodes).find(
      (n) => n.nodeType === Node.TEXT_NODE && (n.textContent ?? "").trim(),
    );
    if (node === undefined) throw new Error("실패 문구 글자 노드가 없다");
    const range = document.createRange();
    range.selectNodeContents(node);
    const r = range.getBoundingClientRect();
    return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
  });
}

function overlapArea(a: Rect, b: Rect): number {
  const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
  const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
  return w > 0 && h > 0 ? w * h : 0;
}

function fontSize(target: Locator): Promise<string> {
  return target.evaluate((el) => getComputedStyle(el).fontSize);
}

test.describe("S1-10 [크기]", () => {
  test("390: 새 버튼과 지우기, 대화 목록 높이 ≥ 44, 12px, 겹침 0, 넘침 0 → 1280: 말풍선 버튼 높이 16", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await start(page, "/");
    await openRoomById(page, ROOM_1);
    const bubbles = [
      [403, await failOnce(page, 403, "403 크기 말")],
      [409, await failOnce(page, 409, "409 크기 말")],
      [404, await failOnce(page, 404, "404 크기 말")],
    ] as const;

    for (const [status, bubble] of bubbles) {
      const keep = button(bubble, KEEP[status] ?? "");
      const remove = removeOf(bubble);
      await keep.scrollIntoViewIfNeeded();
      const k = await rectOf(keep);
      const d = await rectOf(remove);
      const text = await failureTextRect(bubble);
      for (const [name, box] of [
        [KEEP[status], k],
        ["지우기", d],
      ] as const) {
        expect(
          box.bottom - box.top,
          `${status} ${name} 높이`,
        ).toBeGreaterThanOrEqual(44);
        expect(box.right, `${status} ${name} 오른쪽 끝`).toBeLessThanOrEqual(
          390,
        );
      }
      expect(await fontSize(keep)).toBe("12px");
      expect(await fontSize(remove)).toBe("12px");
      expect(overlapArea(k, d), `${status} 두 버튼`).toBe(0);
      expect(overlapArea(text, k), `${status} 문구와 남기는 버튼`).toBe(0);
      expect(overlapArea(text, d), `${status} 문구와 지우기`).toBe(0);
      const line = bubble.getByRole("alert");
      const fits = await line.evaluate(
        (el) => el.scrollWidth <= el.clientWidth,
      );
      expect(fits, `${status} 아래 줄 넘침`).toBe(true);
    }

    const note = closedNote(page);
    const link = note.getByRole("link", { name: "대화 목록", exact: true });
    const l = await rectOf(link);
    expect(l.bottom - l.top, "대화 목록 높이").toBeGreaterThanOrEqual(44);
    expect(await fontSize(link)).toBe(await fontSize(note));

    await page.setViewportSize({ width: 1280, height: 800 });
    for (const [status, bubble] of bubbles) {
      for (const target of [
        button(bubble, KEEP[status] ?? ""),
        removeOf(bubble),
      ]) {
        const box = await rectOf(target);
        expect(box.bottom - box.top, `${status} 1280 높이`).toBe(16);
      }
    }

    /* 복사 실패 글자(brief 공통 규칙 4). 막힌 브라우저 자체는 수동이고, 여기선 writeText 거절만 흉내 낸다 */
    await page.evaluate(() => {
      navigator.clipboard.writeText = () =>
        Promise.reject(new Error("막힌 클립보드"));
    });
    const closedBubble = bubbleOf(page, "404 크기 말");
    await button(closedBubble, "복사하기").click();
    await expect(button(closedBubble, "복사 못 했어요")).toBeVisible();
  });
});

test.describe("S1-11 [교차: 세션 잠금 × 늦은 영구 거절]", () => {
  test("일시 실패 + 늦은 409 → 401 잠금 중 도착 → 영구 버튼 그대로 → 같은 계정 재로그인 → 일시만 R+D → 다시 보내기 201", async ({
    page,
  }) => {
    const sent: { key: string | null; body: unknown }[] = [];
    page.on("request", (r) => {
      if (
        r.method() === "POST" &&
        /\/chat\/rooms\/\d+\/messages$/.test(r.url())
      )
        sent.push({
          key: r.headers()["idempotency-key"] ?? null,
          body: r.postDataJSON(),
        });
    });
    await start(page, "/");
    await openRoomById(page, ROOM_1);
    const temp = await failOnce(page, 500, "일시 말");
    await expectRetryAndRemove(temp);

    await chatMock(page, "delay", { op: "send", ms: LATE * 10 });
    await chatMock(page, "fail", { op: "send", status: 409 });
    await sendText(page, "영구 말");
    await expect.poll(() => count(page, SEND_POST)).toBe(2);

    await chatMock(page, "fail", {
      op: "messages",
      page: "after",
      status: 401,
    });
    await advance(page, POLL);
    await expect(lostAlert(page)).toBeVisible();
    await expectReadOnly(page);
    await expect(retryOf(temp)).toHaveCount(0);

    await advance(page, LATE * 10);
    await waitSendsSettled(page, 2);
    expect((await requests(page, SEND_POST)).map((r) => r.status)).toEqual([
      500, 409,
    ]);
    const permanent = bubbleOf(page, "영구 말");
    await expectPermanent(permanent, 409);

    const tab = await otherTabLogin(page, "bombom");
    await expect(lostAlert(page)).toHaveCount(0);
    await expectRetryAndRemove(temp);
    await expectPermanent(permanent, 409);

    await retryOf(temp).click();
    await waitSendsSettled(page, 3);
    expect((await requests(page, SEND_POST)).at(-1)?.status).toBe(201);
    const tempPosts = sent.filter(
      (s) => (s.body as { body?: string }).body === "일시 말",
    );
    expect(tempPosts).toHaveLength(2);
    expect(tempPosts[1]).toEqual(tempPosts[0]);
    await expect(serverBubbles(page, "일시 말")).toHaveCount(1);
    await expect(serverBubbles(page, "영구 말")).toHaveCount(0);
    await tab.close();
  });
});

test.describe("S1-12 [늦은 영구 거절, 방 떠남]", () => {
  test("늦은 409 → 방 33 → 보류 0, 끊김 0 → 도착 → 방 1 → 409 문구, 입력창으로, 지우기, 서버 말풍선 0", async ({
    page,
  }) => {
    await start(page, "/");
    await openRoomById(page, ROOM_1);
    await chatMock(page, "fail", { op: "send", status: 409 });
    await chatMock(page, "delay", { op: "send", ms: LATE });
    await sendText(page, "늦게 거절될 말");
    await expect.poll(() => count(page, SEND_POST)).toBe(1);
    await clientGo(page, `/chats/${ROOM_33}?from=/chats`);
    await expect(pendingBubbles(page)).toHaveCount(0);
    await expect(lostAlert(page)).toHaveCount(0);
    await advance(page, LATE);
    await waitSendsSettled(page, 1);
    expect((await requests(page, SEND_POST)).at(-1)?.status).toBe(409);
    await clientGo(page, `/chats/${ROOM_1}?from=/chats`);
    await expectPermanent(bubbleOf(page, "늦게 거절될 말"), 409);
    await expect(serverBubbles(page, "늦게 거절될 말")).toHaveCount(0);
  });
});
