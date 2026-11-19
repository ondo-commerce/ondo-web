import { expect, test, type Page } from "@playwright/test";
import { routeAuth } from "../loop-06b-retail-notify/helpers";
import { RETAILERS, type RetailerKey } from "../side-02/retail/stub-api";
import {
  addButton,
  assertStubServers,
  cards,
  CART_POST,
  chatMock,
  chatNav,
  composer,
  exposeQueryClient,
  failCart,
  incoming,
  inquiryButton,
  log,
  openRoomById,
  READ_POST,
  requests,
  roomRow,
  ROOM_GET,
  SEND_POST,
  setVisibility,
  slowCart,
  start,
  useOwnCart,
} from "./helpers";
import {
  advance,
  capturePageErrors,
  clientGo,
  draftKeys,
  DRAFT_PREFIX,
  expectRetryAndRemove,
  expectWritable,
  failedBubbles,
  lastSettled,
  loginAs,
  lostAlert,
  pendingBubbles,
  pressLogout,
  recordTexts,
  resetSeen,
  ROOM_1,
  sendText,
  seenTexts,
  storedDraft,
} from "./pending-helpers";

/**
 * #362 상태표 행 "로그아웃(이 탭 버튼)"과 "다른 계정 로그인", 셸이 내려가는 전체 이동(기획 §4-1 표 A 전 열, 표 B 쓰던 글·보류
 * 말풍선 열). `pnpm e2e:stub`. A = bombom(소매처 1, 방 1), B = miso(소매처 2, 방 2). 로그아웃 → 로그인은 클라이언트 이동이라
 * QueryClient, 셸 outbox 모듈, 목 저장소가 산다 — 그래야 A의 늦은 응답이 B 화면에 닿는지 볼 수 있다. 목 "나"는 `me` 손잡이로 B로.
 * 지연은 30초로 걸고 B 화면이 뜬 뒤 페이지 시계를 밀어 부른다.
 */

assertStubServers();

const LATE = 30_000;
const B_ROOM = 2;
const A_FAILED = "A 못 간 말";
const A_DRAFT = "A 쓰던 글";
const A_SENDING = "A 가는 중인 말";

test.use({ viewport: { width: 1280, height: 800 } });

test.beforeEach(async ({ page }) => {
  await routeAuth(page);
});

/**
 * 로그아웃 → `/login` → 목 "나"를 B로 → 기록 비움 → B 로그인 → B 방.
 * `sameRoomNumber`면 목 "나"를 그대로 두고 B가 방 1을 연다 — A의 늦은 결과가 가는 방 번호를 B 화면과 캐시가 갖고
 * 있어야 그 결과가 B 쪽에 쓰이는지 볼 수 있다(QA Q1, 리뷰 R10). 앱의 계정은 셸 `/me`(쿠키 B)와 로그아웃, 로그인 세대가
 * 정하고 목 "나"는 방 목록만 정한다. 방 번호는 목에서 소매처마다 따로라 B 몫의 방 1을 만들 길이 없어 이렇게 둔다
 */
async function switchToB(
  page: Page,
  key: RetailerKey = "miso",
  { sameRoomNumber = false }: { sameRoomNumber?: boolean } = {},
) {
  const room = sameRoomNumber ? ROOM_1 : B_ROOM;
  await pressLogout(page);
  await expect(page).toHaveURL(/\/login$/);
  if (!sameRoomNumber)
    await chatMock(page, "me", { retailerId: RETAILERS[key].retailerId });
  await resetSeen(page);
  await loginAs(page, key);
  await chatNav(page).click();
  await expect(page).toHaveURL("/chats");
  await roomRow(page, room).click();
  await expect(page).toHaveURL(`/chats/${room}?from=/chats`);
  await expect(composer(page)).toBeVisible();
}

test.describe("S2-4 [로그아웃 → 다른 계정]", () => {
  test("① A 글 + 실패 말풍선 + 보내는 중 → 로그아웃 → B 방: A 글, 말풍선 0(DOM 기록), 1: 키 0", async ({
    page,
  }) => {
    await recordTexts(page, [A_FAILED, A_DRAFT, A_SENDING]);
    await start(page, "/");
    await openRoomById(page, ROOM_1);
    await chatMock(page, "fail", { op: "send", status: 500 });
    await sendText(page, A_FAILED);
    await expectRetryAndRemove(failedBubbles(page));
    await chatMock(page, "delay", { op: "send", ms: LATE });
    await sendText(page, A_SENDING);
    await composer(page).fill(A_DRAFT);
    await expect
      .poll(() => storedDraft(page, RETAILERS.bombom.retailerId, ROOM_1))
      .toBe(A_DRAFT);

    await switchToB(page);
    await advance(page, LATE);
    expect(await lastSettled(page, SEND_POST)).toBe(201);
    await advance(page, 2_000);
    expect(await seenTexts(page)).toEqual([]);
    await expect(pendingBubbles(page)).toHaveCount(0);
    expect(
      (await draftKeys(page)).filter((k) =>
        k.startsWith(`${DRAFT_PREFIX}${RETAILERS.bombom.retailerId}:`),
      ),
    ).toEqual([]);
  });

  for (const [label, status] of [
    ["201", null],
    ["500", 500],
    ["401", 401],
  ] as const) {
    test(`② A 보내기 늦은 ${label} → 로그아웃 → B가 방 1(A 결과가 가는 방)을 연 채 도착 → 방 1 보류 0, 끊김 0, 쓰기 가능, pageerror 0`, async ({
      page,
    }) => {
      const errors = capturePageErrors(page);
      await recordTexts(page, [A_SENDING]);
      await start(page, "/");
      await openRoomById(page, ROOM_1);
      if (status !== null) await chatMock(page, "fail", { op: "send", status });
      await chatMock(page, "delay", { op: "send", ms: LATE });
      await sendText(page, A_SENDING);
      await switchToB(page, "miso", { sameRoomNumber: true });
      if (status === null) {
        /* 201은 목 서버가 요청 시점에 방 1에 저장해 B의 첫 조회에도 이미 있다. 그래서 B의 polling을 멈추고(탭 숨김)
           방 1 캐시에서 그 말을 빼 둔다 — 그 뒤 다시 넣을 수 있는 건 A 보내기의 늦은 성공 쓰기뿐이다(QA Q1) */
        await setVisibility(page, "hidden");
        await exposeQueryClient(page);
        await page.evaluate(
          ({ roomId, body }) => {
            const client = (
              window as unknown as {
                __ondoQueryClient: {
                  setQueryData: (
                    k: unknown[],
                    u: (
                      v: { messages: { body: string }[] } | undefined,
                    ) => unknown,
                  ) => void;
                };
              }
            ).__ondoQueryClient;
            client.setQueryData(["chat", "thread", roomId], (thread) =>
              thread === undefined
                ? thread
                : {
                    ...thread,
                    messages: thread.messages.filter((m) => m.body !== body),
                  },
            );
          },
          { roomId: ROOM_1, body: A_SENDING },
        );
      }
      await advance(page, LATE);
      expect(await lastSettled(page, SEND_POST)).toBe(status ?? 201);
      if (status === null) {
        const inCache = await page.evaluate(
          ({ roomId, body }) => {
            const client = (
              window as unknown as {
                __ondoQueryClient: { getQueryData: (k: unknown[]) => unknown };
              }
            ).__ondoQueryClient;
            const thread = client.getQueryData(["chat", "thread", roomId]) as
              { messages: { body: string }[] } | undefined;
            return thread?.messages.some((m) => m.body === body) ?? null;
          },
          { roomId: ROOM_1, body: A_SENDING },
        );
        expect(inCache, "A의 늦은 201이 B의 방 1 캐시에 썼다").toBe(false);
        await setVisibility(page, "visible");
      }
      await advance(page, 2_000);
      /* A의 보내기가 B 화면에 남기는 것: 보내는 중, 실패 말풍선(500 R+D, 401 D), 401 잠금. 셋 다 0이어야 한다 */
      await expect(pendingBubbles(page)).toHaveCount(0);
      await expect(lostAlert(page)).toHaveCount(0);
      await expectWritable(page);
      if (status === null) {
        /* 201은 위 캐시 단언이 본다. 그 말은 시험이 캐시에서 뺐고 cursor가 이미 지나 다시 안 온다 — 보류 말풍선으로도 없다 */
        await expect(
          pendingBubbles(page).filter({ hasText: A_SENDING }),
        ).toHaveCount(0);
      } else {
        await expect(log(page).getByText(A_SENDING)).toHaveCount(0);
        expect(await seenTexts(page)).toEqual([]);
      }
      expect(errors).toEqual([]);
    });
  }

  /** B 화면 상태: 방 log 글, 헤더 장바구니 칸 글 */
  async function snapshotB(page: Page) {
    return {
      log: await log(page).innerText(),
      cart: await page
        .getByRole("link", { name: /장바구니/ })
        .first()
        .innerText(),
    };
  }

  /** 셸 refresh(RSC, prefetch 제외) 요청 수 */
  function countRefreshes(page: Page) {
    const seen = { n: 0 };
    page.on("request", (r) => {
      const h = r.headers();
      if (h["rsc"] === "1" && h["next-router-prefetch"] === undefined)
        seen.n += 1;
    });
    return seen;
  }

  test("③ 읽음 늦은 200 → 로그아웃 → B → 도착 뒤 B 방과 헤더 변화 0, 셸 refresh 0", async ({
    page,
  }) => {
    const refreshes = countRefreshes(page);
    await start(page, "/");
    await incoming(page, ROOM_1, "A가 읽을 도매 말");
    await chatMock(page, "delay", { op: "read", ms: LATE });
    await openRoomById(page, ROOM_1);
    await expect
      .poll(async () => (await requests(page, READ_POST)).at(-1)?.status)
      .toBeNull();
    const before = (await requests(page, READ_POST)).length;
    expect(before).toBeGreaterThan(0);
    await switchToB(page);
    const shot = await snapshotB(page);
    const refreshed = refreshes.n;
    await advance(page, LATE);
    await expect
      .poll(async () =>
        (await requests(page, READ_POST))
          .slice(0, before)
          .every((r) => r.status !== null),
      )
      .toBe(true);
    await advance(page, 2_000);
    expect(await snapshotB(page)).toEqual(shot);
    expect(refreshes.n).toBe(refreshed);
  });

  test("③ 방 머리 늦은 200 → 로그아웃 → B → 도착 뒤 B 방과 헤더 변화 0", async ({
    page,
  }) => {
    await start(page, "/");
    await chatMock(page, "delay", { op: "room", ms: LATE });
    await chatNav(page).click();
    await expect(page).toHaveURL("/chats");
    await roomRow(page, ROOM_1).click();
    await expect(page).toHaveURL(`/chats/${ROOM_1}?from=/chats`);
    await expect
      .poll(async () => (await requests(page, ROOM_GET)).at(-1)?.status)
      .toBeNull();
    const aHeads = (await requests(page, ROOM_GET)).length;
    /* B도 방 1을 연다 — A의 늦은 방 머리가 합치려는 칸(방 1 thread 캐시)이 B 몫으로 다시 생긴다(리뷰 R10) */
    await switchToB(page, "miso", { sameRoomNumber: true });
    const shot = await snapshotB(page);
    /* B의 polling을 멈추고(탭 숨김) 방 1 상대 읽음 칸에 표지(null)를 둔다. 그 뒤 이 칸을 바꿀 수 있는 건 A의 늦은
       방 머리뿐이다 — 쓰면 서버 값이 들어온다 */
    await setVisibility(page, "hidden");
    await exposeQueryClient(page);
    const readMark = () =>
      page.evaluate((roomId) => {
        const client = (
          window as unknown as {
            __ondoQueryClient: { getQueryData: (k: unknown[]) => unknown };
          }
        ).__ondoQueryClient;
        const thread = client.getQueryData(["chat", "thread", roomId]) as
          { counterpartRead: number | null } | undefined;
        /* 칸이 없으면 "없음"으로 구별한다(null 표지와 섞이지 않게) */
        return thread === undefined ? "no-thread" : thread.counterpartRead;
      }, ROOM_1);
    await page.evaluate((roomId) => {
      const client = (
        window as unknown as {
          __ondoQueryClient: {
            setQueryData: (
              k: unknown[],
              u: (v: { counterpartRead: number | null } | undefined) => unknown,
            ) => void;
          };
        }
      ).__ondoQueryClient;
      client.setQueryData(["chat", "thread", roomId], (thread) =>
        thread === undefined ? thread : { ...thread, counterpartRead: null },
      );
    }, ROOM_1);
    expect(await readMark()).toBeNull();
    await advance(page, LATE);
    /* A의 방 머리가 실제로 도착했다(응답 상태가 찍힘) */
    await expect
      .poll(async () =>
        (await requests(page, ROOM_GET))
          .slice(0, aHeads)
          .every((r) => r.status !== null),
      )
      .toBe(true);
    expect(await readMark()).toBeNull();
    await setVisibility(page, "visible");
    await advance(page, 2_000);
    expect(await snapshotB(page)).toEqual(shot);
  });

  test("③ 담기 늦은 201 → 로그아웃 → B → 도착 뒤 헤더 장바구니 숫자 변화 0, 셸 refresh 0", async ({
    page,
  }) => {
    const refreshes = countRefreshes(page);
    await useOwnCart(page);
    await start(page, "/");
    await openRoomById(page, ROOM_1);
    /* 담기는 가짜 API(3199) 서버 시계라 실제로 기다린다. B 방이 뜰 때까지보다 길게 */
    await slowCart(page, 8_000);
    await addButton(cards(page, 3002).first()).click();
    await switchToB(page);
    const shot = await snapshotB(page);
    const refreshed = refreshes.n;
    expect(await lastSettled(page, CART_POST, 15_000)).toBe(201);
    await advance(page, 2_000);
    expect(await snapshotB(page)).toEqual(shot);
    expect(refreshes.n).toBe(refreshed);
  });
});

test.describe("S2-9 [401 뒤 /login, 셸이 내려가는 전체 이동]", () => {
  test("① 문의하기 401 → /login → bombom → 방 1 초안 그대로, 실패 말풍선 0", async ({
    page,
  }) => {
    await start(page, "/");
    await openRoomById(page, ROOM_1);
    await chatMock(page, "fail", { op: "send", status: 500 });
    await sendText(page, A_FAILED);
    await expectRetryAndRemove(failedBubbles(page));
    await composer(page).fill(A_DRAFT);
    await expect
      .poll(() => storedDraft(page, RETAILERS.bombom.retailerId, ROOM_1))
      .toBe(A_DRAFT);
    await clientGo(page, "/products/11");
    await chatMock(page, "fail", { op: "create", status: 401 });
    await inquiryButton(page).click();
    await expect(page).toHaveURL(/\/login$/);
    await loginAs(page, "bombom");
    await openRoomById(page, ROOM_1);
    await expect(composer(page)).toHaveValue(A_DRAFT);
    await expect(pendingBubbles(page)).toHaveCount(0);
  });

  test("③ 상품 상세 장바구니 담기 401(채팅 밖) → /login → bombom → 초안 남음, 실패 말풍선 0", async ({
    page,
  }) => {
    await useOwnCart(page);
    await start(page, "/");
    await openRoomById(page, ROOM_1);
    await chatMock(page, "fail", { op: "send", status: 500 });
    await sendText(page, A_FAILED);
    await expectRetryAndRemove(failedBubbles(page));
    await composer(page).fill(A_DRAFT);
    await expect
      .poll(() => storedDraft(page, RETAILERS.bombom.retailerId, ROOM_1))
      .toBe(A_DRAFT);
    await clientGo(page, "/products/11");
    const qty = page.getByRole("textbox", { name: / 수량$/ }).first();
    await qty.fill("2");
    await expect(qty).toHaveValue("2");
    await failCart(page, 401);
    const add = page.getByRole("button", {
      name: "장바구니 담기",
      exact: true,
    });
    await expect(add).toBeEnabled();
    await add.click();
    await expect(page).toHaveURL(/\/login$/);
    await loginAs(page, "bombom");
    await openRoomById(page, ROOM_1);
    await expect(composer(page)).toHaveValue(A_DRAFT);
    await expect(pendingBubbles(page)).toHaveCount(0);
  });
});

test.describe("S2-10 [새로고침]", () => {
  test("실패 말풍선 + 초안 → 새로고침 → 말풍선 0, 초안 남음", async ({
    page,
  }) => {
    await start(page, "/");
    await openRoomById(page, ROOM_1);
    await chatMock(page, "fail", { op: "send", status: 500 });
    await sendText(page, A_FAILED);
    await expectRetryAndRemove(failedBubbles(page));
    await composer(page).fill(A_DRAFT);
    await expect
      .poll(() => storedDraft(page, RETAILERS.bombom.retailerId, ROOM_1))
      .toBe(A_DRAFT);
    await page.reload();
    await expect(composer(page)).toHaveValue(A_DRAFT);
    await expect(pendingBubbles(page)).toHaveCount(0);
  });
});
