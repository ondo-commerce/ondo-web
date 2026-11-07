import { expect, type Locator, type Page } from "@playwright/test";
import { leaveDialog } from "../loop-01-upload/helpers";

/**
 * loop-09-form-back-guard (#255) 공통 — 상품 폼 뒤로가기 이탈 가드.
 *
 * `page.goBack()`이 돌아왔다고 가드가 판정을 끝낸 게 아니다(같은 문서 안 이동은 반환 시점이
 * popstate 처리와 무관하다, Codex r1-5). 그래서 뒤로가기 뒤에는 늘 URL, 모달, 입력값을 각각
 * `expect`로 기다린다. "한 번에"는 popstate 때의 pathname 기록으로 본다(`recordPopstates`).
 */

export function nameInput(page: Page): Locator {
  return page.getByLabel("품명", { exact: true });
}

/**
 * 수정 화면 게시글 가격표의 첫 판매가 칸("<색> <사이즈> 판매가"). 모달이 열리면 radix가 바깥을
 * `aria-hidden`으로 숨겨 role로 못 찾으므로 `includeHidden`이다.
 */
export function firstPriceInput(page: Page): Locator {
  return page
    .getByRole("textbox", { name: /^\S+ \S+ 판매가$/, includeHidden: true })
    .first();
}

/**
 * 첫 판매가 칸을 이름으로 고정한다. 저장 뒤엔 목이 행 순서를 바꿔(시드 1001에서 확인) "첫 칸"이
 * 다른 행이 된다 — 같은 칸을 따라가야 "저장한 새 값"을 본다.
 */
export async function pinnedPriceInput(page: Page): Promise<Locator> {
  const label = await firstPriceInput(page).getAttribute("aria-label");
  return page.getByRole("textbox", {
    name: label ?? "",
    exact: true,
    includeHidden: true,
  });
}

export function menuLink(page: Page, label: string): Locator {
  return page
    .getByRole("navigation", { name: "주 메뉴" })
    .getByRole("link", { name: label });
}

export function continueButton(page: Page): Locator {
  return leaveDialog(page).getByRole("button", { name: "계속 작성" });
}

export function leaveButton(page: Page): Locator {
  return leaveDialog(page).getByRole("button", { name: "나가기" });
}

/** 지금 URL의 `pathname + search` */
export function here(page: Page): string {
  const url = new URL(page.url());
  return url.pathname + url.search;
}

/** 목록에서 `상품 등록` 링크로 들어온다 — 이전 이력이 같은 문서의 목록이다(loop-03 꼴) */
export async function enterCreateFromList(page: Page): Promise<void> {
  await page.goto("/products");
  await page.getByRole("link", { name: "상품 등록" }).click();
  await page.waitForURL((url) => url.pathname === "/products/new");
  await expect(nameInput(page)).toBeVisible();
}

/**
 * 상세의 `상품 관리` 링크로 수정에 들어온다. loop-01 `openEdit`는 `page.goto`라 이전 이력이
 * 다른 문서다 — 뒤로가기 시험엔 같은 문서 이력이 있어야 한다.
 */
export async function enterEditFromDetail(
  page: Page,
  productId: number,
): Promise<void> {
  await page.goto(`/products?productId=${productId}`);
  await page.getByRole("link", { name: "상품 관리" }).click();
  await page.waitForURL(
    (url) => url.pathname === `/products/${productId}/edit`,
  );
  await expect(
    page.getByRole("heading", { name: "게시글 수정" }),
  ).toBeVisible();
  await expect(firstPriceInput(page)).toBeVisible();
}

export function historyLength(page: Page): Promise<number> {
  return page.evaluate(() => window.history.length);
}

/** 지금 history 항목의 세 필드. 보초면 셋 다 참이어야 한다(Next가 `__NA`와 트리를 복사) */
export function historyFields(
  page: Page,
): Promise<{ mark: boolean; na: boolean; tree: boolean }> {
  return page.evaluate(() => {
    const state = window.history.state as Record<string, unknown> | null;
    return {
      mark: state?.ondoLeaveGuard === true,
      na: state?.__NA === true,
      tree: state?.__PRIVATE_NEXTJS_INTERNALS_TREE !== undefined,
    };
  });
}

/** popstate가 올 때마다 그때의 pathname을 남긴다. 문서가 새로 뜨면 비워진다 */
export async function recordPopstates(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const paths: string[] = [];
    (window as unknown as { __pops: string[] }).__pops = paths;
    window.addEventListener("popstate", () => {
      paths.push(window.location.pathname);
    });
  });
}

export async function resetPopstates(page: Page): Promise<void> {
  await page.evaluate(() => {
    (window as unknown as { __pops: string[] }).__pops.length = 0;
  });
}

export function popstatePaths(page: Page): Promise<string[]> {
  return page.evaluate(() => [
    ...(window as unknown as { __pops: string[] }).__pops,
  ]);
}

interface FetchGate {
  source: string | null;
  method: string | null;
  wait: Promise<void>;
  open: () => void;
}

/**
 * 저장 요청을 붙잡아 두는 문(08b `installChatGate` 꼴). 목(MSW)이 답하는 요청은
 * `page.context().route`로 못 잡아서 페이지의 `fetch`를 감싼다. 원래 fetch를 부르기 **전에**
 * 기다리므로 문을 열면 목이 평소대로 답한다. `armFetchGate`로 켜고 `openFetchGate`로 연다 —
 * 같은 문서 안에서 켜고 끄므로 새로고침이 필요 없다. `watchRequests`보다 뒤에 불러야
 * 문이 바깥쪽이라 기록은 문이 열린 뒤에 생긴다.
 */
export async function installFetchGate(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const gate: FetchGate = {
      source: null,
      method: null,
      wait: Promise.resolve(),
      open: () => undefined,
    };
    (window as unknown as { __fetchGate: FetchGate }).__fetchGate = gate;
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
        gate.source !== null &&
        method === gate.method &&
        new RegExp(gate.source).test(url)
      )
        await gate.wait;
      return original(input, init);
    };
  });
}

export async function armFetchGate(
  page: Page,
  path: RegExp,
  method: string,
): Promise<void> {
  await page.evaluate(
    ([source, m]) => {
      const gate = (window as unknown as { __fetchGate: FetchGate })
        .__fetchGate;
      gate.source = source;
      gate.method = m;
      gate.wait = new Promise<void>((resolve) => {
        gate.open = resolve;
      });
    },
    [path.source, method] as const,
  );
}

export async function openFetchGate(page: Page): Promise<void> {
  await page.evaluate(() => {
    const gate = (window as unknown as { __fetchGate: FetchGate }).__fetchGate;
    gate.source = null;
    gate.open();
  });
}

/** 지금 탭의 세션 저장소 값. 새 페이지(첫 항목) 시험에 심는다 */
export function readSession(page: Page): Promise<string> {
  return page.evaluate(
    () => window.sessionStorage.getItem("ondo.wholesale.session") ?? "",
  );
}

/** 새 페이지가 문서를 열 때마다 세션이 비어 있으면 심는다 — 로그인 화면을 거치지 않게 */
export async function seedSession(page: Page, value: string): Promise<void> {
  await page.addInitScript((v) => {
    if (window.sessionStorage.getItem("ondo.wholesale.session") === null)
      window.sessionStorage.setItem("ondo.wholesale.session", v);
  }, value);
}

/**
 * 앞 이력이 정말 없는 새 탭. `context.newPage()`는 첫 `about:blank` 항목이 남아 `go(-2)`가
 * 거기로 간다(첫 실행에서 확인). `window.open`으로 연 창은 첫 이동이 빈 문서를 바꿔 끼워
 * 항목이 1개고, 세션 저장소도 여는 탭 것을 복사해 받는다.
 */
export async function openPopup(page: Page, path: string): Promise<Page> {
  const [popup] = await Promise.all([
    page.context().waitForEvent("page"),
    page.evaluate((p) => {
      window.open(p);
    }, path),
  ]);
  await popup.waitForLoadState();
  return popup;
}

/** 흐르는 페이지 시계. "이동 0"은 `page.clock.runFor(1000)` 뒤 URL로 본다(08h M5) */
export const T0 = new Date("2026-11-07T14:00:00+09:00");
