import { expect, test, type Page } from "@playwright/test";
import {
  addButton,
  askChip,
  assertStubServers,
  ASK_WHEN,
  cards,
  chatMock,
  chatNav,
  choice,
  choiceGroups,
  composer,
  log,
  openRoomById,
  orderChoice,
  orderGroups,
  requests,
  SEND_POST,
  start,
  useOwnCart,
} from "./helpers";
import {
  advance,
  clientGo,
  expectRetryAndRemove,
  expectWritable,
  failedBubbleAndDraft,
  failedBubbles,
  lastSettled,
  lostAlert,
  pendingBubbles,
  retryOf,
  ROOM_1,
  ROOM_33,
  sendText,
  serverBubbles,
  waitSendsSettled,
} from "./pending-helpers";

/**
 * #362 상태표 행 "방 화면 전환과 셸 안 이동"(기획 §4-1 표 A 보내기·담기 열, 표 B 보류 말풍선 열) + 영구 거절 지금 동작.
 * `pnpm e2e:stub`. 보류 말풍선이 셸(`ChatShellProvider`) 수명이라 방 왕복, 같은 라우트 안 이동, 상품과 장바구니,
 * 담기 뒤 `router.refresh()`에도 남는지 본다. 결과는 보낸 방에만 가는지(다른 방 잠금 0) 본다.
 *
 * 지연은 30초로 걸고 페이지 시계를 밀어 부른다(뜻은 기획 3초와 같다 — "다른 방을 보는 사이 도착").
 */

assertStubServers();

const LATE = 30_000;

test.use({ viewport: { width: 1280, height: 800 } });

/** 보내기 POST의 키와 본문 */
function captureSendBodies(page: Page) {
  const sent: { key: string | null; body: unknown }[] = [];
  page.on("request", (r) => {
    if (r.method() === "POST" && /\/chat\/rooms\/\d+\/messages$/.test(r.url()))
      sent.push({
        key: r.headers()["idempotency-key"] ?? null,
        body: r.postDataJSON(),
      });
  });
  return sent;
}

/** 방 33을 보고 방 1로 돌아온다(헤더 → 목록 → 방) */
async function roundTrip(page: Page): Promise<void> {
  await openRoomById(page, ROOM_33);
  await expect(pendingBubbles(page)).toHaveCount(0);
  await openRoomById(page, ROOM_1);
}

test.describe("S2-3 [방 화면 전환, 보류 말풍선, 보내기]", () => {
  test("① 500 실패 → 방 33 → 방 1 → R+D 그대로 → 다시 보내기 201, 말풍선 1", async ({
    page,
  }) => {
    await start(page, "/");
    await openRoomById(page, ROOM_1);
    await chatMock(page, "fail", { op: "send", status: 500 });
    await sendText(page, "왕복 뒤 다시 보낼 말");
    await expectRetryAndRemove(failedBubbles(page));
    await roundTrip(page);
    const bubble = failedBubbles(page).filter({
      hasText: "왕복 뒤 다시 보낼 말",
    });
    await expectRetryAndRemove(bubble);
    await retryOf(bubble).click();
    await waitSendsSettled(page, 2);
    await expect(pendingBubbles(page)).toHaveCount(0);
    await expect(serverBubbles(page, "왕복 뒤 다시 보낼 말")).toHaveCount(1);
  });

  /** 실패시킬 보내기를 만든다. 첫 POST가 500으로 끝날 때까지 */
  const kinds: [string, string, (page: Page) => Promise<void>][] = [
    [
      "재고 문의 칩",
      "/chats/1?from=/products/2001",
      async (page) => {
        await chatMock(page, "fail", { op: "send", status: 500 });
        await askChip(page).click();
      },
    ],
    [
      "재고 되묻기 보기",
      "/chats/1?from=/products/2001",
      async (page) => {
        await sendText(page, "이 셔츠 몇 장 남았어요?");
        await expect(choiceGroups(page)).toHaveCount(1);
        await chatMock(page, "fail", { op: "send", status: 500 });
        await choice(choiceGroups(page).first(), "레드 / M").click();
      },
    ],
    [
      "미송 되묻기 주문 보기",
      "/",
      async (page) => {
        await openRoomById(page, ROOM_1);
        await sendText(page, ASK_WHEN);
        await expect(orderGroups(page)).toHaveCount(1);
        await chatMock(page, "fail", { op: "send", status: 500 });
        await orderChoice(orderGroups(page).first(), 9003).click();
      },
    ],
  ];

  for (const [label, path, failOne] of kinds) {
    test(`② ${label} 500 → 방 33 → 방 1 → 다시 보내기의 {body, inquiry}와 키가 첫 요청과 같다`, async ({
      page,
    }) => {
      const sent = captureSendBodies(page);
      await start(page, path);
      await failOne(page);
      await expectRetryAndRemove(failedBubbles(page));
      /* 되묻기 갈래는 먼저 자유 문장 하나를 보냈다 — 실패한 POST는 마지막 것 */
      const before = sent.length - 1;
      await roundTrip(page);
      await retryOf(failedBubbles(page)).click();
      await expect.poll(() => sent.length).toBe(before + 2);
      const [first, again] = sent.slice(before);
      expect(again).toEqual(first);
      expect(
        (first?.body as { inquiry: unknown } | undefined)?.inquiry,
      ).not.toBeNull();
      await expect
        .poll(async () => (await requests(page, SEND_POST)).at(-1)?.status)
        .toBe(201);
      await expect(pendingBubbles(page)).toHaveCount(0);
    });
  }

  test("③ 늦은 보내기 → 바로 방 33 → 방 33 보류 0, 말풍선 추가 0 → 도착 뒤 방 1 → 보류 0, 서버 말풍선 1", async ({
    page,
  }) => {
    await start(page, "/");
    await openRoomById(page, ROOM_1);
    await chatMock(page, "delay", { op: "send", ms: LATE });
    await sendText(page, "가는 사이 옮긴 말");
    await openRoomById(page, ROOM_33);
    await expect(pendingBubbles(page)).toHaveCount(0);
    await expect(log(page).getByText("가는 사이 옮긴 말")).toHaveCount(0);
    await advance(page, LATE);
    expect(await lastSettled(page, SEND_POST)).toBe(201);
    await advance(page, 2_000);
    await expect(pendingBubbles(page)).toHaveCount(0);
    await expect(log(page).getByText("가는 사이 옮긴 말")).toHaveCount(0);
    await openRoomById(page, ROOM_1);
    await expect(pendingBubbles(page)).toHaveCount(0);
    await expect(serverBubbles(page, "가는 사이 옮긴 말")).toHaveCount(1);
  });
});

test.describe("S2-12 [방 화면 전환, 보내기 결과별]", () => {
  for (const [label, status] of [
    ["① 201", null],
    ["② 500", 500],
    ["③ 401", 401],
  ] as const) {
    test(`${label} → 보내자마자 방 33 → 도착 뒤 방 33 잠금 0 → 방 1 결과`, async ({
      page,
    }) => {
      const sent = captureSendBodies(page);
      await start(page, "/");
      await openRoomById(page, ROOM_1);
      if (status !== null) await chatMock(page, "fail", { op: "send", status });
      await chatMock(page, "delay", { op: "send", ms: LATE });
      await sendText(page, "방 옮긴 뒤 결과");
      await openRoomById(page, ROOM_33);
      await advance(page, LATE);
      expect(await lastSettled(page, SEND_POST)).toBe(status ?? 201);
      await advance(page, 2_000);
      await expect(lostAlert(page)).toHaveCount(0);
      await expectWritable(page);
      await expect(pendingBubbles(page)).toHaveCount(0);

      await openRoomById(page, ROOM_1);
      if (status === null) {
        await expect(serverBubbles(page, "방 옮긴 뒤 결과")).toHaveCount(1);
        await expect(pendingBubbles(page)).toHaveCount(0);
        return;
      }
      await expect(lostAlert(page)).toHaveCount(0);
      const bubble = failedBubbles(page);
      await expectRetryAndRemove(bubble);
      if (status === 401) {
        await retryOf(bubble).click();
        await waitSendsSettled(page, 2);
        expect((await requests(page, SEND_POST)).at(-1)?.status).toBe(201);
        expect(sent[1]?.key).toBe(sent[0]?.key);
        await expect(pendingBubbles(page)).toHaveCount(0);
        await expect(serverBubbles(page, "방 옮긴 뒤 결과")).toHaveCount(1);
      }
    });
  }
});

test.describe("S2-14 ① [담기 뒤 셸 refresh]", () => {
  test("방 33 실패 말풍선, 방 1 실패 말풍선 + 초안 → 방 1 담기 201 → refresh 1회 → 방 1 그대로 → 방 33 그대로", async ({
    page,
  }) => {
    await useOwnCart(page);
    await start(page, "/");
    await failedBubbleAndDraft(page, "방 33 못 간 말", "", chatMock, ROOM_33);
    await failedBubbleAndDraft(page, "방 1 못 간 말", "방 1 쓰던 글", chatMock);

    const refreshes: string[] = [];
    page.on("request", (r) => {
      const h = r.headers();
      if (h["rsc"] === "1" && h["next-router-prefetch"] === undefined)
        refreshes.push(new URL(r.url()).pathname);
    });
    const card = cards(page, 3002).first();
    await addButton(card).click();
    await expect(card.getByRole("status")).toContainText("장바구니에 담았어요");
    await expect.poll(() => refreshes.length).toBe(1);
    expect(refreshes).toEqual([`/chats/${ROOM_1}`]);

    await expectRetryAndRemove(
      failedBubbles(page).filter({ hasText: "방 1 못 간 말" }),
    );
    await expect(composer(page)).toHaveValue("방 1 쓰던 글");
    await openRoomById(page, ROOM_33);
    await expectRetryAndRemove(
      failedBubbles(page).filter({ hasText: "방 33 못 간 말" }),
    );
  });
});

test.describe("S2-16 [셸 안 이동]", () => {
  test("방 1 실패 말풍선 + 초안 → 상품 상세 → 장바구니 → 헤더 채팅 → 방 1 → 그대로 → 다시 보내기 201", async ({
    page,
  }) => {
    await start(page, "/");
    await failedBubbleAndDraft(
      page,
      "다녀와서 보낼 말",
      "다녀와도 남을 글",
      chatMock,
    );
    await clientGo(page, "/products/11");
    await clientGo(page, "/cart");
    await chatNav(page).click();
    await expect(page).toHaveURL("/chats");
    await openRoomById(page, ROOM_1);
    await expect(composer(page)).toHaveValue("다녀와도 남을 글");
    const bubble = failedBubbles(page).filter({ hasText: "다녀와서 보낼 말" });
    await expectRetryAndRemove(bubble);
    await retryOf(bubble).click();
    await waitSendsSettled(page, 2);
    expect((await requests(page, SEND_POST)).at(-1)?.status).toBe(201);
    await expect(serverBubbles(page, "다녀와서 보낼 말")).toHaveCount(1);
  });
});

test.describe("S2-17 [영구 거절, 지금 동작 고정]", () => {
  for (const status of [403, 404]) {
    test(`보내기 ${status} → "못 보냈어요" R+D → 다시 보내기 POST 1회 더, 같은 키`, async ({
      page,
    }) => {
      const sent = captureSendBodies(page);
      await start(page, "/");
      await openRoomById(page, ROOM_1);
      await chatMock(page, "fail", { op: "send", status });
      await sendText(page, `${status} 받을 말`);
      const bubble = failedBubbles(page);
      await expectRetryAndRemove(bubble);
      await expect(bubble).toContainText("못 보냈어요");
      expect(await lastSettled(page, SEND_POST)).toBe(status);
      await expect(page).toHaveURL(`/chats/${ROOM_1}?from=/chats`);
      await retryOf(bubble).click();
      await waitSendsSettled(page, 2);
      expect(sent).toHaveLength(2);
      expect(sent[1]).toEqual(sent[0]);
    });
  }
});
