import { expect, test, type Page } from "@playwright/test";
import {
  appAlert,
  ASK_WHEN,
  assertStubServers,
  chatMock,
  chatNav,
  composer,
  COUNT_GET,
  count,
  countLoginNavigations,
  handoffLines,
  incoming,
  log,
  navBadge,
  navUnread,
  notListedChip,
  openRoomFromList,
  orderCards,
  orderChoice,
  orderGroups,
  cards,
  pauseClock,
  roomRow,
  runToNextCount,
  say,
  sendButton,
  start,
  waitCount,
} from "./helpers";

/**
 * QA loop-06 06a 소매 사장 시나리오(04-qa.md "사장 시나리오"). `pnpm e2e:stub`으로 돈다.
 * 스크린샷은 회차 폴더 `qa/`에 남긴다(worktree 밖 절대 경로라 없으면 건너뛴다).
 */

assertStubServers();

const SHOTS = "/Users/oh-chang-eun/onDo/.claude/harness/runs/loop-06-backorder-reply/qa";

async function shot(page: Page, name: string) {
  await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: false }).catch(() => undefined);
}

async function askInRoom(page: Page, text = ASK_WHEN) {
  await start(page, "/");
  await openRoomFromList(page);
  await say(page, text);
}

/** 방 안에서 받은 모든 /api/retail 응답 본문(누출 검사) */
function captureBodies(page: Page) {
  const bodies: { url: string; text: string }[] = [];
  page.on("response", async (r) => {
    if (!/\/api\/retail\//.test(r.url())) return;
    try {
      bodies.push({ url: r.url(), text: await r.text() });
    } catch {
      /* 본문 없는 응답 */
    }
  });
  return bodies;
}

function allKeys(value: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(value)) value.forEach((v) => allKeys(v, out));
  else if (value !== null && typeof value === "object")
    for (const [k, v] of Object.entries(value)) {
      out.add(k);
      allKeys(v, out);
    }
  return out;
}

test("(a) 장면 2 소매 절반 — 질문 → 보기 4 → 9003 → 남은 2장, 도매 입고 예정 11월 5일 (1470 + 390 스크린샷)", async ({
  page,
}) => {
  await askInRoom(page);
  const group = orderGroups(page).first();
  await expect(group.locator("button[data-backorder-id]")).toHaveCount(4);
  await shot(page, "a-1470-clarify");
  await orderChoice(group, 9003).click();
  const card = orderCards(page, 9003);
  await expect(card).toContainText("남은 미송 2장");
  await expect(card).toContainText("도매 입고 예정 11월 5일");
  await expect(
    log(page).locator('[data-kind="AUTO_REPLY"]').last(),
  ).toContainText("남은 미송 2장은 11월 5일 도매 입고 예정이에요(원단 수급 지연)");
  await shot(page, "a-1470-card");
});

test("(a-390) 390 장면 2: 보기 글자 30자 넘는 것 전부 잘림 0, 두 줄 접힘, 가로 스크롤 0", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await askInRoom(page);
  const group = orderGroups(page).first();
  await expect(group.locator("button[data-backorder-id]")).toHaveCount(4);
  const measured = await group.locator("button").evaluateAll((nodes) =>
    nodes.map((n) => {
      const label = n.querySelector("span.min-w-0")?.textContent ?? n.textContent ?? "";
      const lineHeight = parseFloat(getComputedStyle(n).lineHeight);
      const span = n.querySelector("span.min-w-0") as HTMLElement | null;
      return {
        label,
        len: label.length,
        clipped: n.scrollWidth > n.clientWidth,
        ellipsis: getComputedStyle(n).textOverflow === "ellipsis",
        lines: span ? Math.round(span.getBoundingClientRect().height / lineHeight) : 1,
        right: n.getBoundingClientRect().right,
      };
    }),
  );
  const long = measured.filter((m) => m.len > 30);
  expect(long.length, "30자 넘는 보기가 있다").toBeGreaterThan(0);
  for (const m of long) {
    expect(m.clipped, m.label).toBe(false);
    expect(m.ellipsis, m.label).toBe(false);
    expect(m.right, m.label).toBeLessThanOrEqual(390);
  }
  expect(long.some((m) => m.lines >= 2), "긴 보기는 두 줄로 접힌다").toBe(true);
  const page390 = await page.evaluate(() => ({
    x: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    search: (document.querySelector('header input[type="search"]') as HTMLElement | null)
      ?.getBoundingClientRect().width,
    searchForm: (document.querySelector('header form[role="search"], header form') as HTMLElement | null)
      ?.getBoundingClientRect().width,
    inputs: [...document.querySelectorAll("header input")].map((i) => ({
      type: (i as HTMLInputElement).type,
      name: (i as HTMLInputElement).name,
      w: i.getBoundingClientRect().width,
    })),
  }));
  expect(page390.x).toBe(0);
  test.info().annotations.push({ type: "measure", description: JSON.stringify({ measured, page390 }) });
  console.log("QA measure", JSON.stringify({ measured, page390 }));
  /* 검색칸 폭(결정 33)은 qa-retail-design-audit 가 본다(F2) */
  await orderChoice(group, 9003).click();
  await expect(orderCards(page, 9003)).toHaveCount(1);
  await shot(page, "a-390-card");
});

test("(b) 후보 1건인데 옵션 미확정('데님 팬츠 언제 와요?') → 보기 1개 + 다른 주문이에요, 즉답 0", async ({
  page,
}) => {
  await askInRoom(page, "데님 팬츠 언제 와요?");
  const group = orderGroups(page).first();
  await expect(group).toBeVisible();
  const ids = await group
    .locator("button[data-backorder-id]")
    .evaluateAll((ns) => ns.map((n) => Number((n as HTMLElement).dataset.backorderId)));
  expect(ids).toEqual([9002]);
  await expect(notListedChip(group)).toBeVisible();
  await expect(orderCards(page)).toHaveCount(0);
});

test("(c) '블랙 셔츠 미송 언제 와요?' — 셔츠 미송은 레드뿐 → 넘김, 보기 0, 카드 0", async ({
  page,
}) => {
  await askInRoom(page, "블랙 셔츠 미송 언제 와요?");
  await expect(handoffLines(page)).toHaveCount(1);
  await expect(orderGroups(page)).toHaveCount(0);
  await expect(orderCards(page)).toHaveCount(0);
});

for (const [id, sentence, stateLine] of [
  [9001, "등록된 입고 예정일 10월 26일이 지났어요", "등록 예정일 지남"],
  [9002, "아직 도매 입고일이 정해지지 않았어요", "입고일 미정"],
] as const) {
  test(`(e) ${id} 지남/미정 → 사실 문장 + 넘김 줄, 말풍선과 카드에 '지연' 0, 사유 줄 0`, async ({
    page,
  }) => {
    await askInRoom(page);
    await orderChoice(orderGroups(page).first(), id).click();
    const card = orderCards(page, id);
    await expect(card).toContainText(stateLine);
    const bubble = log(page).locator('[data-kind="AUTO_REPLY"]').last();
    await expect(bubble).toContainText(sentence);
    await expect(bubble).not.toContainText("지연");
    await expect(bubble).not.toContainText("공장 재입고 예정");
    await expect(handoffLines(page).last()).toHaveText(/사장님께 전달했어요/);
    await expect(handoffLines(page).last()).not.toContainText("지연");
  });
}

test("(f) 다른 주문이에요 → 넘김 줄, 그 뒤 주문 보기 전부 잠김, 카드 0", async ({ page }) => {
  await askInRoom(page);
  const group = orderGroups(page).first();
  await notListedChip(group).click();
  await expect(handoffLines(page)).toHaveCount(1);
  for (const id of [9001, 9002, 9006, 9003])
    await expect(orderChoice(group, id)).toBeDisabled();
  await expect(orderCards(page)).toHaveCount(0);
});

test("(g-1) 방에서 '가나다' 쓰는 중 헤더 count 401 → /login 이동 0, 글 그대로, 보내기 열림", async ({
  page,
}) => {
  const loginNavs = countLoginNavigations(page);
  await start(page, "/");
  await openRoomFromList(page);
  await composer(page).fill("가나다");
  await chatMock(page, "fail", { op: "count", status: 401 });
  await pauseClock(page);
  await runToNextCount(page, 30_000);
  await page.clock.resume();
  await expect(chatNav(page)).toHaveAccessibleName("채팅");
  await expect(composer(page)).toHaveValue("가나다");
  await expect(sendButton(page)).toBeEnabled();
  await expect(appAlert(page).filter({ hasText: "로그인이 끊겼어요" })).toHaveCount(0);
  expect(loginNavs()).toBe(0);
  await expect(page).toHaveURL("/chats/1?from=/chats");
});

/*
 * (g-2) 05b-2 F2 교훈 대조. 기획 §4-1 3은 401로 멈춘 헤더가 "새로고침이나 로그인 뒤" 다시 돈다고 한다.
 * 소매 로그인/로그아웃은 router.replace(클라이언트 이동)라 QueryClient가 살아 있다. 셸이 /login 을 거쳐 다시
 * 붙어도 count 캐시가 stopped면 enabled false 그대로다. 가짜 API엔 로그인 op가 없어 "/login 다녀오기 → 쿠키
 * 그대로라 세션은 살아 있음 → 셸 재마운트"로 같은 경로를 만든다.
 */
test("(g-2) 401로 멈춘 헤더 → 로그아웃해 /login 다녀온 뒤 셸이 다시 붙으면 count 다시 돈다", async ({
  page,
}) => {
  await start(page, "/");
  await chatMock(page, "fail", { op: "count", status: 401 });
  await pauseClock(page);
  await runToNextCount(page, 30_000);
  await page.clock.resume();
  await expect(chatNav(page)).toHaveAccessibleName("채팅");

  await page.getByRole("button", { name: /계정 메뉴$/ }).click();
  await page.getByRole("button", { name: "로그아웃", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  console.log("QA g-2 at", page.url());
  const stopped = await count(page, COUNT_GET);
  /* 다시 로그인한 것과 같은 상태(쿠키 그대로) — LoginView 성공 경로와 같은 router.replace + refresh.
     가짜 API에 로그인 op가 없어 dev 빌드의 app router 핸들(window.nd)로 같은 호출을 낸다 */
  await page.evaluate(() => {
    const nd = (window as unknown as { nd?: { router: { replace(h: string): void; refresh(): void } } }).nd;
    nd?.router.replace("/");
    nd?.router.refresh();
  });
  await expect(page).toHaveURL(/\/$/);
  await expect(chatNav(page)).toBeVisible();
  const evidence = await chatNav(page).evaluate((a) => ({
    tag: a.tagName,
    label: a.getAttribute("aria-label"),
    url: location.pathname,
  }));
  test.info().annotations.push({ type: "evidence", description: JSON.stringify(evidence) });
  console.log("QA g-2 back", JSON.stringify(evidence), "count", stopped);
  /* 고친 뒤(F1): 셸이 붙자마자 1회(새로고침과 같다), 그 뒤 30초 polling 1회. 둘을 따로 센다 */
  await waitCount(page, COUNT_GET, stopped + 1);
  await page.clock.fastForward(31_000);
  await waitCount(page, COUNT_GET, stopped + 2);
});

test("(h) 같은 SKU 3003 미송 둘(9001 9/4, 9006 9/6) 보기 글자가 주문일과 주문번호로 갈린다", async ({
  page,
}) => {
  await askInRoom(page);
  const group = orderGroups(page).first();
  const a = await orderChoice(group, 9001).textContent();
  const b = await orderChoice(group, 9006).textContent();
  expect(a).toBe("빈티지 플라워 셔츠 레드/L, 남은 4장, 9/4 주문 #7001");
  expect(b).toBe("빈티지 플라워 셔츠 레드/L, 남은 2장, 9/6 주문 #7006");
});

test("누출 구조 단언 — 미송 답 2건(9006, 9003) 뒤 소매가 받은 모든 /api/retail 응답에 금지 키 0, 9장 15장 0, 9006 답에 4장 0", async ({
  page,
}) => {
  const bodies = captureBodies(page);
  await askInRoom(page);
  await orderChoice(orderGroups(page).first(), 9006).click();
  await expect(orderCards(page, 9006)).toHaveCount(1);
  await say(page, ASK_WHEN);
  await expect(orderGroups(page)).toHaveCount(2);
  await orderChoice(orderGroups(page).last(), 9003).click();
  await expect(orderCards(page, 9003)).toHaveCount(1);
  /* 목록, 헤더 count 까지 받는다 */
  await page.getByRole("link", { name: "채팅 목록", exact: true }).click();
  await expect(roomRow(page, 1)).toBeVisible();
  await page.clock.fastForward(31_000);
  await expect.poll(() => bodies.some((b) => /unread-count/.test(b.url))).toBe(true);

  const keys = new Set<string>();
  for (const b of bodies) {
    try {
      allKeys(JSON.parse(b.text), keys);
    } catch {
      /* JSON 아님 */
    }
  }
  for (const k of ["availableQty", "remainingQty", "retailerName", "retailerId"])
    expect(keys.has(k), `키 ${k}`).toBe(false);
  const all = bodies.map((b) => b.text).join("\n");
  expect(all).not.toMatch(/(^|[^\d~])(9|15)장/);
  expect(all).not.toContain("대기상회");
  expect(all).not.toContain("#7005");
  const send9006 = bodies.find((b) => /messages$/.test(b.url) && b.text.includes("남은 미송 2장") && b.text.includes("9006"));
  expect(send9006, "9006 답 응답").toBeDefined();
  expect(send9006?.text).not.toMatch(/(^|[^\d~])4장/);
  await expect(navBadge(page)).toHaveCount(0);
  expect(await navUnread(page)).toBe(0);
});

/* 변이 3(계승 의도 검사) 화면 e2e. 골든 B20과 같은 길: 미송 되묻기가 열린 채 재고 질문이면 계승하지 않고
   재고 판정(방 1 문맥 2001 빈티지 플라워 셔츠 → 레드 L 3003 재고 카드). 계승하면 미송 CLARIFY_AGAIN 넘김만 나온다 */
test("(B20) 미송 되묻기 열린 채 '레드 L 재고 있어요?' → 재고 카드(3003), 미송 카드 0", async ({ page }) => {
  await askInRoom(page);
  await expect(orderGroups(page)).toHaveCount(1);
  await say(page, "레드 L 재고 있어요?");
  await expect(cards(page, 3003).last()).toBeVisible();
  const bubble = log(page).locator('[data-kind="AUTO_REPLY"]').last();
  await expect(bubble).not.toContainText("미송");
  await expect(orderCards(page)).toHaveCount(0);
});
