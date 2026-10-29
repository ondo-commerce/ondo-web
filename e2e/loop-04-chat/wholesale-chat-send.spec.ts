import { expect, test, type Page } from "@playwright/test";
import {
  bubbles,
  composer,
  count,
  incoming,
  installClock,
  log,
  login,
  MESSAGES_GET,
  mock,
  openChats,
  row,
  SEND_POST,
  settled,
  waitCount,
  watchRequests,
} from "./helpers";

/**
 * #265 S4 — 보내기와 실패 복구. 와이어프레임 `#state-sending` `#state-composer` `#state-limit`
 * `#state-send-failed` `#state-merge` `#state-401` `#state-offline` `#state-paste-photo` `#state-keyboard`.
 *
 * 목 본문 손잡이(`fail500` `fail500once` `failAfterCommit` `auth401` `slow5s`)는 본문에 섞여도 걸린다.
 * 시계는 흐른다(보내기 목이 300ms 지연을 쓴다). polling 이 필요하면 `fastForward(3000)`.
 */

test.beforeEach(async ({ page }) => {
  await watchRequests(page);
  await installClock(page);
  await login(page);
});

function sendButton(page: Page) {
  return page.getByRole("button", { name: "보내기", exact: true });
}

/** 보류 말풍선(보내는 중, 못 보냄) */
function pendingBubbles(page: Page) {
  return log(page).locator("[data-pending]");
}

/** 서버가 준 내 말풍선 중 본문이 정확히 이것인 것 */
function sentBubble(page: Page, text: string) {
  return bubbles(page).filter({ has: page.getByText(text, { exact: true }) });
}

async function openRoom(page: Page, roomId = 1): Promise<void> {
  await openChats(page, roomId);
  await expect(bubbles(page).first()).toBeVisible();
}

test("S4-1 Enter → POST 1회, 즉시 보내는 중, 응답 뒤 시각, 입력창 비고 포커스 유지", async ({
  page,
}) => {
  await openRoom(page);
  await composer(page).fill("slow5s 30장이면 장당 500원 빼 드릴게요");
  await composer(page).press("Enter");

  const sending = pendingBubbles(page);
  await expect(sending).toHaveAttribute("aria-busy", "true");
  await expect(sending).toContainText("보내는 중");
  await expect(composer(page)).toHaveValue("");
  await expect(composer(page)).toBeFocused();
  await waitCount(page, SEND_POST, 1);

  await page.clock.fastForward(5_000); // slow5s 응답
  await expect(pendingBubbles(page)).toHaveCount(0);
  const sent = sentBubble(page, "slow5s 30장이면 장당 500원 빼 드릴게요");
  await expect(sent).toHaveCount(1);
  await expect(sent).toContainText(/\d{2}:\d{2}/);
  expect(await count(page, SEND_POST)).toBe(1);
  // 답 필요가 방 머리에서 사라진다(사람이 답했다)
  await expect(
    page
      .getByRole("heading", { name: "봄봄상회", exact: true })
      .locator("xpath=../.."),
  ).not.toContainText("답 필요");
});

test.describe("S4-2 줄바꿈과 한글 조합", () => {
  test("Shift+Enter 는 줄바꿈, 보내지 않는다", async ({ page }) => {
    await openRoom(page);
    await composer(page).click();
    await page.keyboard.type("블랙 M 12장은 오늘 나가요");
    await page.keyboard.press("Shift+Enter");
    await page.keyboard.type("나머지 18장은 금요일 입고예요");
    await expect(composer(page)).toHaveValue(
      "블랙 M 12장은 오늘 나가요\n나머지 18장은 금요일 입고예요",
    );
    expect(await count(page, SEND_POST)).toBe(0);
  });

  test("조합 중 Enter 는 안 보내고, 조합을 끝낸 뒤 Enter → POST 정확히 1회", async ({
    page,
  }) => {
    await openRoom(page);
    await composer(page).focus();
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Input.imeSetComposition", {
      text: "네",
      selectionStart: 1,
      selectionEnd: 1,
    });
    // 조합 중 Enter — keydown 이 isComposing=true 로 온다. CDP 는 조합 글에 줄바꿈을 넣지만(실제 IME 와 다름)
    // 확정하면 사라진다. 여기서 볼 것은 "안 보냈다" 하나다
    await page.keyboard.press("Enter");
    expect(await count(page, SEND_POST)).toBe(0);
    await expect(composer(page)).toHaveValue(/^네/);
    await expect(pendingBubbles(page)).toHaveCount(0);
    await cdp.send("Input.insertText", { text: "네" }); // 조합 확정
    await page.keyboard.press("Enter");
    await waitCount(page, SEND_POST, 1);
    await expect(sentBubble(page, "네")).toHaveCount(1);
    await page.keyboard.press("Enter");
    expect(await count(page, SEND_POST)).toBe(1);
  });
});

test.describe("S4-3 연타해도 POST 1회", () => {
  test("Enter 3연타", async ({ page }) => {
    await openRoom(page);
    await composer(page).fill("네 확인했어요");
    await composer(page).press("Enter");
    await composer(page).press("Enter");
    await composer(page).press("Enter");
    await expect(sentBubble(page, "네 확인했어요")).toHaveCount(1);
    expect(await count(page, SEND_POST)).toBe(1);
  });

  test("보내기 버튼 3연타", async ({ page }) => {
    await openRoom(page);
    await composer(page).fill("버튼으로 보냄");
    await sendButton(page).click({ clickCount: 3 });
    await expect(sentBubble(page, "버튼으로 보냄")).toHaveCount(1);
    expect(await count(page, SEND_POST)).toBe(1);
  });

  test("버튼 한 번 클릭 — 포커스는 입력창에 남는다", async ({ page }) => {
    await openRoom(page);
    await composer(page).fill("버튼 한 번");
    await sendButton(page).click();
    await expect(sentBubble(page, "버튼 한 번")).toHaveCount(1);
    await expect(composer(page)).toBeFocused();
  });
});

test.describe("S4-4 글자 수", () => {
  test("공백만이면 보내기 비활성", async ({ page }) => {
    await openRoom(page);
    await expect(sendButton(page)).toBeDisabled();
    await composer(page).fill("   ");
    await expect(sendButton(page)).toBeDisabled();
    await composer(page).press("Enter");
    expect(await count(page, SEND_POST)).toBe(0);
  });

  test("이모지 포함 정확히 1000자 → 보내진다", async ({ page }) => {
    await openRoom(page);
    const exact = "👍".repeat(10) + "가".repeat(990);
    await composer(page).fill(exact);
    await expect(page.getByText("1,000/1,000", { exact: true })).toBeVisible();
    await expect(sendButton(page)).toBeEnabled();
    await composer(page).press("Enter");
    await expect(sentBubble(page, exact)).toHaveCount(1);
    expect(await count(page, SEND_POST)).toBe(1);
  });

  test("1001자 → 자르지 않고 안내, 잠김", async ({ page }) => {
    await openRoom(page);
    const over = "👍".repeat(10) + "가".repeat(991);
    await composer(page).fill(over);
    await expect(
      page.getByText("1,000자까지 보낼 수 있어요 (1,001/1,000)", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(composer(page)).toHaveAttribute("aria-invalid", "true");
    await expect(sendButton(page)).toBeDisabled();
    await expect(composer(page)).toHaveValue(over);
    await composer(page).press("Enter");
    expect(await count(page, SEND_POST)).toBe(0);
  });

  test("공백 없는 1000자 말풍선이 방 폭을 넘지 않는다", async ({ page }) => {
    await openRoom(page);
    const long = "ㅋ".repeat(1000);
    await composer(page).fill(long);
    await composer(page).press("Enter");
    const sent = sentBubble(page, long);
    await expect(sent).toHaveCount(1);
    const box = await log(page).boundingBox();
    const bub = await sent.boundingBox();
    if (!box || !bub) throw new Error("상자 없음");
    expect(bub.width).toBeLessThanOrEqual(box.width * 0.7 + 1);
    expect(bub.x + bub.width).toBeLessThanOrEqual(box.x + box.width);
    const overflow = await log(page).evaluate(
      (el) => el.scrollWidth - el.clientWidth,
    );
    expect(overflow).toBe(0);
  });
});

test.describe("S4-5 500 → 못 보냈어요, 다시 보내기(같은 키), 지우기", () => {
  test("실패 말풍선과 그동안 쓴 새 글이 그대로", async ({ page }) => {
    await openRoom(page);
    await composer(page).fill("fail500 30장이면 장당 500원 빼 드릴게요");
    await composer(page).press("Enter");
    const failed = pendingBubbles(page);
    await expect(failed).toHaveAttribute("data-pending", "failed");
    await expect(failed.getByRole("alert")).toContainText("못 보냈어요");
    await expect(
      failed.getByRole("button", { name: "다시 보내기", exact: true }),
    ).toBeVisible();
    await composer(page).fill("그리고 차콜 L은 10장 남았어요");
    // 다시 보내도 늘 500 — 말풍선은 그대로, 새 글도 그대로
    await failed.getByRole("button", { name: "다시 보내기" }).click();
    await waitCount(page, SEND_POST, 2);
    await expect(failed).toHaveAttribute("data-pending", "failed");
    await expect(composer(page)).toHaveValue("그리고 차콜 L은 10장 남았어요");
    // 지우기 — 화면에서만 뺀다
    await failed.getByRole("button", { name: "지우기", exact: true }).click();
    await expect(pendingBubbles(page)).toHaveCount(0);
    expect(await count(page, SEND_POST)).toBe(2);
  });

  test("다시 보내기는 같은 키 — 성공하면 그 키의 말풍선 하나", async ({
    page,
  }) => {
    await openRoom(page);
    await composer(page).fill("fail500once 한 번만 실패");
    await composer(page).press("Enter");
    const failed = pendingBubbles(page);
    await expect(failed).toHaveAttribute("data-pending", "failed");
    const key = await failed.getAttribute("data-client-id");
    await failed.getByRole("button", { name: "다시 보내기" }).click();
    const sent = sentBubble(page, "fail500once 한 번만 실패");
    await expect(sent).toHaveCount(1);
    // 목은 처음 실패한 키로 다시 와야 201 을 준다 — 같은 키라는 증거
    await expect(sent).toHaveAttribute("data-client-id", key ?? "");
    await expect(pendingBubbles(page)).toHaveCount(0);
    expect(await count(page, SEND_POST)).toBe(2);
  });
});

test("S4-6 응답 유실 → polling 이 같은 clientMessageId 를 가져오면 보낸 말풍선 1개", async ({
  page,
}) => {
  await openRoom(page);
  await composer(page).fill("failAfterCommit 장당 500원 빼 드릴게요");
  await composer(page).press("Enter");
  const failed = pendingBubbles(page);
  await expect(failed).toHaveAttribute("data-pending", "failed");
  const key = await failed.getAttribute("data-client-id");

  await page.clock.fastForward(3_000);
  const sent = sentBubble(page, "failAfterCommit 장당 500원 빼 드릴게요");
  await expect(sent).toHaveCount(1);
  await expect(sent).toHaveAttribute("data-client-id", key ?? "");
  // 합쳐진 말풍선(QA F7)
  await expect(sent).toHaveAttribute("data-ac", /S4-6/);
  await expect(pendingBubbles(page)).toHaveCount(0);
  await expect(
    log(page).getByText("failAfterCommit 장당 500원 빼 드릴게요", {
      exact: true,
    }),
  ).toHaveCount(1);
});

test.describe("S4-7 401 — 글은 남고 보내기만 잠긴다", () => {
  const SESSION_LOST = "로그인이 끊겼어요. 다시 로그인하기 전엔 보낼 수 없어요";

  test("보내기 401 → 실패 말풍선(지우기만), 안내, 잠김, polling 멈춤", async ({
    page,
  }) => {
    await openRoom(page);
    await composer(page).fill("auth401 30장이면 장당 500원 빼 드릴게요");
    await composer(page).press("Enter");
    const failed = pendingBubbles(page);
    await expect(failed).toHaveAttribute("data-pending", "failed");
    await expect(failed).toContainText("30장이면 장당 500원 빼 드릴게요");
    await expect(
      failed.getByRole("button", { name: "다시 보내기" }),
    ).toHaveCount(0);
    await expect(
      failed.getByRole("button", { name: "지우기", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("alert").filter({ hasText: SESSION_LOST }),
    ).toBeVisible();
    await expect(sendButton(page)).toBeDisabled();
    await expect(composer(page)).toHaveAttribute("readonly", "");

    const gets = await count(page, MESSAGES_GET);
    await page.clock.fastForward(30_000);
    await page.clock.fastForward(30_000);
    expect(await count(page, MESSAGES_GET)).toBe(gets);
    expect(page.url()).toContain("/chats?room=1");
  });

  test("쓰는 중 polling 401 → 입력 글 그대로, 읽기 전용, 안내", async ({
    page,
  }) => {
    await openRoom(page);
    await composer(page).fill("그리고 차콜 L은 10장 남았어요");
    await mock(page, "fail", { op: "messages", status: 401, times: 1 });
    await page.clock.fastForward(3_000);
    await expect(
      page.getByRole("alert").filter({ hasText: SESSION_LOST }),
    ).toBeVisible();
    await expect(composer(page)).toHaveValue("그리고 차콜 L은 10장 남았어요");
    await expect(composer(page)).toHaveAttribute("readonly", "");
    await expect(sendButton(page)).toBeDisabled();
  });
});

test("S4-8 오프라인 보내기 → 안내, 복귀해도 자동 재전송 없음, polling 1회로 채움, 다시 보내기는 같은 키 1건", async ({
  page,
  context,
}) => {
  await openRoom(page);
  await settled(page, MESSAGES_GET);
  await incoming(page, 1, "혹시 보셨어요?");
  await context.setOffline(true);
  const gets = await count(page, MESSAGES_GET);

  await composer(page).fill("30장이면 장당 500원 빼 드릴게요");
  await composer(page).press("Enter");
  const failed = pendingBubbles(page);
  await expect(failed.getByRole("alert")).toContainText(
    "연결이 끊겨 못 보냈어요",
  );
  expect(await count(page, SEND_POST)).toBe(0);
  const key = await failed.getAttribute("data-client-id");

  await context.setOffline(false);
  await waitCount(page, MESSAGES_GET, gets + 1);
  await expect(sentBubble(page, "혹시 보셨어요?")).toHaveCount(1);
  // 놓친 소매 메시지가 채워져도 실패 말풍선은 맨 아래 그대로, 보내기는 안 나갔다
  await expect(failed).toHaveAttribute("data-pending", "failed");
  expect(await count(page, SEND_POST)).toBe(0);
  const lastTwo = await log(page)
    .locator("[data-sequence], [data-pending]")
    .evaluateAll((nodes) =>
      nodes.slice(-2).map((n) => (n as HTMLElement).dataset.pending ?? "sent"),
    );
  expect(lastTwo).toEqual(["sent", "failed"]);

  await failed.getByRole("button", { name: "다시 보내기" }).click();
  const sent = sentBubble(page, "30장이면 장당 500원 빼 드릴게요");
  await expect(sent).toHaveCount(1);
  await expect(sent).toHaveAttribute("data-client-id", key ?? "");
  expect(await count(page, SEND_POST)).toBe(1);
});

test("S4-9 사진 붙여넣기 → 안내, 입력 글 그대로", async ({ page }) => {
  await openRoom(page);
  await composer(page).fill("블랙 M 실물 사진이에요");
  await composer(page).evaluate((el) => {
    const data = new DataTransfer();
    data.items.add(new File(["x"], "photo.png", { type: "image/png" }));
    el.dispatchEvent(
      new ClipboardEvent("paste", {
        clipboardData: data,
        bubbles: true,
        cancelable: true,
      }),
    );
  });
  const note = page
    .getByRole("status")
    .filter({ hasText: "사진은 아직 보낼 수 없어요" });
  await expect(note).toBeVisible();
  await expect(note).not.toHaveClass(/destructive/);
  await expect(composer(page)).toHaveValue("블랙 M 실물 사진이에요");
  // 다음 입력에서 사라진다
  await composer(page).press("End");
  await page.keyboard.type("!");
  await expect(note).toHaveCount(0);
});

test("S4-10 쓰는 중 polling 갱신 3회 뒤에도 입력 글과 커서 그대로", async ({
  page,
}) => {
  await openRoom(page);
  const text = "블랙 M 12장은 오늘 나가요";
  await composer(page).fill(text);
  await composer(page).evaluate((el) =>
    (el as HTMLTextAreaElement).setSelectionRange(11, 11),
  );
  const before = await bubbles(page).count();
  for (const body of ["아 그리고", "차콜 L도", "10장요"]) {
    await incoming(page, 1, body);
    await page.clock.fastForward(3_000);
    await expect(sentBubble(page, body)).toHaveCount(1);
  }
  expect(await bubbles(page).count()).toBe(before + 3);
  await expect(composer(page)).toBeFocused();
  await expect(composer(page)).toHaveValue(text);
  expect(
    await composer(page).evaluate((el) => [
      (el as HTMLTextAreaElement).selectionStart,
      (el as HTMLTextAreaElement).selectionEnd,
    ]),
  ).toEqual([11, 11]);
});

test("S4-11 입력창 Esc → 선택 행으로, 글은 그대로, 같은 행 Enter → 이어 쓴다", async ({
  page,
}) => {
  await openChats(page);
  await row(page, "봄봄상회").click();
  await expect(composer(page)).toBeFocused();
  await page.keyboard.type("네 오전 10시부터");
  await page.keyboard.press("Escape");
  await expect(row(page, "봄봄상회")).toBeFocused();
  await expect(composer(page)).toHaveValue("네 오전 10시부터");

  await page.keyboard.press("Enter");
  await expect(composer(page)).toBeFocused();
  await page.keyboard.type(" 있어요");
  await expect(composer(page)).toHaveValue("네 오전 10시부터 있어요");
  expect(await count(page, SEND_POST)).toBe(0);
});
