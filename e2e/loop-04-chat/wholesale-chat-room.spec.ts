import { expect, test, type Page } from "@playwright/test";
import {
  bubbles,
  composer,
  count,
  incoming,
  installClock,
  log,
  login,
  mock,
  openChats,
  READ_POST,
  row,
  waitCount,
  watchRequests,
} from "./helpers";

/**
 * #264 S3 — 방 보기. 와이어프레임 `#state-room-default` `#state-read` `#state-new-message` `#state-empty` `#state-error`.
 * polling 간격과 멈춤(S3-3~6)은 `wholesale-chat-polling.spec.ts`.
 */

test.beforeEach(async ({ page }) => {
  await watchRequests(page);
  await installClock(page);
  await login(page);
});

function liveRegion(page: Page) {
  return page.locator('[aria-live="polite"][data-ac="S3-8"]');
}

function bubble(page: Page, text: string) {
  return bubbles(page).filter({
    has: page.getByText(text, { exact: true }),
  });
}

test.describe("S3-1 날짜 구분선, 좌우, 자동 답변, 되묻기, 사람 넘김", () => {
  test("10/27~28 방: 구분선, 소매 왼쪽 나 오른쪽, 자동 답변 근거, 되묻기", async ({
    page,
  }) => {
    await openChats(page, 1);
    await expect(
      log(page).getByRole("separator", { name: "10월 27일 (화)" }),
    ).toHaveCount(1);
    await expect(
      log(page).getByRole("separator", { name: "10월 28일 (수)" }),
    ).toHaveCount(1);

    const box = await log(page).boundingBox();
    const them = await bubble(page, "레드 / M").boundingBox();
    const me = await bubble(page, "네 말씀하세요").boundingBox();
    expect(box && them && me).toBeTruthy();
    if (!box || !them || !me) return;
    // 소매는 왼쪽 끝, 나는 오른쪽 끝에 붙는다
    expect(them.x - box.x).toBeLessThan(16);
    expect(box.x + box.width - (me.x + me.width)).toBeLessThan(16);

    const auto = log(page).locator('[data-kind="AUTO_REPLY"]');
    await expect(auto).toContainText("자동 답변");
    await expect(auto).toContainText("판매가능 35장, 주문 한도 500장");
    await expect(auto).toContainText('소매처에게는 "50장 미만"으로 보였어요');
    const clarify = log(page).locator('[data-kind="CLARIFY"]');
    await expect(clarify).toContainText("되묻기");
    await expect(clarify).toContainText("어떤 색상, 사이즈요?");
    // 메시지마다 숨긴 발신자와 시각(디자인 결정 20)
    await expect(bubble(page, "레드 / M")).toContainText("봄봄상회, 09:22:");
  });

  test("사람 넘김은 가운데 시스템 줄, 방 머리에 답 필요", async ({ page }) => {
    await openChats(page, 2);
    const note = log(page).getByRole("note");
    await expect(note).toContainText(
      "자동 답변이 답하지 못했어요. 직접 답해 주세요",
    );
    const box = await log(page).boundingBox();
    const sys = await note.boundingBox();
    if (!box || !sys) throw new Error("상자 없음");
    const center = sys.x + sys.width / 2 - (box.x + box.width / 2);
    expect(Math.abs(center)).toBeLessThan(8);
    await expect(
      page
        .getByRole("heading", { name: "대기상회", exact: true })
        .locator("xpath=../.."),
    ).toContainText("답 필요");
  });
});

test("S3-2 방을 열면 마지막 메시지가 보이고 입력창에 가리지 않는다", async ({
  page,
}) => {
  await openChats(page, 3); // 120개 방, 최신 50개
  const last = bubbles(page).last();
  await expect(last).toContainText("메시지 120");
  await expect(bubbles(page)).toHaveCount(50);
  const lastBox = await last.boundingBox();
  const inputBox = await composer(page).boundingBox();
  const logBox = await log(page).boundingBox();
  if (!lastBox || !inputBox || !logBox) throw new Error("상자 없음");
  expect(lastBox.y + lastBox.height).toBeLessThanOrEqual(inputBox.y);
  // 스크롤 컨테이너 안에서도 보인다(바닥까지 내려가 있다)
  expect(lastBox.y + lastBox.height).toBeLessThanOrEqual(
    logBox.y + logBox.height + 1,
  );
  // 위로 올려 첫 메시지(71)까지 볼 수 있다 — 위쪽이 잘리지 않는다(디자인 결정 17)
  await log(page).evaluate((el) => (el.scrollTop = 0));
  await expect(bubbles(page).first()).toContainText("메시지 71");
  await expect(bubbles(page).first()).toBeInViewport();
});

test("S3-7 열면 읽음 1회, 배지가 사라지고 늦게 온 목록에도 되살아나지 않는다", async ({
  page,
}) => {
  await openChats(page);
  const unread = row(page, "봄봄상회").locator("[data-unread]");
  await expect(unread).toHaveCount(1);
  await row(page, "봄봄상회").click();
  await waitCount(page, READ_POST, 1);
  await expect(unread).toHaveCount(0);
  // 목록 polling 이 돌아도 그대로, 읽음도 다시 안 보낸다
  await page.clock.fastForward(15_000);
  await page.clock.fastForward(15_000);
  await expect(unread).toHaveCount(0);
  expect(await count(page, READ_POST)).toBe(1);
  // 답 필요는 그대로 — 읽었다고 답한 건 아니다
  await expect(row(page, "봄봄상회")).toContainText("답 필요");
});

test("S3-8 새 소매 메시지 → live 영역 '봄봄상회: 본문', 첫 로딩 땐 비어 있다", async ({
  page,
}) => {
  await openChats(page, 1);
  await expect(bubbles(page).last()).toContainText(
    "감사합니다. 내일 주문할게요",
  );
  await expect(liveRegion(page)).toHaveText("");
  await incoming(page, 1, "아 그리고 차콜 L도 10장요");
  await page.clock.fastForward(3_000);
  await expect(liveRegion(page)).toHaveText(
    "봄봄상회: 아 그리고 차콜 L도 10장요",
  );
  // 대화 log 는 알림 통로가 아니다
  await expect(log(page)).toHaveAttribute("aria-live", "off");
});

test.describe("S3-9 빈 방과 메시지 조회 실패", () => {
  test("메시지 0개 → 아직 대화가 없어요와 입력창", async ({ page }) => {
    await openChats(page, 4);
    await expect(log(page)).toContainText("아직 대화가 없어요");
    await expect(composer(page)).toBeVisible();
    await expect(composer(page)).toHaveAttribute(
      "placeholder",
      "나래옷방에 보낼 메시지",
    );
  });

  test("첫 조회 500 → 오른쪽 패널 오류와 다시 시도, 목록은 눌린다", async ({
    page,
  }) => {
    await openChats(page);
    await mock(page, "fail", { op: "messages", times: 1 });
    await row(page, "봄봄상회").click();
    const alert = page
      .getByRole("alert")
      .filter({ hasText: "서버에서 문제가 생겼어요" });
    await expect(alert).toBeVisible();
    // 못 읽은 방엔 입력창이 없다
    await expect(composer(page)).toHaveCount(0);
    // 목록은 살아 있다
    await row(page, "대기상회").click();
    await expect(log(page).getByRole("note")).toBeVisible();
    // 실패한 방으로 돌아와 다시 시도
    await row(page, "봄봄상회").click();
    await expect(bubbles(page).last()).toContainText(
      "감사합니다. 내일 주문할게요",
    );
  });

  test("다시 시도 → 그 방 메시지가 뜬다", async ({ page }) => {
    await openChats(page);
    await mock(page, "fail", { op: "messages", times: 1 });
    await row(page, "봄봄상회").click();
    await page.getByRole("button", { name: "다시 시도" }).click();
    await expect(bubbles(page).last()).toContainText(
      "감사합니다. 내일 주문할게요",
    );
    await expect(composer(page)).toBeVisible();
  });
});
