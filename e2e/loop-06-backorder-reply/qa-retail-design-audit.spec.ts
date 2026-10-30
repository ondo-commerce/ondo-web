import { expect, test } from "@playwright/test";
import {
  ASK_WHEN,
  assertStubServers,
  chatNav,
  incoming,
  openRoomFromList,
  orderCards,
  orderChoice,
  orderGroups,
  say,
  start,
} from "./helpers";

/**
 * QA loop-06 06a 소매 디자인 audit(04-qa.md "디자인 audit"). 와이어프레임 `18_retail-chat`과 디자인 결정 30~40의
 * 수치를 getComputedStyle 로 잰다. 값은 annotation 과 콘솔 "QA design" 줄로 남긴다.
 */

assertStubServers();

for (const path of ["/", "/chats", "/chats/1"] as const) {
  test(`390 헤더 ${path}: 검색칸 95px(결정 33), 아이콘 44, 가로 스크롤 0`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await start(page, "/");
    if (path !== "/") {
      await chatNav(page).click();
      if (path === "/chats/1") await openRoomFromList(page).catch(async () => {
        await page.locator('a[data-room-id="1"]').click();
      });
    }
    await expect(page).toHaveURL(new RegExp(`${path.replace("/", "\\/")}(\\?|$)`));
    const m = await page.evaluate(() => {
      const header = document.querySelector("header") as HTMLElement;
      const form = header.querySelector("form") as HTMLElement | null;
      const row = header.firstElementChild as HTMLElement;
      return {
        x: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        form: form?.getBoundingClientRect().width ?? null,
        rowChildren: [...row.children].map((c) => ({
          tag: c.tagName,
          w: Math.round(c.getBoundingClientRect().width),
          text: (c.textContent ?? "").slice(0, 20),
        })),
        icons: [...header.querySelectorAll("a[aria-label], button[aria-label]")].map((a) => ({
          label: a.getAttribute("aria-label"),
          w: Math.round(a.getBoundingClientRect().width),
          h: Math.round(a.getBoundingClientRect().height),
        })),
      };
    });
    console.log("QA design header", path, JSON.stringify(m));
    test.info().annotations.push({ type: "measure", description: JSON.stringify(m) });
    expect(m.x).toBe(0);
    const chat = m.icons.find((i) => i.label?.startsWith("채팅"));
    expect(chat?.w).toBe(44);
    expect(Math.round(m.form ?? 0)).toBe(95);
  });
}

test("1470 토큰: 미송 보기 36px, 14px, 간격 6, 테두리 1, 카드 위 선 1 + 여백 8, 배지 16, 채팅 링크 32", async ({
  page,
}) => {
  await start(page, "/");
  await incoming(page, 1, "답");
  await openRoomFromList(page);
  await say(page, ASK_WHEN);
  const group = orderGroups(page).first();
  await expect(group.locator("button[data-backorder-id]")).toHaveCount(4);
  const choice = await orderChoice(group, 9003).evaluate((n) => {
    const s = getComputedStyle(n);
    const prev = n.previousElementSibling as HTMLElement;
    return {
      h: n.getBoundingClientRect().height,
      font: s.fontSize,
      border: s.borderTopWidth,
      radius: s.borderTopLeftRadius,
      align: s.textAlign,
      gap: n.getBoundingClientRect().top - prev.getBoundingClientRect().bottom,
      color: s.borderTopColor,
    };
  });
  const nav = await chatNav(page).evaluate((n) => ({
    w: n.getBoundingClientRect().width,
    current: n.getAttribute("aria-current"),
    bg: getComputedStyle(n).backgroundColor,
  }));
  await orderChoice(group, 9003).click();
  await expect(orderCards(page, 9003)).toHaveCount(1);
  const card = await orderCards(page, 9003).evaluate((n) => {
    const s = getComputedStyle(n);
    return {
      borderTop: s.borderTopWidth,
      pt: s.paddingTop,
      font: getComputedStyle(n.firstElementChild as HTMLElement).fontSize,
      color: [...n.querySelectorAll("*")].map((e) => getComputedStyle(e).color),
    };
  });
  console.log("QA design 1470", JSON.stringify({ choice, nav, card }));
  test.info().annotations.push({ type: "measure", description: JSON.stringify({ choice, nav, card }) });
  expect(Math.round(choice.h)).toBe(36);
  expect(choice.font).toBe("14px");
  expect(choice.border).toBe("1px");
  expect(choice.align).toBe("left");
  expect(Math.round(choice.gap)).toBe(6);
  expect(Math.round(nav.w)).toBe(32);
  expect(nav.current).toBe("page");
  expect(card.borderTop).toBe("1px");
  expect(card.pt).toBe("8px");
});

const SHOTS = "/Users/oh-chang-eun/onDo/.claude/harness/runs/loop-06-backorder-reply/qa";

for (const width of [390, 360, 320] as const) {
  test(`${width} 헤더 가로 스크롤 0, 채팅 링크 보임`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await start(page, "/");
    const m = await page.evaluate(() => ({
      x: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      form: document.querySelector("header form")?.getBoundingClientRect().width ?? null,
      /* 돋보기 오른쪽 끝과 찜 왼쪽 끝 사이. 0보다 작으면 겹친다(F2 320) */
      iconGap:
        (document.querySelector('header a[aria-label="찜 목록"]')?.getBoundingClientRect().left ?? 0) -
        (document.querySelector("header form svg")?.getBoundingClientRect().right ?? Infinity),
    }));
    console.log("QA design header", width, JSON.stringify(m));
    await page.locator("header").screenshot({ path: `${SHOTS}/header-${width}.png` }).catch(() => undefined);
    expect(m.x).toBe(0);
    await expect(chatNav(page)).toBeInViewport();
    /* 디자인 결정 33 수치 */
    expect(Math.round(m.form ?? 0)).toBe({ 390: 95, 360: 65, 320: 28 }[width]);
    expect(m.iconGap).toBeGreaterThan(0);
  });
}

test("/chats 목록 1470: h1 20/500, 행 안 읽은 알약 20px primary 12px, 시각, 미리보기 한 줄", async ({ page }) => {
  await start(page, "/");
  await incoming(page, 1, "네 내일 오전에 주문 넣어 주시면 바로 챙길게요");
  await chatNav(page).click();
  await expect(page).toHaveURL("/chats");
  const row = page.locator('a[data-room-id="1"]');
  await expect(row).toBeVisible();
  const m = await page.evaluate(() => {
    const h1 = document.querySelector("main h1") as HTMLElement;
    const row = document.querySelector('a[data-room-id="1"]') as HTMLElement;
    const pill = [...row.querySelectorAll("span")].find((e) => /^\d+$/.test(e.textContent ?? "") && getComputedStyle(e).borderRadius !== "0px") as HTMLElement | undefined;
    return {
      h1: { size: getComputedStyle(h1).fontSize, weight: getComputedStyle(h1).fontWeight, text: h1.textContent },
      row: { text: row.textContent, label: row.getAttribute("aria-label"), h: row.getBoundingClientRect().height },
      pill: pill ? { h: pill.getBoundingClientRect().height, font: getComputedStyle(pill).fontSize, bg: getComputedStyle(pill).backgroundColor } : null,
      primary: getComputedStyle(document.documentElement).getPropertyValue("--color-primary"),
    };
  });
  console.log("QA design list", JSON.stringify(m));
  test.info().annotations.push({ type: "measure", description: JSON.stringify(m) });
  expect(m.h1.size).toBe("20px");
  expect(m.h1.weight).toBe("500");
  expect(m.pill?.h).toBe(20);
  expect(m.pill?.font).toBe("12px");
});
