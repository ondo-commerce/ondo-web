import { expect, type Locator, type Page } from "@playwright/test";
import type { RetailerKey } from "../side-02/retail/stub-api";
import {
  CREATE_POST,
  exposeQueryClient,
  inquiryButton,
  requests,
  resetMock,
  signIn,
  T0,
  watchRequests,
} from "../loop-08e-chat-rest/helpers";

export * from "../loop-08e-chat-rest/helpers";

/**
 * loop-08g 방 만들기 뒤 떠남(#376 1번, 08f 기획 §4-7). `pnpm e2e:stub`으로 돈다.
 *
 * 시간은 페이지 시계(`page.clock`)로 민다. 목 지연(`delay {op: create}`)이 같은 시계라 "응답 도착", "그 2초 뒤"를
 * 고정 대기 없이 만든다. 시계를 멈추지는 않는다 — 클라이언트 이동(RSC 요청)은 실제 시간에 끝나야 한다.
 *
 * "방으로 안 갔다"는 주소만 보면 못 가른다. 이동은 RSC 요청이 끝나야 주소에 보여서, 아직 안 바뀐 것인지 안 갈 것인지
 * 모른다. 그래서 입구가 부르는 `router.push`를 직접 센다(`watchPushes`). 입구의 `useRouter()`는
 * `window.next.router`와 같은 객체(`publicAppRouterInstance`)라 그 메서드를 감싸면 입구의 호출이 잡힌다.
 * 응답 처리가 끝났다는 신호는 TanStack 뮤테이션 상태다(`createSettled`) — 상태가 success/error로 바뀐 그 틱에
 * `mutateAsync`의 then이 돈다.
 */

export const PRODUCT_11 = "/products/11";
export const PRODUCT_21 = "/products/21";
/** 도매처 103(방 없음) 상품. 누르면 201로 방 34가 생긴다 */
export const PRODUCT_31 = "/products/31";
export const CART = "/cart";
export const APPROVAL = "/approval";
export const LATE = 3_000;

interface RouterSpy {
  calls: string[];
}

type NextRouter = {
  push: (href: string, options?: unknown) => void;
  replace: (href: string, options?: unknown) => void;
};

/**
 * 시작: 요청 감시 + T0 시계 + 계정 → 그 화면 → 목 reset 200 → QueryClient 노출 → router 감시.
 * 08e `start`와 달리 계정을 고른다(승인 전 계정은 채팅 배지 count가 403이라 그걸 기다리지 않는다)
 */
export async function startAt(
  page: Page,
  path: string,
  key: RetailerKey = "bombom",
): Promise<void> {
  await watchRequests(page);
  await page.clock.install({ time: T0 });
  await signIn(page, key);
  await page.goto(path);
  await expect(inquiryButton(page)).toBeVisible();
  await resetMock(page);
  await exposeQueryClient(page);
  await watchPushes(page);
}

/** `window.next.router`의 push, replace 호출 주소를 센다(호출만 기록하고 그대로 넘긴다) */
export async function watchPushes(page: Page): Promise<void> {
  await expect
    .poll(() =>
      page.evaluate(() => {
        const w = window as unknown as {
          next?: { router?: NextRouter };
          __pushes?: RouterSpy;
        };
        const router = w.next?.router;
        if (router === undefined) return false;
        if (w.__pushes !== undefined) return true;
        const spy: RouterSpy = { calls: [] };
        w.__pushes = spy;
        const push = router.push.bind(router);
        const replace = router.replace.bind(router);
        router.push = (href, options) => {
          spy.calls.push(`push ${href}`);
          push(href, options);
        };
        router.replace = (href, options) => {
          spy.calls.push(`replace ${href}`);
          replace(href, options);
        };
        return true;
      }),
    )
    .toBe(true);
}

/** 기록된 router 호출(`push /chats/1?from=…`) */
export function pushes(page: Page): Promise<string[]> {
  return page.evaluate(
    () => (window as unknown as { __pushes?: RouterSpy }).__pushes?.calls ?? [],
  );
}

/** 방이나 승인 화면으로 가는 router 호출만 */
export async function entryPushes(page: Page): Promise<string[]> {
  return (await pushes(page)).filter((c) =>
    /^push (\/chats\/\d+|\/approval)/.test(c),
  );
}

/** 클라이언트 이동(목 상태, 셸, 시계가 산다) */
export async function routerGo(
  page: Page,
  path: string,
  how: "push" | "replace" = "push",
): Promise<void> {
  await page.evaluate(
    ({ p, how }) => {
      (window as unknown as { next: { router: NextRouter } }).next.router[how](
        p,
      );
    },
    { p: path, how },
  );
  await expect(page).toHaveURL(path);
}

/** 헤더 장바구니 링크(뱃지 숫자가 이름에 붙는다) */
export function cartLink(page: Page): Locator {
  return page.getByRole("link", { name: /^장바구니/ });
}

export function openingButton(page: Page): Locator {
  return page.getByRole("button", { name: "여는 중", exact: true });
}

/** 누르고 `여는 중`으로 잠긴 것까지 */
export async function pressInquiry(page: Page): Promise<void> {
  await inquiryButton(page).click();
  await expect(openingButton(page)).toBeDisabled();
}

/**
 * 시계를 `LATE`만큼 밀어 늦은 응답을 보내고, 그 응답을 입구가 처리할 때까지(마지막 방 만들기 뮤테이션이 pending이 아님).
 * 그 뒤 AC의 "응답 도착 2초 뒤"만큼 더 민다. 마지막 POST의 상태를 돌려준다
 */
export async function deliverLate(page: Page): Promise<number> {
  await page.clock.runFor(LATE);
  await expect
    .poll(() =>
      page.evaluate(() => {
        const client = (
          window as unknown as {
            __ondoQueryClient: {
              getMutationCache: () => {
                getAll: () => { state: { status: string } }[];
              };
            };
          }
        ).__ondoQueryClient;
        return client.getMutationCache().getAll().at(-1)?.state.status;
      }),
    )
    .toMatch(/^(success|error)$/);
  const status = (await requests(page, CREATE_POST)).at(-1)?.status ?? null;
  await page.clock.runFor(2_000);
  return status ?? 0;
}

/** 방 만들기 POST 수 */
export async function createCount(page: Page): Promise<number> {
  return (await requests(page, CREATE_POST)).length;
}
