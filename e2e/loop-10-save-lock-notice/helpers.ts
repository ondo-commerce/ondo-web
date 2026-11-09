import { expect, type Locator, type Page } from "@playwright/test";
import { signIn } from "../loop-08b-chat-filter-history/helpers";

/**
 * loop-10-save-lock-notice (#404) 공통 — 상품 저장 401 잠금.
 *
 * 두 탭 도구는 loop-09 `wholesale-reauth.spec.ts` 안 지역 함수를 그대로 옮겼다(그 spec은 안 건드린다).
 * `addInitScript` 도구는 전부 그 탭의 첫 `goto` 전에 설치한다 — 이미 열린 문서엔 안 깔린다.
 *
 * 설치 순서: `installGetFault` → `watchRequests` → `installFetchGate`. 나중에 설치한 쪽이 바깥이다.
 * 고장은 가장 안쪽이라 기록(`watchRequests`)이 고장 낸 GET도 401로 남긴다. 문은 가장 바깥이라
 * 문이 열린 뒤에야 기록이 생긴다(loop-09 helpers 주석과 같다).
 */

export const ME = "e2e@ondo.test";
/** 앱 `SESSION_LOST_MESSAGE` */
export const SESSION_LOST =
  "로그인이 끊겼어요. 다시 로그인하기 전엔 저장할 수 없어요.";
/** 앱 `SESSION_LOST_PARTIAL_MESSAGE`(§7 Q1 둘째 줄) */
export const SESSION_LOST_PARTIAL =
  "로그인이 끊겨 판매 상태 변경은 확인하지 못했어요. 상품 정보는 저장됐어요. 다시 로그인하기 전엔 저장할 수 없어요.";
/** 앱 `SAVE_AUTH_LATE_MESSAGE`(§7 Q1 셋째 줄) */
export const SAVE_AUTH_LATE =
  "로그인이 바뀌어 저장 결과를 확인하지 못했어요. 다시 저장해 주세요.";
/** 앱 `SAVE_AUTH_LATE_PARTIAL_MESSAGE`(§7 Q1 넷째 줄) */
export const SAVE_AUTH_LATE_PARTIAL =
  "로그인이 바뀌어 판매 상태 변경은 확인하지 못했어요. 상품 정보는 저장됐어요. 다시 저장해 주세요.";
export const RESTORED = "다시 로그인했어요. 이어서 저장할 수 있어요.";
/** 목 `fail(401, …)` 문구. 화면에 나오면 안 된다 */
export const SERVER_401_TEXT = "로그인이 필요합니다.";
export const HOOK = "[auth401]";
/** 앱 `SESSION_CHANNEL_NAME`(features/account/constants.ts) */
const SESSION_CHANNEL = "ondo.wholesale.session";

export function nameInput(page: Page): Locator {
  return page.getByLabel("품명", { exact: true });
}

/** 하단 바 한 줄(잠금, `_form` 모두 같은 `p[role=alert]` 자리) */
export function formLine(page: Page): Locator {
  return page.locator('p[role="alert"]');
}

export function restoredStatus(page: Page): Locator {
  return page.getByRole("status").filter({ hasText: RESTORED });
}

export function reloginLink(page: Page): Locator {
  return page.getByRole("link", { name: "새 탭에서 로그인" });
}

async function openSecondTab(page: Page): Promise<Page> {
  const tab = await page.context().newPage();
  await tab.goto("/login");
  return tab;
}

/** 탭 2에서 같은 계정 로그인 → 탭 1로 돌아온다 */
export async function reloginInSecondTab(page: Page): Promise<void> {
  const tab = await openSecondTab(page);
  await signIn(tab, ME);
  await page.bringToFront();
}

/**
 * 탭 1이 세션 방송을 받았는지 보는 귀(loop-09 09-R5). 앱이 뜬 **뒤에** 같은 이름 채널을 하나 더 연다.
 * 같은 창의 채널들은 만든 순서대로 메시지를 받으므로, 이 귀가 들었으면 앱 쪽 처리는 이미 끝났다.
 */
export async function listenSessionBroadcast(page: Page): Promise<void> {
  await page.evaluate((name) => {
    const heard = { count: 0 };
    (window as unknown as { __sessionHeard: typeof heard }).__sessionHeard =
      heard;
    new BroadcastChannel(name).onmessage = () => {
      heard.count += 1;
    };
  }, SESSION_CHANNEL);
}

export async function waitSessionBroadcast(
  page: Page,
  count = 1,
): Promise<void> {
  await page.waitForFunction(
    (n) =>
      (window as unknown as { __sessionHeard: { count: number } })
        .__sessionHeard.count >= n,
    count,
  );
}

interface GetFault {
  source: string | null;
  /** 이 화면(pathname)에 있을 때만 건다. null이면 어느 화면이든. 이동 뒤 다음 화면의 GET은 안 막는다 */
  page: string | null;
  hits: number;
}

/**
 * 저장 도중 상세 GET이 401을 받는 길(§5-5 2). 목은 GET에 401을 주지 않아 페이지 `fetch`를 감싼다.
 * 켜져 있는 동안 맞는 경로의 GET에 목과 같은 401 봉투를 돌려주고 횟수를 센다. 옛 구조(저장 중
 * 상세 다시 받기)라면 여기 걸려 QueryCache 전역 이동으로 `/login`에 간다.
 */
export async function installGetFault(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const fault: GetFault = { source: null, page: null, hits: 0 };
    (window as unknown as { __getFault: GetFault }).__getFault = fault;
    const original = window.fetch.bind(window);
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input.url;
      const method = (init?.method ?? "GET").toUpperCase();
      if (
        fault.source !== null &&
        method === "GET" &&
        new RegExp(fault.source).test(url) &&
        (fault.page === null ||
          new RegExp(fault.page).test(window.location.pathname))
      ) {
        fault.hits += 1;
        return new Response(
          JSON.stringify({
            code: "UNAUTHENTICATED",
            message: "로그인이 필요합니다.",
            errors: [],
            traceId: "e2e",
          }),
          { status: 401, headers: { "content-type": "application/json" } },
        );
      }
      return original(input, init);
    };
  });
}

export async function armGetFault(
  page: Page,
  path: RegExp,
  onPage?: RegExp,
): Promise<void> {
  await page.evaluate(
    ([source, at]) => {
      const fault = (window as unknown as { __getFault: GetFault }).__getFault;
      fault.source = source;
      fault.page = at;
    },
    [path.source, onPage?.source ?? null] as const,
  );
}

export async function disarmGetFault(page: Page): Promise<void> {
  await page.evaluate(() => {
    (window as unknown as { __getFault: GetFault }).__getFault.source = null;
  });
}

export function getFaultHits(page: Page): Promise<number> {
  return page.evaluate(
    () => (window as unknown as { __getFault: GetFault }).__getFault.hits,
  );
}

/** 목에서 지금 상세(브라우저 목 상태라 `page.request`로는 못 읽는다) */
export interface ServerDetail {
  name: string;
  listing: { title: string; status: string };
  colorOptions: { variants: { id: number; salePrice: number }[] }[];
}

export function serverDetail(
  page: Page,
  productId: number,
): Promise<ServerDetail> {
  return page.evaluate(async (id) => {
    const r = await fetch(`/api/wholesale/products/${id}`);
    const body = (await r.json()) as { data: ServerDetail };
    return body.data;
  }, productId);
}

/** 잠금 셋(저장, `+`, 실패 칸 `다시 시도`)이 같이 잠겼나/풀렸나 */
export async function expectEntrances(
  entrances: Locator[],
  enabled: boolean,
): Promise<void> {
  for (const entrance of entrances) {
    if (enabled) await expect(entrance).toBeEnabled();
    else await expect(entrance).toBeDisabled();
  }
}
