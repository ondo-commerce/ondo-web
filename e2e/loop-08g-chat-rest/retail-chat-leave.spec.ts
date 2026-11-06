import { expect, test, type Page } from "@playwright/test";
import {
  APPROVAL,
  appAlert,
  assertStubServers,
  CART,
  cartLink,
  chatMock,
  createCount,
  deliverLate,
  entryPushes,
  holdRsc,
  inquiryButton,
  LATE,
  pressInquiry,
  PRODUCT_11,
  PRODUCT_21,
  PRODUCT_31,
  routerGo,
  startAt,
} from "./helpers";

/**
 * #376 1번 — 방 만들기를 누르고 그 화면을 떠났을 때 늦은 응답(08f 기획 §4-7, Q5 ①). 규칙은 **이동 세대 + 마운트
 * 상태, 한 번 떠나면 무효**: 셸이 경로나 쿼리가 바뀔 때마다 세대를 올리고, 입구는 누를 때 쥔 세대와 응답 때 세대가
 * 다르거나 언마운트됐으면 응답을 버린다(이동 0, 문구 0, 승인 이동 0). 같은 인스턴스면 버튼을 다시 켠다.
 *
 * 1280 기준(AC S5-1 원문). 목 지연 3초는 페이지 시계로 민다(`deliverLate`). 방 1 = 무드온(101, 시드라 200),
 * 상품 31의 도매처 103은 방이 없어 첫 누름이 201이다.
 */

assertStubServers();
test.use({ viewport: { width: 1280, height: 800 } });

/** 늦은 응답 하나를 걸고 누른다. `fail`이 있으면 같은 지연 뒤 실패한다(목 `plannedFailure`) */
async function pressLate(page: Page, failStatus?: number): Promise<void> {
  if (failStatus !== undefined)
    await chatMock(page, "fail", { op: "create", status: failStatus });
  await chatMock(page, "delay", { op: "create", ms: LATE });
  await pressInquiry(page);
}

/** 버린 응답: 주소 그대로, 방이나 승인 화면 router 호출 0, 알림 0, POST 1 */
async function expectDropped(page: Page, url: string): Promise<void> {
  await expect(page).toHaveURL(url);
  expect(await entryPushes(page)).toEqual([]);
  await expect(appAlert(page)).toHaveCount(0);
  expect(await createCount(page)).toBe(1);
}

test.describe("S5-1 떠나면 늦은 성공을 버린다", () => {
  test("① 장바구니로 떠남 → 주소 /cart, 방 이동 0, alert 0, POST 1 → 돌아와 누르면 방 1(200)", async ({
    page,
  }) => {
    await startAt(page, PRODUCT_11);
    await pressLate(page);
    await cartLink(page).click();
    await expect(page).toHaveURL(CART);
    expect(await deliverLate(page)).toBe(200);
    await expectDropped(page, CART);

    await routerGo(page, PRODUCT_11);
    await expect(inquiryButton(page)).toBeEnabled();
    await inquiryButton(page).click();
    await expect(page).toHaveURL(`/chats/1?from=${PRODUCT_11}`);
    expect(await createCount(page)).toBe(2);
  });

  test("② 상품 21로 떠남(같은 라우트 다른 상품) → 주소 /products/21, 방 이동 0, alert 0, POST 1 → 상품 11에서 누르면 방 1", async ({
    page,
  }) => {
    await startAt(page, PRODUCT_11);
    await pressLate(page);
    await routerGo(page, PRODUCT_21);
    expect(await deliverLate(page)).toBe(200);
    await expectDropped(page, PRODUCT_21);
    /* 상품 21(라온)의 입구는 앞 응답과 상관없이 눌린다 */
    await expect(inquiryButton(page)).toBeEnabled();

    await routerGo(page, PRODUCT_11);
    await inquiryButton(page).click();
    await expect(page).toHaveURL(`/chats/1?from=${PRODUCT_11}`);
    expect(await createCount(page)).toBe(2);
  });

  test("③ 방이 없던 도매처: 늦은 201을 버려도 방은 생겼다 → 돌아와 누르면 200으로 방 34", async ({
    page,
  }) => {
    await startAt(page, PRODUCT_31);
    await pressLate(page);
    await cartLink(page).click();
    await expect(page).toHaveURL(CART);
    expect(await deliverLate(page)).toBe(201);
    await expectDropped(page, CART);

    await routerGo(page, PRODUCT_31);
    await inquiryButton(page).click();
    await expect(page).toHaveURL(`/chats/34?from=${PRODUCT_31}`);
    expect(await createCount(page)).toBe(2);
  });
});

test.describe("S5-2 안 떠나면 지금처럼", () => {
  test("늦은 200 → 방으로 이동", async ({ page }) => {
    await startAt(page, PRODUCT_11);
    await pressLate(page);
    expect(await deliverLate(page)).toBe(200);
    await expect(page).toHaveURL(`/chats/1?from=${PRODUCT_11}`);
    expect(await entryPushes(page)).toEqual([
      `push /chats/1?from=${PRODUCT_11}`,
    ]);
  });

  test("늦은 500 → 입구 실패 문구, 버튼 켜짐", async ({ page }) => {
    await startAt(page, PRODUCT_11);
    await pressLate(page, 500);
    expect(await deliverLate(page)).toBe(500);
    await expect(appAlert(page)).toHaveText(
      "대화방을 열지 못했어요. 다시 눌러 주세요",
    );
    await expect(inquiryButton(page)).toBeEnabled();
    await expect(page).toHaveURL(PRODUCT_11);
  });
});

test.describe("S5-8 떠난 뒤 늦은 실패", () => {
  test("늦은 500 + 장바구니로 떠남 → 장바구니에 문구 0 → 상품 11로 돌아오면 버튼 켜짐, 문구 0", async ({
    page,
  }) => {
    await startAt(page, PRODUCT_11);
    await pressLate(page, 500);
    await cartLink(page).click();
    await expect(page).toHaveURL(CART);
    expect(await deliverLate(page)).toBe(500);
    await expectDropped(page, CART);

    await routerGo(page, PRODUCT_11);
    await expect(inquiryButton(page)).toBeEnabled();
    await expect(appAlert(page)).toHaveCount(0);
  });

  test("승인 전 계정 늦은 403 + 상품 21로 떠남 → 승인 화면 이동 0", async ({
    page,
  }) => {
    await startAt(page, PRODUCT_11, "pending");
    await pressLate(page, 403);
    await routerGo(page, PRODUCT_21);
    expect(await deliverLate(page)).toBe(403);
    await expectDropped(page, PRODUCT_21);
    expect(page.url()).not.toContain(APPROVAL);
  });
});

test.describe("S5-9 같은 인스턴스", () => {
  test("늦은 201 중 쿼리만 바꿈(router.replace) → 이동 0, 버튼 다시 켜짐 → 다시 누르면 방 34", async ({
    page,
  }) => {
    await startAt(page, PRODUCT_31);
    await pressLate(page);
    await routerGo(page, `${PRODUCT_31}?from=x`, "replace");
    expect(await deliverLate(page)).toBe(201);
    await expectDropped(page, `${PRODUCT_31}?from=x`);
    await expect(inquiryButton(page)).toBeEnabled();

    await inquiryButton(page).click();
    await expect(page).toHaveURL(`/chats/34?from=${PRODUCT_31}`);
    expect(await createCount(page)).toBe(2);
  });

  test("늦은 201 중 해시만 바꿈(#detail) → 떠남 아님, 방 34로 이동", async ({
    page,
  }) => {
    await startAt(page, PRODUCT_31);
    await pressLate(page);
    await page.evaluate(() => {
      location.hash = "#detail";
    });
    await expect(page).toHaveURL(`${PRODUCT_31}#detail`);
    expect(await deliverLate(page)).toBe(201);
    await expect(page).toHaveURL(`/chats/34?from=${PRODUCT_31}`);
    expect(await entryPushes(page)).toEqual([
      `push /chats/34?from=${PRODUCT_31}`,
    ]);
  });
});

test.describe("R1 이동 시작 뒤, 새 화면 커밋 전에 온 응답", () => {
  test("① 장바구니 RSC를 붙잡은 채 방 응답이 먼저 → 방 이동 0 → RSC 풀면 /cart, POST 1", async ({
    page,
  }) => {
    await startAt(page, PRODUCT_11);
    await pressLate(page);
    const cartRsc = await holdRsc(page, CART);
    await cartLink(page).click();
    await cartRsc.held;
    /* 새 화면이 아직 안 왔다 — 입구는 살아 있고 셸 effect도 아직 안 돌았다 */
    await expect(page).toHaveURL(PRODUCT_11);
    expect(await deliverLate(page)).toBe(200);
    expect(await entryPushes(page)).toEqual([]);

    cartRsc.release();
    await expect(page).toHaveURL(CART);
    await expectDropped(page, CART);
  });

  test("② 같은 인스턴스 쿼리 왕복(?from=x → 원래 주소) 뒤 방 응답 → 이동 0, 버튼 켜짐", async ({
    page,
  }) => {
    await startAt(page, PRODUCT_31);
    await pressLate(page);
    await routerGo(page, `${PRODUCT_31}?from=x`, "replace");
    await routerGo(page, PRODUCT_31, "replace");
    expect(await deliverLate(page)).toBe(201);
    await expectDropped(page, PRODUCT_31);
    await expect(inquiryButton(page)).toBeEnabled();
  });
});

test.describe("S5-10 떠났다 복귀", () => {
  test("늦은 응답 중 장바구니 → 뒤로(상품 11) → 응답 도착 → 이동 0, 버튼 켜짐", async ({
    page,
  }) => {
    await startAt(page, PRODUCT_11);
    await pressLate(page);
    await cartLink(page).click();
    await expect(page).toHaveURL(CART);
    await page.goBack();
    await expect(page).toHaveURL(PRODUCT_11);
    expect(await deliverLate(page)).toBe(200);
    await expectDropped(page, PRODUCT_11);
    await expect(inquiryButton(page)).toBeEnabled();
  });
});
