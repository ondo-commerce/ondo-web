import { expect, test, type Page } from "@playwright/test";
import {
  assertStubServers,
  bubbles,
  chatMock,
  chatNav,
  composer,
  count,
  log,
  MESSAGES_GET,
  requests,
  roomList,
  roomRow,
  say,
  SEND_POST,
  start,
} from "../loop-08-chat-polish/retail-helpers";
import { routeAuth } from "../loop-06b-retail-notify/helpers";
import { RETAILERS, type RetailerKey } from "../side-02/retail/stub-api";

/**
 * loop-08c S7(#342) — 소매 로그아웃 뒤 채팅 캐시와 늦은 401. `pnpm e2e:stub`으로 돈다(`playwright.stub.config.ts`).
 *
 * 공용 단말 장면: A(쿠키 bombom, 목 "나" 1)가 `/chats`와 방 1을 연 뒤 로그아웃 → B(miso, 목 "나" 2)가 로그인.
 * 로그인, 로그아웃은 가짜 API에 없어 브라우저 요청을 가로챈다(`routeAuth`). 전부 클라이언트 이동이라 QueryClient와
 * MSW 저장소가 산다 — 그래야 앞 계정 캐시가 남는지 볼 수 있다. A 방 주소로 가는 것도 `next.router.push`(클라이언트 이동)다.
 *
 * "한 프레임이라도"는 DOM 변경 기록으로 잰다(`recordDom`). B 로그인 버튼을 누른 순간부터 붙은 노드의 방 번호와 글을 쌓는다.
 * 소매처 1의 방은 1(무드온), 33(라온), 소매처 2의 방은 2(무드온)다 — 이름 "무드온"이 겹쳐 방 번호로 가른다.
 */

assertStubServers();

const A_ROOMS = [1, 33];
const B_ROOM = 2;
/** 방 1 시드의 소매 첫 글(A 말풍선 표지)과 방 2 시드의 소매 글(B 말풍선 표지) */
const A_BODY = "안녕하세요, 플라워 셔츠 문의드려요";
const B_BODY = "제 미수 얼마예요?";

interface DomLog {
  phase: "A" | "B";
  rooms: number[];
  texts: string[];
}

/** `page.goto` 전에. 붙은 노드의 `data-room-id`와 글을 단계(A/B)별로 쌓는다 */
async function recordDom(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const record: DomLog = { phase: "A", rooms: [], texts: [] };
    const store = { A: record, B: { phase: "B", rooms: [], texts: [] } };
    (window as unknown as { __dom: typeof store }).__dom = store;
    (window as unknown as { __phase: "A" | "B" }).__phase = "A";
    const take = (node: Node) => {
      const phase = (window as unknown as { __phase: "A" | "B" }).__phase;
      const into = store[phase] as DomLog;
      if (node.nodeType === Node.TEXT_NODE) {
        if (node.textContent) into.texts.push(node.textContent);
        return;
      }
      if (!(node instanceof Element)) return;
      const ids = [
        ...(node.matches("[data-room-id]") ? [node] : []),
        ...node.querySelectorAll("[data-room-id]"),
      ].map((el) => Number((el as HTMLElement).dataset.roomId));
      into.rooms.push(...ids);
      if (node.textContent) into.texts.push(node.textContent);
    };
    const observe = () =>
      new MutationObserver((records) => {
        for (const r of records) {
          if (r.type === "characterData") take(r.target);
          r.addedNodes.forEach(take);
        }
      }).observe(document.documentElement, {
        childList: true,
        subtree: true,
        characterData: true,
      });
    if (document.documentElement) observe();
    else document.addEventListener("DOMContentLoaded", observe);
  });
}

async function domLog(page: Page, phase: "A" | "B"): Promise<DomLog> {
  return page.evaluate(
    (p) => (window as unknown as { __dom: Record<string, DomLog> }).__dom[p]!,
    phase,
  );
}

/** B 단계에 A의 방 번호, A 말풍선 글이 한 번도 안 붙었다 */
async function expectNoATrace(page: Page): Promise<void> {
  const b = await domLog(page, "B");
  expect(
    b.rooms.filter((id) => A_ROOMS.includes(id)),
    "B 단계에 붙은 A 방 행",
  ).toEqual([]);
  expect(
    b.texts.filter((t) => t.includes(A_BODY)),
    "B 단계에 붙은 A 말풍선",
  ).toEqual([]);
}

/** A로 `/chats` → 방 1. 말풍선까지 */
async function openARoom(page: Page): Promise<void> {
  await recordDom(page);
  await routeAuth(page);
  await start(page, "/");
  await chatNav(page).click();
  await expect(page).toHaveURL("/chats");
  for (const id of A_ROOMS) await expect(roomRow(page, id)).toBeVisible();
  await roomRow(page, 1).click();
  await expect(page).toHaveURL("/chats/1?from=/chats");
  await expect(log(page).getByText(A_BODY)).toBeVisible();
}

/** 계정 메뉴 → 로그아웃 → `/login` */
async function logout(page: Page): Promise<void> {
  await page.getByRole("button", { name: /계정 메뉴$/ }).click();
  await page.getByRole("button", { name: "로그아웃", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
}

/** 목의 "나"를 B로 바꾸고 B로 로그인 → 홈. 로그인 버튼을 누르는 순간부터 B 단계 기록 */
async function loginAs(page: Page, key: RetailerKey): Promise<void> {
  await chatMock(page, "me", { retailerId: RETAILERS[key].retailerId });
  await page.getByLabel("이메일").fill(RETAILERS[key].email);
  await page.getByLabel("비밀번호").fill("ondo1234!");
  await page.evaluate(() => {
    (window as unknown as { __phase: string }).__phase = "B";
  });
  await page.getByRole("button", { name: "로그인", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(chatNav(page)).toBeVisible();
}

/** 클라이언트 이동(목과 캐시가 산다). `page.goto`는 둘 다 시드로 돌린다 */
async function clientGo(page: Page, path: string): Promise<void> {
  await page.evaluate((p) => {
    (
      window as unknown as { next: { router: { push: (p: string) => void } } }
    ).next.router.push(p);
  }, path);
  await expect(page).toHaveURL(path);
}

/** 지금 응답을 기다리는 messages 요청이 하나 생길 때까지(polling 한 회차가 걸린 지연에 물렸다) */
async function waitInFlightMessages(page: Page): Promise<void> {
  await expect
    .poll(
      async () =>
        (await requests(page, MESSAGES_GET)).some((r) => r.status === null),
      { timeout: 8_000 },
    )
    .toBe(true);
}

async function expectBRoomOnly(page: Page): Promise<void> {
  await roomRow(page, B_ROOM).click();
  await expect(page).toHaveURL(`/chats/${B_ROOM}?from=/chats`);
  await expect(log(page).getByText(B_BODY)).toBeVisible();
  await expect(bubbles(page).filter({ hasText: A_BODY })).toHaveCount(0);
}

test("S7-1 A /chats, 방 1 → 로그아웃 → B 로그인 → /chats: A 방 행 기록 0, B 행만. A 방 주소 → 없는 방, A 말풍선 기록 0", async ({
  page,
}) => {
  await openARoom(page);
  await logout(page);
  await loginAs(page, "miso");

  await chatNav(page).click();
  await expect(page).toHaveURL("/chats");
  await expect(roomRow(page, B_ROOM)).toBeVisible();
  await expect(roomList(page).locator("a[data-room-id]")).toHaveCount(1);
  await test.step("목록 — A 방 행이 한 번도 안 붙었다", () =>
    expectNoATrace(page));

  await clientGo(page, "/chats/1");
  await expect(page.getByText("대화를 찾을 수 없어요")).toBeVisible();
  await expect(bubbles(page)).toHaveCount(0);

  await expectNoATrace(page);
});

test("S7-2 A 방 polling이 3초 늦는 중 로그아웃 → B 로그인 → 4초 뒤에도 A 메시지 0, B 방은 B 메시지만", async ({
  page,
}) => {
  await openARoom(page);
  await chatMock(page, "delay", { op: "messages", ms: 3_000 });
  await waitInFlightMessages(page);
  await logout(page);
  await loginAs(page, "miso");

  /* 늦은 A 응답이 도착할 시간을 넘긴다(지연 3초 + 여유 1초) */
  await page.waitForTimeout(4_000);
  expect(
    (await requests(page, MESSAGES_GET)).every((r) => r.status !== null),
    "늦은 A 응답까지 다 왔다",
  ).toBe(true);

  await chatNav(page).click();
  await expect(page).toHaveURL("/chats");
  await expectBRoomOnly(page);

  /* 늦은 A 응답이 캐시에 남았으면 A 방 주소가 그 말풍선을 먼저 그린다 */
  await clientGo(page, "/chats/1");
  await expect(page.getByText("대화를 찾을 수 없어요")).toBeVisible();
  await expectNoATrace(page);
});

test("S7-3 A 방 늦은 401(지연 3초) → 로그아웃 → B 로그인, B 방: 4초 뒤 쓰기 가능, 보내기 201, polling 계속", async ({
  page,
}) => {
  await openARoom(page);
  await chatMock(page, "fail", { op: "messages", status: 401 });
  await chatMock(page, "delay", { op: "messages", ms: 3_000 });
  await waitInFlightMessages(page);
  await logout(page);
  await loginAs(page, "miso");

  await chatNav(page).click();
  await expect(page).toHaveURL("/chats");
  await roomRow(page, B_ROOM).click();
  await expect(page).toHaveURL(`/chats/${B_ROOM}?from=/chats`);

  /* 늦은 401이 도착한 뒤(요청 기록에 401) 4초 */
  await expect
    .poll(async () =>
      (await requests(page, MESSAGES_GET)).some((r) => r.status === 401),
    )
    .toBe(true);
  await page.waitForTimeout(4_000);

  await expect(composer(page)).toBeVisible();
  await expect(composer(page)).not.toHaveAttribute("readonly", "");
  const polled = await count(page, MESSAGES_GET);
  await say(page, "B가 보내는 글");
  await expect
    .poll(async () =>
      (await requests(page, SEND_POST)).map((r) => r.status).at(-1),
    )
    .toBe(201);
  await expect
    .poll(() => count(page, MESSAGES_GET), { timeout: 8_000 })
    .toBeGreaterThan(polled);
});

test("S7-3 대조: B 세션에서 바로 401 → 잠금, 쓴 글 남음, 그 뒤 messages 요청 0", async ({
  page,
}) => {
  await recordDom(page);
  await routeAuth(page);
  await start(page, "/");
  await chatMock(page, "me", { retailerId: RETAILERS.miso.retailerId });
  await chatNav(page).click();
  await expect(page).toHaveURL("/chats");
  await roomRow(page, B_ROOM).click();
  await expect(log(page).getByText(B_BODY)).toBeVisible();

  await composer(page).fill("쓰던 글");
  await chatMock(page, "fail", { op: "messages", status: 401 });
  await expect(composer(page)).toHaveAttribute("readonly", "", {
    timeout: 8_000,
  });
  await expect(composer(page)).toHaveValue("쓰던 글");
  const after = await count(page, MESSAGES_GET);
  await page.waitForTimeout(4_000);
  expect(await count(page, MESSAGES_GET), "잠긴 뒤 messages 요청").toBe(after);
});
