import { expect, test, type Page } from "@playwright/test";
import { routeAuth } from "../loop-06b-retail-notify/helpers";
import {
  historyButton,
  openHistoryRoom,
} from "../loop-08d-chat-rest/retail-history-helpers";
import {
  assertStubServers,
  chatMock,
  chatNav,
  composer,
  count,
  incoming,
  log,
  openRoomById,
  requests,
  roomRow,
  SEND_POST,
  start,
} from "./helpers";
import {
  advance,
  expectReadOnly,
  expectRemoveOnly,
  expectRetryAndRemove,
  expectWritable,
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
  waitSendsSettled,
} from "./pending-helpers";

/**
 * #362 상태표 행 "지금 세션 401"과 "잠긴 뒤 도착한 늦은 결과"(기획 §4-1 표 A 보내기·polling 열, 표 B 쓰던 글·보류 말풍선 열).
 * `pnpm e2e:stub`. 잠금 범위는 방 화면 하나(08d §4-1) — 방을 떠나면 풀리고 다시 열면 확인 요청 1회까지.
 * 지연은 30초로 걸고 페이지 시계로 민다(뜻은 기획 3초와 같다).
 */

assertStubServers();

const LATE = 30_000;

test.use({ viewport: { width: 1280, height: 800 } });

/** 방 화면 요청(방 머리, 메시지, 읽음, 보내기). 헤더 count와 목록은 뺀다 */
const ROOM_REQ = { path: /\/api\/retail\/chat\/rooms\/\d+(\/|$|\?)/ } as const;
const ROOM1_GET = {
  path: /\/api\/retail\/chat\/rooms\/1$/,
  method: "GET",
} as const;
const ROOM1_MESSAGES_GET = {
  path: /\/api\/retail\/chat\/rooms\/1\/messages\?/,
  method: "GET",
} as const;
const AFTER_GET = {
  path: /\/api\/retail\/chat\/rooms\/\d+\/messages\?.*afterSequence=/,
  method: "GET",
} as const;

test.describe("S2-7 [지금 세션 401, 보내기, 쓰던 글]", () => {
  test("① 첫 글 401 → 끊김, D, 두 번째 초안 읽기 전용 ② 다시 열면 확인 요청 401로 다시 잠금, 그 뒤 3초 방 요청 0 ③ 소진 뒤 풀림 R+D", async ({
    page,
  }) => {
    await start(page, "/");
    await openRoomById(page, ROOM_1);

    await test.step("①", async () => {
      await chatMock(page, "fail", { op: "send", status: 401 });
      await chatMock(page, "delay", { op: "send", ms: LATE });
      await sendText(page, "첫 글");
      await composer(page).fill("두 번째 초안");
      await advance(page, LATE);
      expect(await lastSettled(page, SEND_POST)).toBe(401);
      await expect(lostAlert(page)).toBeVisible();
      await expectRemoveOnly(failedBubbles(page).filter({ hasText: "첫 글" }));
      await expect(composer(page)).toHaveValue("두 번째 초안");
      await expectReadOnly(page);
    });

    await test.step("② 방 33 → 목록 → 방 1, 확인 요청 401 → 다시 잠금", async () => {
      await openRoomById(page, ROOM_33);
      await chatNav(page).click();
      await expect(page).toHaveURL("/chats");
      /* 방 1 메시지 캐시가 오래돼야 다시 열 때 확인 요청이 나간다(staleTime 30초). 목록 화면이라 방 요청은 없다 */
      await advance(page, 31_000);
      await chatMock(page, "fail", { op: "room", status: 401, times: 1 });
      await chatMock(page, "fail", {
        op: "messages",
        page: "latest",
        status: 401,
        times: 1,
      });
      await chatMock(page, "fail", {
        op: "messages",
        page: "after",
        status: 401,
        times: 1,
      });
      const roomBefore = await count(page, ROOM1_GET);
      const messagesBefore = await count(page, ROOM1_MESSAGES_GET);
      await roomRow(page, ROOM_1).click();
      await expect(lostAlert(page)).toBeVisible();
      await expectRemoveOnly(failedBubbles(page).filter({ hasText: "첫 글" }));
      await expect(composer(page)).toHaveValue("두 번째 초안");
      await expectReadOnly(page);
      const roomGets = (await requests(page, ROOM1_GET)).slice(roomBefore);
      const messageGets = (await requests(page, ROOM1_MESSAGES_GET)).slice(
        messagesBefore,
      );
      expect(roomGets.length).toBeLessThanOrEqual(1);
      expect(messageGets.length).toBeLessThanOrEqual(1);
      expect([...roomGets, ...messageGets].some((r) => r.status === 401)).toBe(
        true,
      );
      const quiet = await count(page, ROOM_REQ);
      await advance(page, 3_000);
      expect(await count(page, ROOM_REQ)).toBe(quiet);
    });

    await test.step("③ 계획 소진 뒤 방 33 → 방 1 → 잠금 0, R+D, 초안 쓰기 가능", async () => {
      await openRoomById(page, ROOM_33);
      await openRoomById(page, ROOM_1);
      await expect(lostAlert(page)).toHaveCount(0);
      await expectRetryAndRemove(
        failedBubbles(page).filter({ hasText: "첫 글" }),
      );
      await expect(composer(page)).toHaveValue("두 번째 초안");
      await expectWritable(page);
    });
  });
});

test.describe("S2-11 [잠긴 뒤 늦은 결과]", () => {
  /** 늦은 보내기를 띄우고 이전 장 401로 잠근다 */
  async function sendThenLock(page: Page, status: number | null) {
    await openHistoryRoom(page);
    if (status !== null) await chatMock(page, "fail", { op: "send", status });
    await chatMock(page, "delay", { op: "send", ms: LATE });
    await sendText(page, "잠긴 뒤 도착할 글");
    await expect(pendingBubbles(page)).toHaveAttribute(
      "data-pending",
      "sending",
    );
    await chatMock(page, "fail", {
      op: "messages",
      page: "before",
      status: 401,
    });
    await historyButton(page).click();
    await expect(lostAlert(page)).toBeVisible();
    await advance(page, LATE);
    expect(await lastSettled(page, SEND_POST)).toBe(status ?? 201);
  }

  test("① 보내기 201 → 보류 0, 서버 말풍선 1, 끊김 줄 그대로, 읽기 전용", async ({
    page,
  }) => {
    await sendThenLock(page, null);
    await expect(pendingBubbles(page)).toHaveCount(0);
    await expect(serverBubbles(page, "잠긴 뒤 도착할 글")).toHaveCount(1);
    await expect(lostAlert(page)).toBeVisible();
    await expectReadOnly(page);
  });

  test("② 500 → 실패, 다시 보내기 없음, 지우기 됨 → 탭 2 bombom → 다시 보내기 생김 → 201", async ({
    page,
  }) => {
    await routeAuth(page);
    await sendThenLock(page, 500);
    const bubble = failedBubbles(page);
    await expectRemoveOnly(bubble);
    await expect(removeOf(bubble)).toBeEnabled();
    const tab = await otherTabLogin(page, "bombom");
    await expectRetryAndRemove(bubble);
    await retryOf(bubble).click();
    await waitSendsSettled(page, 2);
    expect((await requests(page, SEND_POST)).at(-1)?.status).toBe(201);
    await expect(serverBubbles(page, "잠긴 뒤 도착할 글")).toHaveCount(1);
    await tab.close();
  });

  test("③ 401 → 말풍선 D, 잠금 그대로", async ({ page }) => {
    await sendThenLock(page, 401);
    await expectRemoveOnly(failedBubbles(page));
    await expect(lostAlert(page)).toBeVisible();
    await expectReadOnly(page);
  });

  for (const [label, status] of [
    ["200", null],
    ["500", 500],
    ["401", 401],
  ] as const) {
    test(`④ 진행 중 polling ${label} → 잠긴 뒤 도착, 그 뒤 새 polling 0`, async ({
      page,
    }) => {
      await openHistoryRoom(page);
      await incoming(page, ROOM_1, "잠그기 전 도매 말");
      if (status !== null)
        await chatMock(page, "fail", { op: "messages", page: "after", status });
      await chatMock(page, "delay", {
        op: "messages",
        page: "after",
        ms: LATE,
      });
      /* polling 하나가 지연에 걸려 날아가는 중이 될 때까지 */
      const before = await count(page, AFTER_GET);
      await advance(page, 3_000);
      await expect
        .poll(async () => {
          const list = await requests(page, AFTER_GET);
          return list.length > before && list.at(-1)?.status === null;
        })
        .toBe(true);
      await chatMock(page, "fail", {
        op: "messages",
        page: "before",
        status: 401,
      });
      await historyButton(page).click();
      await expect(lostAlert(page)).toBeVisible();
      const flying = await count(page, AFTER_GET);
      await advance(page, LATE);
      expect(await lastSettled(page, AFTER_GET)).toBe(status ?? 200);
      await advance(page, 100);
      const shown = log(page).getByText("잠그기 전 도매 말");
      if (status === null) await expect(shown).toHaveCount(1);
      else await expect(shown).toHaveCount(0);
      await expect(lostAlert(page)).toBeVisible();
      await advance(page, 9_000);
      expect(await count(page, AFTER_GET)).toBe(flying);
    });
  }
});
