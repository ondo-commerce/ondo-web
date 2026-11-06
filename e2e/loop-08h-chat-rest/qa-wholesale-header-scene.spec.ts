import { expect, test, type Page } from "@playwright/test";
import {
  installClock,
  log,
  login,
  roomList,
  row,
} from "../loop-04-chat/helpers";

/**
 * QA loop-08h — 06 미송 답 장면을 **진짜 헤더 링크로** 다시 밟는다. 개발 수정(a55be89)은 옛 spec들이 헤더 링크 대신
 * 셸 라우터(`pushChats`)로 `/chats`에 가게 바꿨다. 그래서 그 spec들은 "사장이 미송 탭에서 헤더 채팅을 눌러 봄봄상회
 * 방으로 돌아온다"는 장면을 더는 안 본다. 여기서 그 길을 그대로 걷고, 답 필요 목록에 그 방이 없으면 몇 번 더
 * 눌러야 하는지 남긴다. 시각, 시드는 06 `wholesale-backorder-facts.spec.ts`와 같다.
 */

const T0 = new Date("2026-10-29T14:20:00+09:00");
const ASK = "지난주 주문한 거 언제 와요?";

async function resetChat(page: Page): Promise<void> {
  const status = await page.evaluate(
    async () =>
      (
        await fetch("/__mock/chat/reset", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        })
      ).status,
  );
  expect(status).toBe(200);
}

/** 방 1에 소매 질문(자동 답 판정). 판정이 만든 줄의 sequence */
async function ask(page: Page): Promise<number> {
  const seq = await page.evaluate(async (body) => {
    const r = await fetch("/__mock/chat/rooms/1/incoming", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body, autoReply: true }),
    });
    const json = (await r.json()) as { data: { sequence: number }[] };
    return json.data[1]?.sequence ?? -1;
  }, ASK);
  expect(seq).toBeGreaterThan(0);
  return seq;
}

test("06 장면: 방 1 되묻기 → 미송 탭 → 헤더 채팅 링크 → 봄봄상회 방 1로 돌아와 그 되묻기가 보인다", async ({
  page,
}) => {
  await installClock(page, T0);
  await login(page);
  await page.goto("/chats?room=1");
  await expect(roomList(page).getByRole("link").first()).toBeVisible();
  await resetChat(page);
  await expect(log(page)).toBeVisible();
  const clarify = await ask(page);
  await expect(log(page).locator(`[data-sequence="${clarify}"]`)).toBeVisible();

  await page.getByRole("link", { name: "미송", exact: true }).click();
  await expect(page).toHaveURL(/\/backorders/);

  /* 기록형이던 것을 단언형으로(메타 리뷰 08h-M4). 미송 탭에서 count가 온 뒤 링크는 답 필요 목록으로 간다(D55).
     답 필요 3건은 이 시드(06 시각 + 방 1 되묻기)의 실측이다. href가 늘 `/chats`면 여기서 실패해야 한다 */
  const link = page.getByRole("banner").getByRole("link", { name: /^채팅/ });
  await expect(link).toHaveAccessibleName("채팅, 답 필요 3건");
  await expect(link).toHaveAttribute("href", "/chats?filter=NEEDS_REPLY");
  const ev = await link.evaluate((el) => ({
    tag: el.tagName,
    ariaLabel: el.getAttribute("aria-label"),
    href: el.getAttribute("href"),
  }));
  test.info().annotations.push({
    type: "header link",
    description: JSON.stringify(ev),
  });
  await link.click();
  await expect(page).toHaveURL(/\/chats\?filter=NEEDS_REPLY$/);
  await expect(roomList(page).getByRole("link").first()).toBeVisible();
  await expect(
    row(page, "봄봄상회"),
    "답 필요 목록에 봄봄상회 없음",
  ).toHaveCount(0);

  await page
    .getByRole("radiogroup", { name: "대화 필터" })
    .getByRole("radio", { name: "전체", exact: true })
    .click();
  await expect(page).toHaveURL(/\/chats$/);
  await expect(row(page, "봄봄상회"), "전체 목록에 봄봄상회 1행").toHaveCount(
    1,
  );
  await row(page, "봄봄상회").click();
  await expect(page).toHaveURL(/room=1$/);
  await expect(log(page).locator(`[data-sequence="${clarify}"]`)).toBeVisible();
});
