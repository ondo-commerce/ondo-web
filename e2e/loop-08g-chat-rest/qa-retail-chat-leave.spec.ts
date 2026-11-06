import { existsSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import {
  appAlert,
  assertStubServers,
  chatMock,
  CREATE_POST,
  exposeQueryClient,
  inquiryButton,
  requests,
  resetMock,
  signIn,
  T0,
  watchRequests,
} from "../loop-08e-chat-rest/helpers";

/**
 * loop-08g QA — 방 만들기 뒤 떠남(#376 1번, fix-376-retail-chat-leave). `pnpm e2e:stub`.
 *
 * 이 파일은 08e 도우미만 쓴다. 08g `helpers.ts`는 fix 브랜치에만 있어서, hygiene 브랜치 전체 실행에서도 이 파일이
 * 불러오기 오류를 내지 않게 필요한 도우미(router 감시, RSC 붙잡기, 늦은 응답 보내기)를 여기 다시 적었다.
 * fix 브랜치가 아니면(08g helpers.ts 없음) 전부 건너뛴다 — 고친 동작이 없는 트리에서 돌면 당연히 실패한다.
 *
 * 1. 화면: 1280 상품 11 `문의하기` → 장바구니로 떠남 → 3초 뒤(목 지연) 장바구니 그대로 → 상품 11 → 버튼 켜짐 → 방 1
 * 2. 02-dev-fix §6 1 재현: 셸 안 프로그램 이동(헤더 검색 제출 = `router.push`)의 시작~커밋 틈에 온 방 응답
 * 3. popstate 리스너가 가르는 장면을 만들 수 있나(뒤로가기 RSC를 붙잡을 수 있나)
 */

assertStubServers();
test.use({ viewport: { width: 1280, height: 800 } });
test.skip(
  !existsSync("e2e/loop-08g-chat-rest/helpers.ts"),
  "fix-376-retail-chat-leave 전용(08g helpers.ts가 있는 트리)",
);

const SHOTS =
  "/Users/oh-chang-eun/onDo/.claude/harness/runs/loop-08g-chat-rest/qa";
const PRODUCT_11 = "/products/11";
const CART = "/cart";
const LATE = 3_000;

type NextRouter = {
  push: (href: string, options?: unknown) => void;
  replace: (href: string, options?: unknown) => void;
};

async function startAt(page: Page, path: string): Promise<void> {
  await watchRequests(page);
  await page.clock.install({ time: T0 });
  await signIn(page, "bombom");
  await page.goto(path);
  await expect(inquiryButton(page)).toBeVisible();
  await resetMock(page);
  await exposeQueryClient(page);
  await expect
    .poll(() =>
      page.evaluate(() => {
        const w = window as unknown as {
          next?: { router?: NextRouter };
          __qaPushes?: string[];
        };
        const router = w.next?.router;
        if (router === undefined) return false;
        if (w.__qaPushes !== undefined) return true;
        const calls: string[] = [];
        w.__qaPushes = calls;
        const push = router.push.bind(router);
        const replace = router.replace.bind(router);
        router.push = (href, options) => {
          calls.push(`push ${href}`);
          push(href, options);
        };
        router.replace = (href, options) => {
          calls.push(`replace ${href}`);
          replace(href, options);
        };
        return true;
      }),
    )
    .toBe(true);
}

async function allPushes(page: Page): Promise<string[]> {
  return page.evaluate(
    () => (window as unknown as { __qaPushes?: string[] }).__qaPushes ?? [],
  );
}

async function roomPushes(page: Page): Promise<string[]> {
  return (await allPushes(page)).filter((c) =>
    /^push (\/chats\/\d+|\/approval)/.test(c),
  );
}

async function pressLate(page: Page): Promise<void> {
  await chatMock(page, "delay", { op: "create", ms: LATE });
  await inquiryButton(page).click();
  await expect(
    page.getByRole("button", { name: "여는 중", exact: true }),
  ).toBeDisabled();
}

/** 목 지연만큼 시계를 밀고 응답 처리(뮤테이션 settled)까지, 그다음 2초 더 */
async function deliverLate(page: Page): Promise<number> {
  await page.clock.runFor(LATE);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (
            window as unknown as {
              __ondoQueryClient: {
                getMutationCache: () => {
                  getAll: () => { state: { status: string } }[];
                };
              };
            }
          ).__ondoQueryClient
            .getMutationCache()
            .getAll()
            .at(-1)?.state.status,
      ),
    )
    .toMatch(/^(success|error)$/);
  const status = (await requests(page, CREATE_POST)).at(-1)?.status ?? 0;
  await page.clock.runFor(2_000);
  return status;
}

/** 그 경로 RSC(`rsc: 1`)를 붙잡는다. context route — MSW worker가 다시 낸 요청은 page route에 안 걸린다 */
async function holdRsc(
  page: Page,
  pathname: string,
): Promise<{ held: () => boolean; release: () => void }> {
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let isHeld = false;
  await page.context().route(
    (url) => url.pathname === pathname,
    async (route) => {
      if (route.request().headers()["rsc"] !== "1") {
        await route.fallback();
        return;
      }
      isHeld = true;
      await gate;
      await route.fallback();
    },
  );
  return { held: () => isHeld, release };
}

test("화면: 1280 상품 11 문의하기 → 장바구니로 떠남 → 3초 뒤 장바구니 그대로 → 복귀 → 버튼 켜짐 → 방 1", async ({
  page,
}) => {
  await startAt(page, PRODUCT_11);
  await pressLate(page);
  await page.screenshot({ path: `${SHOTS}/leave-1-opening-1280.png` });
  await page.getByRole("link", { name: /^장바구니/ }).click();
  await expect(page).toHaveURL(CART);
  expect(await deliverLate(page)).toBe(200);
  await expect(page).toHaveURL(CART);
  expect(await roomPushes(page)).toEqual([]);
  await expect(appAlert(page)).toHaveCount(0);
  await page.screenshot({ path: `${SHOTS}/leave-2-cart-after-3s-1280.png` });

  /* 사장이 돌아오는 길: 브라우저 뒤로 */
  await page.goBack();
  await expect(page).toHaveURL(PRODUCT_11);
  await expect(inquiryButton(page)).toBeEnabled();
  await page.screenshot({ path: `${SHOTS}/leave-3-back-enabled-1280.png` });
  await inquiryButton(page).click();
  await expect(page).toHaveURL(`/chats/1?from=${PRODUCT_11}`);
  expect((await requests(page, CREATE_POST)).map((r) => r.status)).toEqual([
    200, 200,
  ]);
  await page.screenshot({ path: `${SHOTS}/leave-4-room1-1280.png` });
});

test.describe("02-dev-fix §6 1 프로그램 이동 시작~커밋 틈", () => {
  /* 기대(AC S5-1 규칙 '떠나면 버림')를 단언한다. 지금 코드는 router.push 시작을 모른다 → 실패가 결함 재현이다 */
  // 08g-Q1 accept, 프로그램 이동 틈(router.push는 Next 공개 API에 시작 이벤트가 없다). 아는 틈의 기록으로 test.fail 유지
  test.fail();
  test("헤더 검색 제출(router.push /search)을 RSC 붙잡은 채 방 응답이 먼저 → 방 이동 0이어야 한다", async ({
    page,
  }) => {
    await startAt(page, PRODUCT_11);
    await pressLate(page);
    const searchRsc = await holdRsc(page, "/search");
    const search = page.getByRole("searchbox", {
      name: "통합 검색",
      exact: true,
    });
    await search.fill("린넨");
    await search.press("Enter");
    await expect.poll(() => searchRsc.held()).toBe(true);
    await expect(page).toHaveURL(PRODUCT_11);
    expect(await deliverLate(page)).toBe(200);
    const pushesAtResponse = await allPushes(page);
    searchRsc.release();
    await expect(page).not.toHaveURL(PRODUCT_11);
    test.info().annotations.push({
      type: "repro",
      description: JSON.stringify({
        searchbox: await page
          .locator("form[role=search] input")
          .first()
          .evaluate((el) => ({
            tag: el.tagName,
            aria: el.getAttribute("aria-label"),
          }))
          .catch(() => "이동 뒤 없음"),
        pushesAtResponse,
        finalUrl: page.url(),
      }),
    });
    expect(pushesAtResponse.filter((c) => c.startsWith("push /chats"))).toEqual(
      [],
    );
  });
});

test("popstate 장면 탐색: 장바구니 → 상품 11 → 누름 → 뒤로(장바구니) RSC를 붙잡을 수 있나", async ({
  page,
}) => {
  await startAt(page, PRODUCT_11);
  await page.getByRole("link", { name: /^장바구니/ }).click();
  await expect(page).toHaveURL(CART);
  await page.goBack();
  await expect(page).toHaveURL(PRODUCT_11);
  await expect(inquiryButton(page)).toBeEnabled();
  await page.goForward();
  await expect(page).toHaveURL(CART);
  await page.goBack();
  await expect(page).toHaveURL(PRODUCT_11);
  await expect(inquiryButton(page)).toBeEnabled();

  await pressLate(page);
  const cartRsc = await holdRsc(page, CART);
  await page.goForward();
  await expect(page).toHaveURL(CART);
  expect(await deliverLate(page)).toBe(200);
  test.info().annotations.push({
    type: "popstate",
    description: JSON.stringify({
      rscHeld: cartRsc.held(),
      pushes: await allPushes(page),
      url: page.url(),
    }),
  });
  cartRsc.release();
  expect(await roomPushes(page)).toEqual([]);
  await expect(page).toHaveURL(CART);
});
