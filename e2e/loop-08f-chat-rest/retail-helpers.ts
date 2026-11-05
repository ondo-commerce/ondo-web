import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  STUB_ORIGIN,
  type StubBackorderState,
} from "../side-02/retail/stub-api";
import {
  ASK_RECEIVABLE,
  ASK_WHEN,
  chatMock,
  log,
  orderCards,
  orderChoice,
  orderGroups,
  receivableCard,
  say,
  waitLinesAfter,
  messageBySequence,
} from "../loop-07-receivable-reply/helpers";

export * from "../loop-07-receivable-reply/helpers";

/**
 * loop-08f S4 소매 미송 링크와 정산 링크(#374). `pnpm e2e:stub`(`playwright.stub.config.ts`)으로 돈다.
 * 07 미수 helpers(시계 T0 = 2026-10-29 14:20, 방 열기, 미송 되묻기와 카드 locator) 위에 링크, 도착 화면, stub 미송
 * 상태, document 요청 셈을 더한다.
 *
 * 저장소가 둘이다(기획 §4-1 5 9): 채팅 답(미송 되묻기, 카드)은 브라우저 MSW, 도착한 `/backorders` 표는 Server
 * Component가 읽는 HTTP stub(3199). 그래서 미송 표는 쿠키 `stub_backorders`로 고른다(`stubBackorders`).
 * 이름은 `helpers.ts`가 아니다 — 같은 폴더의 도매 계약 helpers(#371)와 섞이지 않게.
 */

export const BACKORDER_LINK = "미송 대기 현황 보기";
export const SETTLEMENT_LINK = "정산 화면에서 보기";
export const LOST_TEXT = "로그인이 끊겼어요";

/** 이 시험만의 stub 미송 범위 키. 반복(`--repeat-each`)과 재시도가 다른 worker에서 같이 돌아도 겹치지 않게 둘 다 붙인다 */
function backorderScope(): string {
  const info = test.info();
  return `${info.testId}-${info.repeatEachIndex}-${info.retry}`;
}

/**
 * 이 시험의 stub 미송 표를 그 상태로. 공유 표 reset(`POST /__stub/reset {backorders}`)을 쓰지 않는다 — `--workers=2`에서
 * 다른 worker의 reset(side-02, 05b `useOwnCart`)이 설정과 도착 조회 사이에 끼면 행이 바뀌었다(08f M2).
 * 범위 표를 만들고 쿠키 `stub_backorders`로 고른다. Next 서버는 들어온 쿠키 전체를 stub으로 넘긴다(`serverApi()`)
 */
export async function stubBackorders(
  page: Page,
  state: StubBackorderState,
): Promise<void> {
  const scope = backorderScope();
  const url = test.info().project.use.baseURL ?? "http://localhost:3101";
  const res = await page.request.post(
    `${STUB_ORIGIN}/__stub/reset?backorders=${encodeURIComponent(scope)}`,
    { data: { backorders: state } },
  );
  expect(res.status(), `stub 미송 범위 ${state}`).toBe(200);
  await page
    .context()
    .addCookies([{ name: "stub_backorders", value: scope, url }]);
}

/** 말풍선 안 미송 대기 현황 링크 */
export function backorderLink(scope: Locator): Locator {
  return scope.getByRole("link", { name: BACKORDER_LINK, exact: true });
}

/** 미수 카드 안 정산 링크 */
export function settlementLinkIn(scope: Locator): Locator {
  return scope.getByRole("link", { name: SETTLEMENT_LINK, exact: true });
}

/** 미송 되묻기 말풍선(주문 고르기 group이 든 CLARIFY). 여럿이면 화면 순서 */
export function backorderClarifies(page: Page): Locator {
  return log(page)
    .locator('[data-kind="CLARIFY"]')
    .filter({
      has: page.getByRole("group", { name: "주문 고르기", exact: true }),
    });
}

/**
 * 미송 카드가 든 자동 답 말풍선. `has`는 바깥 말풍선 안에서 찾으므로 log부터 시작하는 `orderCards`를 넣으면 안 된다
 * (말풍선 안에 log가 없어 0개가 된다)
 */
export function backorderReply(page: Page, backorderId: number): Locator {
  return log(page)
    .locator('[data-kind="AUTO_REPLY"]')
    .filter({
      has: page.locator(
        `div[data-ac="S3-3"][data-backorder-id="${backorderId}"]`,
      ),
    });
}

/** 미송 질문 → 되묻기. 그 되묻기 말풍선을 돌려준다 */
export async function askBackorder(page: Page): Promise<Locator> {
  const before = await orderGroups(page).count();
  await say(page, ASK_WHEN);
  await expect(orderGroups(page)).toHaveCount(before + 1);
  return backorderClarifies(page).nth(before);
}

/** 되묻기에서 그 미송을 골라 카드까지. 카드 말풍선을 돌려준다 */
export async function pickBackorder(
  page: Page,
  clarify: Locator,
  backorderId: number,
): Promise<Locator> {
  await orderChoice(clarify, backorderId).click();
  await expect(orderCards(page, backorderId)).toHaveCount(1);
  return backorderReply(page, backorderId);
}

/** 미수 질문 → 미수 카드 말풍선 */
export async function askReceivable(page: Page): Promise<Locator> {
  await say(page, ASK_RECEIVABLE);
  const after = await waitLinesAfter(page, ASK_RECEIVABLE, 1);
  const bubble = messageBySequence(page, after[0]?.sequence ?? -1);
  await expect(receivableCard(bubble)).toBeVisible();
  return bubble;
}

/** 보내기 401로 방 세션을 끊는다(08e S2-7과 같은 손잡이). 끊김 안내가 뜰 때까지 */
export async function loseSession(page: Page): Promise<void> {
  await chatMock(page, "fail", { op: "send", status: 401 });
  await say(page, "끊기 전 마지막 글");
  await expect(
    page.getByRole("alert").filter({ hasText: LOST_TEXT }),
  ).toBeVisible();
}

/**
 * 메인 프레임 document 요청(전체 이동) 셈. 클라이언트 이동(`Link`)은 RSC fetch라 여기 안 잡힌다.
 * `page.goto` 뒤에 붙여야 시작 문서를 세지 않는다
 */
export function countDocuments(page: Page): { readonly count: number } {
  const counter = { count: 0 };
  page.on("request", (req) => {
    if (
      req.isNavigationRequest() &&
      req.resourceType() === "document" &&
      req.frame() === page.mainFrame()
    )
      counter.count += 1;
  });
  return counter;
}

/** `/backorders`의 켜진 도매처 칩(`aria-current="true"`) */
export function activeChip(page: Page): Locator {
  return page.locator('a[aria-current="true"]');
}

/** `/backorders` 표 줄(넓은 폭) */
export function backorderRows(page: Page): Locator {
  return page.locator("table").first().locator("tbody tr");
}

/** 떨어짐 안내(`?wholesaler=`가 받은 장에 없어 `전체`로) */
export const DROPPED_TEXT =
  "그 도매처의 미송은 지금 없어요. 전체 목록을 보여드릴게요.";
