import { expect, test } from "@playwright/test";
import { routeAuth } from "../loop-06b-retail-notify/helpers";
import { RETAILERS } from "../side-02/retail/stub-api";
import {
  addButton,
  assertStubServers,
  cards,
  CART_POST,
  chatMock,
  composer,
  count,
  SEND_POST,
  start,
  useOwnCart,
} from "./helpers";
import {
  advance,
  draftKeys,
  DRAFT_PREFIX,
  expectReadOnly,
  failedBubbleAndDraft,
  failedBubbles,
  loginAs,
  lostAlert,
  pendingBubbles,
  pressLogout,
  retryOf,
  ROOM_1,
  storedDraft,
} from "./pending-helpers";

/**
 * #362 상태표 행 "로그아웃 응답 대기 중"(기획 §4-1 표 A 둘째 행, 표 B 보류 말풍선 열, §4-2 9). `pnpm e2e:stub`.
 *
 * 로그아웃 응답을 붙잡는다(기획: `page.route`로 3초 지연). 시간 대신 문(gate)으로 붙잡는다 — 이 시험이 끝을 정할 때까지
 * 서버가 답하지 않는 것과 같다. 로그아웃 요청은 MSW worker를 지나 context 경로가 받는다(`routeAuth`와 같은 이유).
 * 나중에 건 경로가 먼저 받는다.
 */

assertStubServers();

test.use({ viewport: { width: 1280, height: 800 } });

/** 방 화면 요청(방 머리, 메시지, 읽음, 보내기). 헤더 count와 목록은 뺀다 */
const ROOM_REQ = { path: /\/api\/retail\/chat\/rooms\/\d+(\/|$|\?)/ } as const;

test("S2-15 [로그아웃 응답 대기 중] ① 보류 0, 읽기 전용, 안내 줄 0, 보내기 POST 0 ② 채팅·담기 요청 0 ③ 이동 뒤 B 로그인 → 1: 키 0", async ({
  page,
}) => {
  await routeAuth(page);
  let release = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.context().route("**/api/retail/auth/logout", async (route) => {
    await held;
    await page.context().clearCookies({ name: "stub_retailer" });
    await route.fulfill({ status: 204 });
  });

  await useOwnCart(page);
  await start(page, "/");
  await failedBubbleAndDraft(
    page,
    "나가기 전 못 간 말",
    "나가기 전 쓰던 글",
    chatMock,
  );
  await expect
    .poll(() => storedDraft(page, RETAILERS.bombom.retailerId, ROOM_1))
    .toBe("나가기 전 쓰던 글");

  await pressLogout(page);

  await test.step("① 이동 전 화면: 보류 0, 읽기 전용, 끊김 안내 0 → Enter, 다시 보내기 → POST 0", async () => {
    await expect(page).toHaveURL(`/chats/${ROOM_1}?from=/chats`);
    await expect(pendingBubbles(page)).toHaveCount(0);
    await expect(retryOf(failedBubbles(page))).toHaveCount(0);
    await expect(composer(page)).toBeVisible();
    await expectReadOnly(page);
    await expect(lostAlert(page)).toHaveCount(0);
    const sends = await count(page, SEND_POST);
    await composer(page).press("Enter");
    await advance(page, 500);
    expect(await count(page, SEND_POST)).toBe(sends);
  });

  await test.step("② 3초 동안 messages, room, read, 담기 요청 0", async () => {
    const room = await count(page, ROOM_REQ);
    const cart = await count(page, CART_POST);
    const add = addButton(cards(page, 3002).first());
    await expect(add).toBeDisabled();
    await add.click({ force: true });
    await advance(page, 3_000);
    expect(await count(page, ROOM_REQ)).toBe(room);
    expect(await count(page, CART_POST)).toBe(cart);
    await expect(page).toHaveURL(`/chats/${ROOM_1}?from=/chats`);
  });

  await test.step("③ 응답 → /login → B 로그인 → 1: 키 0", async () => {
    release();
    await expect(page).toHaveURL(/\/login$/);
    await chatMock(page, "me", { retailerId: RETAILERS.miso.retailerId });
    await loginAs(page, "miso");
    expect(
      (await draftKeys(page)).filter((k) =>
        k.startsWith(`${DRAFT_PREFIX}${RETAILERS.bombom.retailerId}:`),
      ),
    ).toEqual([]);
  });
});
