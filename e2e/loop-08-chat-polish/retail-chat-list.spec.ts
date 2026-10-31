import { expect, test } from "@playwright/test";
import {
  appAlert,
  assertStubServers,
  chatMock,
  count,
  countLoginNavigations,
  expectRows,
  FIRST_PAGE_GET,
  flushRows,
  flushUntil,
  incoming,
  listRows,
  moreBox,
  moreButton,
  NEXT_PAGE_GET,
  openList,
  pauseOnList,
  rowIds,
  runToTick,
  setVisibility,
  settled,
  waitCount,
} from "./retail-helpers";

/**
 * #307 S4-3 ~ S4-7 — 소매 `/chats` 15초 갱신과 `더 보기`. 와이어프레임 `18_retail-chat` `#state-list-more`
 * `#state-list-refresh`(data-loop="08"). 목 `reset {rooms: 35}` = 시드 방 1, 33 + 가짜 방 33개(도매처 1001~),
 * 정렬 lastActivityAt desc라 첫 장 30 + 둘째 장 5.
 *
 * 간격과 겹침은 시계를 멈추고 `runFor`로만 민다. 고정 대기는 없다. 숫자는 AC 손 계산 값이다(30, 35, 34, 0, 1).
 */

assertStubServers();

test("S4-3 /chats 15초마다 첫 장 1회, 숨김 60초 동안 0회, 보이면 즉시 1회", async ({
  page,
}) => {
  await openList(page, 2);
  await pauseOnList(page);

  /* 주기는 화면이 열린 때부터 요청과 따로 돈다(M1) — 회차 하나(T)를 잡고 거기서 잰다 */
  const n1 = await runToTick(page);
  await settled(page, FIRST_PAGE_GET);
  await page.clock.runFor(14_000);
  expect(await count(page, FIRST_PAGE_GET), "다음 15초 전엔 0회").toBe(n1);
  await page.clock.runFor(1_500);
  await waitCount(page, FIRST_PAGE_GET, n1 + 1);
  await settled(page, FIRST_PAGE_GET);

  await setVisibility(page, "hidden");
  await page.clock.runFor(60_000);
  expect(await count(page, FIRST_PAGE_GET), "숨김 60초 동안 0회").toBe(n1 + 1);

  await setVisibility(page, "visible");
  await waitCount(page, FIRST_PAGE_GET, n1 + 2);
  /* 갱신은 화면에 표시하지 않는다(결정 63) — 알림 줄, 스피너 0 */
  await expect(appAlert(page)).toHaveCount(0);
  await expect(page.locator('[role="status"]')).toHaveCount(0);
});

test("S4-4 rooms 35 → 30행 + 더 보기 → 35행, 끝이면 버튼 없음, '최근 대화 30개만' 0. 같은 task 3연타 → 요청 1회, 응답 전 disabled '불러오는 중'", async ({
  page,
}) => {
  await openList(page, 35);
  await expectRows(page, 30);
  await expect(moreButton(page)).toHaveText("더 보기");
  await expect(moreButton(page)).toBeEnabled();
  await expect(page.getByText(/최근 대화 \d+개만/)).toHaveCount(0);

  await pauseOnList(page);
  await chatMock(page, "delay", { op: "rooms", ms: 2_000 });
  const next0 = await count(page, NEXT_PAGE_GET);
  /* 렌더 전이라 disabled가 아직 안 걸린 세 번(같은 task) */
  await moreButton(page).evaluate((b) => {
    (b as HTMLButtonElement).click();
    (b as HTMLButtonElement).click();
    (b as HTMLButtonElement).click();
  });
  await flushUntil(page, async () => moreButton(page).isDisabled());
  await expect(moreButton(page)).toHaveText("불러오는 중");
  await expect(moreButton(page)).toHaveAttribute("aria-busy", "true");
  expect(await count(page, NEXT_PAGE_GET), "3연타 → 다음 장 요청 1회").toBe(
    next0 + 1,
  );

  await page.clock.runFor(2_000);
  await flushRows(page, 35);
  await expectRows(page, 35);
  expect(await count(page, NEXT_PAGE_GET)).toBe(next0 + 1);
  await expect(moreBox(page), "끝 — 버튼 없음, 끝 글자도 없음").toHaveCount(0);
});

test("S4-5 경쟁 ① 더 보기가 도는 중 15초 경과 → 그 갱신 요청 0회, 끝나고 35행 중복 0", async ({
  page,
}) => {
  await openList(page, 35);
  const first0 = await pauseOnList(page);
  /* 다음 장을 20초 늦춰 화면을 연 뒤 첫 15초 회차가 반드시 더 보기 중에 오게 한다 */
  await chatMock(page, "delay", { op: "rooms", ms: 20_000 });
  await moreButton(page).click();
  await flushUntil(page, async () => moreButton(page).isDisabled());
  expect(await count(page, NEXT_PAGE_GET)).toBe(1);

  await page.clock.runFor(16_000);
  await expect(moreButton(page)).toHaveText("불러오는 중");
  expect(
    await count(page, FIRST_PAGE_GET),
    "더 보기 중 15초 — 갱신 요청 0회",
  ).toBe(first0);

  await page.clock.runFor(4_500);
  await flushRows(page, 35);
  await expectRows(page, 35);
  expect(await count(page, FIRST_PAGE_GET)).toBe(first0);
  expect(await count(page, NEXT_PAGE_GET)).toBe(1);
});

test("S4-5 경쟁 ③ 회차 T 뒤 13.5초에 더 보기(5초) → T+15 회차만 건너뛰고 다음은 T+30(끝난 뒤 15초인 T+33.5 아님)", async ({
  page,
}) => {
  await openList(page, 35);
  await pauseOnList(page);
  const first0 = await runToTick(page);
  await settled(page, FIRST_PAGE_GET);

  await page.clock.runFor(13_500);
  await chatMock(page, "delay", { op: "rooms", ms: 5_000 });
  await moreButton(page).click();
  await flushUntil(page, async () => moreButton(page).isDisabled());
  expect(await count(page, NEXT_PAGE_GET)).toBe(1);

  await page.clock.runFor(2_000);
  expect(
    await count(page, FIRST_PAGE_GET),
    "T+15 — 더 보기와 겹친 회차는 건너뛴다",
  ).toBe(first0);

  await page.clock.runFor(4_000);
  await flushRows(page, 35);
  await expectRows(page, 35);
  expect(await count(page, FIRST_PAGE_GET)).toBe(first0);

  await page.clock.runFor(9_000);
  expect(await count(page, FIRST_PAGE_GET), "T+30 전엔 0회").toBe(first0);
  await page.clock.runFor(1_500);
  await waitCount(page, FIRST_PAGE_GET, first0 + 1);
});

test("S4-5 경쟁 ② 갱신 응답을 늦춘 사이 더 보기 disabled(글자 그대로, 스피너 없음), 갱신 끝나면 눌러져 35행 중복 0", async ({
  page,
}) => {
  await openList(page, 35);
  const first0 = await pauseOnList(page);
  await chatMock(page, "delay", { op: "rooms", ms: 5_000 });

  await page.clock.runFor(16_000);
  await waitCount(page, FIRST_PAGE_GET, first0 + 1);
  await flushUntil(page, async () => moreButton(page).isDisabled());
  await expect(moreBox(page)).toHaveAttribute("data-more", "locked");
  await expect(moreButton(page)).toHaveText("더 보기");
  await expect(moreButton(page)).not.toHaveAttribute("aria-busy");
  await moreButton(page).evaluate((b) => (b as HTMLButtonElement).click());
  expect(await count(page, NEXT_PAGE_GET), "잠긴 동안 다음 장 0회").toBe(0);

  await page.clock.runFor(4_500);
  await settled(page, FIRST_PAGE_GET);
  await flushUntil(page, async () => moreButton(page).isEnabled());
  await moreButton(page).click();
  await flushRows(page, 35);
  await expectRows(page, 35);
  expect(await count(page, NEXT_PAGE_GET)).toBe(1);
});

test("S4-6 30행 받은 뒤 33번째 방 incoming → 더 보기 34행(33 없음) → 15초 갱신 → 35행, 33이 맨 위, 중복 0", async ({
  page,
}) => {
  await openList(page, 35);
  await pauseOnList(page);
  /* 가짜 방 번호는 시드 다음부터 이어진다. 셋째 행 = 첫 가짜 방, 33번째 = 그 + 30 */
  const ids = await rowIds(page);
  expect(ids.slice(0, 2)).toEqual([1, 33]);
  const target = (ids[2] ?? 0) + 30;
  expect(ids).not.toContain(target);

  await incoming(page, target, "내일 오전에 찾으러 갈게요");
  await moreButton(page).click();
  await flushRows(page, 34);
  await expectRows(page, 34);
  expect(
    await rowIds(page),
    "§4-4 3 한계 — 33번째 방은 아직 안 보인다",
  ).not.toContain(target);
  await expect(moreBox(page)).toHaveCount(0);

  await page.clock.runFor(16_000);
  await flushRows(page, 35);
  await expectRows(page, 35);
  expect((await rowIds(page))[0]).toBe(target);
  await expect(listRows(page).first()).toContainText(
    "내일 오전에 찾으러 갈게요",
  );
});

test("S4-7 더 보기 500 → 30행 그대로, 한 줄 오류와 다시 시도 → 35행", async ({
  page,
}) => {
  await openList(page, 35);
  await pauseOnList(page);
  await chatMock(page, "fail", { op: "rooms", status: 500 });
  await moreButton(page).click();
  await flushUntil(page, async () =>
    appAlert(page).filter({ hasText: "더 불러오지 못했어요" }).isVisible(),
  );
  await expectRows(page, 30);
  await expect(moreBox(page)).toHaveAttribute("data-more", "failed");
  await expect(moreButton(page)).toHaveText("다시 시도");
  expect(await count(page, NEXT_PAGE_GET), "앱 기본 재시도 없음").toBe(1);

  await moreButton(page).click();
  await flushRows(page, 35);
  await expectRows(page, 35);
  await expect(appAlert(page)).toHaveCount(0);
  expect(await count(page, NEXT_PAGE_GET)).toBe(2);
});

test("S4-7 갱신 401 → /login 이동 0, 목록 그대로, 머리 아래 한 줄 + 로그인하기, 더 보기 잠김, 갱신 멈춤", async ({
  page,
}) => {
  const loginNavs = countLoginNavigations(page);
  await openList(page, 35);
  const first0 = await pauseOnList(page);
  await chatMock(page, "fail", { op: "rooms", status: 401 });

  await page.clock.runFor(16_000);
  await waitCount(page, FIRST_PAGE_GET, first0 + 1);
  const note = appAlert(page).filter({
    hasText: "로그인이 끊겨 목록을 새로 받지 못했어요",
  });
  await flushUntil(page, () => note.isVisible());
  await expectRows(page, 30);
  const login = page.getByRole("link", { name: "로그인하기", exact: true });
  await expect(login).toHaveAttribute("href", "/login");
  await expect(moreBox(page)).toHaveAttribute("data-more", "locked");
  await expect(moreButton(page)).toBeDisabled();
  /* 머리(h1) 아래, 목록 위 */
  const [h1, noteBox, list] = await Promise.all([
    page.getByRole("heading", { level: 1, name: "채팅" }).boundingBox(),
    note.boundingBox(),
    listRows(page).first().boundingBox(),
  ]);
  expect(noteBox!.y).toBeGreaterThan(h1!.y + h1!.height - 1);
  expect(noteBox!.y + noteBox!.height).toBeLessThanOrEqual(list!.y);

  await page.clock.runFor(60_000);
  await setVisibility(page, "hidden");
  await setVisibility(page, "visible");
  await page.clock.runFor(100);
  expect(await count(page, FIRST_PAGE_GET), "끊긴 뒤 갱신 0회").toBe(
    first0 + 1,
  );
  expect(loginNavs()).toBe(0);
  await expect(page).toHaveURL("/chats");
});

test("S4-7 갱신 401 뒤 방에 갔다 목록으로 돌아와도 재조회 0, 한 줄 오류와 행 그대로(메타 리뷰 M2)", async ({
  page,
}) => {
  await openList(page, 35);
  const first0 = await pauseOnList(page);
  await chatMock(page, "fail", { op: "rooms", status: 401 });
  await page.clock.runFor(16_000);
  await waitCount(page, FIRST_PAGE_GET, first0 + 1);
  const note = appAlert(page).filter({
    hasText: "로그인이 끊겨 목록을 새로 받지 못했어요",
  });
  await flushUntil(page, () => note.isVisible());

  /* 화면 왕복은 흐르는 시계로. 목록 mount가 다시 받으면 여기서 첫 장 요청이 하나 는다 */
  await page.clock.resume();
  const ids = await rowIds(page);
  await listRows(page).first().click();
  await expect(page).toHaveURL(`/chats/${ids[0]}?from=/chats`);
  await page.getByRole("link", { name: "채팅 목록", exact: true }).click();
  await expect(page).toHaveURL("/chats");
  await expect(note).toBeVisible();
  await expectRows(page, 30);

  await pauseOnList(page);
  await page.clock.runFor(16_000);
  expect(
    await count(page, FIRST_PAGE_GET),
    "왕복 mount, 다음 15초 모두 0회",
  ).toBe(first0 + 1);
  await expect(moreBox(page)).toHaveAttribute("data-more", "locked");
});
