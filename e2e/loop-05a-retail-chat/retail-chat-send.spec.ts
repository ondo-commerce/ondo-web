import { expect, test, type Page } from "@playwright/test";
import {
  ANY_CHAT,
  appAlert,
  assertStubServers,
  bubbles,
  composer,
  count,
  drawnSequences,
  enterRoom,
  incoming,
  log,
  mock,
  MESSAGES_GET,
  openProduct,
  openRoom,
  requests,
  SEND_POST,
  sendButton,
  signIn,
  waitCount,
  watchRequests,
} from "./helpers";

/**
 * #285 S6 — 보내기, 받기, 세션 끊김 보존. 도매 loop-04 `wholesale-chat-send`, `wholesale-chat-polling`과 짝이다.
 * 실제로 3초를 기다리지 않는다 — `page.clock`으로 시간을 민다. 간격을 재는 테스트는 시계를 멈춘 뒤 `runFor`로만 민다.
 */

assertStubServers();

const SESSION_LOST = "로그인이 끊겼어요. 다시 로그인하기 전엔 보낼 수 없어요";

test.beforeEach(async ({ page }) => {
  await watchRequests(page);
  await page.clock.install({ time: new Date("2026-10-28T10:30:00+09:00") });
  await signIn(page);
});

/** 보류 말풍선(보내는 중, 못 보냄) */
function pendingBubbles(page: Page) {
  return log(page).locator("[data-pending]");
}

/** 서버가 준 말풍선 중 본문이 정확히 이것인 것 */
function sentBubble(page: Page, text: string) {
  return bubbles(page).filter({ has: page.getByText(text, { exact: true }) });
}

async function settled(page: Page) {
  await expect
    .poll(async () =>
      (await requests(page, MESSAGES_GET)).every((r) => r.status !== null),
    )
    .toBe(true);
}

/** 시계를 멈춘다. 흐르는 시계라 "지금" 500ms 앞에서 멈추고, 그 사이 나간 polling 응답까지 받는다 */
async function pauseClock(page: Page): Promise<void> {
  const now = await page.evaluate(() => Date.now());
  await page.clock.pauseAt(new Date(now + 500));
  await settled(page);
}

async function flushUntilFailures(page: Page, n: number): Promise<void> {
  await expect
    .poll(async () => {
      await page.clock.runFor(1);
      return log(page).getAttribute("data-poll-failures");
    })
    .toBe(String(n));
}

/** 다음 polling 요청이 [min, max] ms 사이에 시작한다 */
async function expectNextPollWithin(page: Page, minMs: number, maxMs: number) {
  const before = await count(page, MESSAGES_GET);
  await page.clock.runFor(minMs - 50);
  expect(await count(page, MESSAGES_GET), `${minMs}ms 전엔 요청 없음`).toBe(
    before,
  );
  await page.clock.runFor(maxMs - minMs + 100);
  await waitCount(page, MESSAGES_GET, before + 1);
  await settled(page);
}

/** 탭 숨김/보임. Playwright엔 탭 전환이 없어 visibilityState를 바꾸고 이벤트를 보낸다(TanStack focusManager가 듣는다) */
async function setVisibility(page: Page, state: "hidden" | "visible") {
  await page.evaluate((s) => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => s,
    });
    Object.defineProperty(document, "hidden", {
      configurable: true,
      get: () => s === "hidden",
    });
    document.dispatchEvent(new Event("visibilitychange", { bubbles: true }));
  }, state);
}

/** 보내기 요청의 헤더와 본문 */
function captureSends(page: Page) {
  const sent: { key: string | null; body: unknown }[] = [];
  page.on("request", (r) => {
    if (r.method() === "POST" && /\/chat\/rooms\/\d+\/messages$/.test(r.url()))
      sent.push({
        key: r.headers()["idempotency-key"] ?? null,
        body: r.postDataJSON(),
      });
  });
  return sent;
}

test("S6-1 Enter → POST 1회, 키 = 말풍선 clientMessageId, 본문 {body, inquiry: null}, 즉시 보내는 중, 입력창 비고 포커스", async ({
  page,
}) => {
  const sends = captureSends(page);
  await openRoom(page, "/chats/1");
  await composer(page).fill("slow5s 레드 M 몇 장 있어요?");
  await composer(page).press("Enter");

  const sending = pendingBubbles(page);
  await expect(sending).toHaveAttribute("aria-busy", "true");
  await expect(sending).toContainText("보내는 중");
  await expect(composer(page)).toHaveValue("");
  await expect(composer(page)).toBeFocused();
  await waitCount(page, SEND_POST, 1);
  const key = await sending.getAttribute("data-client-id");
  expect(key).toMatch(/^[0-9a-f-]{36}$/);
  expect(sends).toEqual([
    { key, body: { body: "slow5s 레드 M 몇 장 있어요?", inquiry: null } },
  ]);

  await page.clock.fastForward(5_000); // slow5s 응답
  await expect(pendingBubbles(page)).toHaveCount(0);
  const sent = sentBubble(page, "slow5s 레드 M 몇 장 있어요?");
  await expect(sent).toHaveCount(1);
  await expect(sent).toHaveAttribute("data-client-id", key ?? "");
  await expect(sent).toContainText(/\d{2}:\d{2}/);
  expect(await count(page, SEND_POST)).toBe(1);
});

test.describe("S6-2 줄바꿈, 한글 조합, 연타", () => {
  test("Shift+Enter는 줄바꿈, 보내지 않는다", async ({ page }) => {
    await openRoom(page, "/chats/1");
    await composer(page).click();
    await page.keyboard.type("레드 M 30장");
    await page.keyboard.press("Shift+Enter");
    await page.keyboard.type("블랙 L 10장");
    await expect(composer(page)).toHaveValue("레드 M 30장\n블랙 L 10장");
    expect(await count(page, SEND_POST)).toBe(0);
  });

  test("조합 중 Enter는 안 보내고, 조합을 끝낸 뒤 Enter → POST 정확히 1회", async ({
    page,
  }) => {
    await openRoom(page, "/chats/1");
    await composer(page).focus();
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Input.imeSetComposition", {
      text: "네",
      selectionStart: 1,
      selectionEnd: 1,
    });
    // 조합 중 Enter — keydown이 isComposing=true로 온다(CDP는 조합 글에 줄바꿈을 넣지만 확정하면 사라진다)
    await page.keyboard.press("Enter");
    expect(await count(page, SEND_POST)).toBe(0);
    await expect(pendingBubbles(page)).toHaveCount(0);
    await cdp.send("Input.insertText", { text: "네" }); // 조합 확정
    await page.keyboard.press("Enter");
    await waitCount(page, SEND_POST, 1);
    await expect(sentBubble(page, "네")).toHaveCount(1);
    await page.keyboard.press("Enter");
    expect(await count(page, SEND_POST)).toBe(1);
  });

  test("Enter 3연타 → POST 1회", async ({ page }) => {
    await openRoom(page, "/chats/1");
    await composer(page).fill("레드 M 있어요?");
    await composer(page).press("Enter");
    await composer(page).press("Enter");
    await composer(page).press("Enter");
    await expect(sentBubble(page, "레드 M 있어요?")).toHaveCount(1);
    expect(await count(page, SEND_POST)).toBe(1);
  });
});

test.describe("S6-3 글자 수", () => {
  test("공백만이면 보내기 잠김", async ({ page }) => {
    await openRoom(page, "/chats/1");
    await composer(page).fill("   \n  ");
    await expect(sendButton(page)).toBeDisabled();
    await composer(page).press("Enter");
    expect(await count(page, SEND_POST)).toBe(0);
  });

  test("이모지 포함 정확히 1000자 → 보내진다", async ({ page }) => {
    await openRoom(page, "/chats/1");
    const exact = "👍".repeat(10) + "가".repeat(990);
    await composer(page).fill(exact);
    await expect(page.getByText("1,000/1,000")).toBeVisible();
    await sendButton(page).click();
    await expect(sentBubble(page, exact)).toHaveCount(1);
  });

  test("1001자 → 자르지 않고 안내, 잠김", async ({ page }) => {
    await openRoom(page, "/chats/1");
    const over = "👍".repeat(10) + "가".repeat(991);
    await composer(page).fill(over);
    await expect(
      page.getByText("1,000자까지 보낼 수 있어요 (1,001/1,000)"),
    ).toBeVisible();
    await expect(sendButton(page)).toBeDisabled();
    await expect(composer(page)).toHaveValue(over);
    await expect(composer(page)).toHaveAttribute("aria-invalid", "true");
  });
});

test.describe("S6-4 실패 복구", () => {
  test("fail500 → 못 보냈어요 + 다시 보내기(같은 키) + 지우기, 그동안 쓴 새 글 그대로", async ({
    page,
  }) => {
    const sends = captureSends(page);
    await openRoom(page, "/chats/1");
    await composer(page).fill("fail500 레드 M 30장 오늘 출고 되나요?");
    await composer(page).press("Enter");
    const failed = pendingBubbles(page);
    await expect(failed).toHaveAttribute("data-pending", "failed");
    await expect(failed.getByRole("alert")).toContainText("못 보냈어요");
    await composer(page).fill("아 블랙도요");
    await failed.getByRole("button", { name: "다시 보내기" }).click();
    await waitCount(page, SEND_POST, 2);
    await expect(failed).toHaveAttribute("data-pending", "failed");
    expect(sends.map((s) => s.key)).toEqual([sends[0]?.key, sends[0]?.key]);
    await expect(composer(page)).toHaveValue("아 블랙도요");
    await failed.getByRole("button", { name: "지우기", exact: true }).click();
    await expect(pendingBubbles(page)).toHaveCount(0);
    expect(await count(page, SEND_POST)).toBe(2);
  });

  test("failAfterCommit → polling이 같은 clientMessageId를 가져오면 말풍선 1개", async ({
    page,
  }) => {
    await openRoom(page, "/chats/1");
    await composer(page).fill("failAfterCommit 레드 M 30장요");
    await composer(page).press("Enter");
    const failed = pendingBubbles(page);
    await expect(failed).toHaveAttribute("data-pending", "failed");
    const key = await failed.getAttribute("data-client-id");
    await page.clock.fastForward(3_000);
    const sent = sentBubble(page, "failAfterCommit 레드 M 30장요");
    await expect(sent).toHaveCount(1);
    await expect(sent).toHaveAttribute("data-client-id", key ?? "");
    await expect(sent).toHaveAttribute("data-ac", /S6-4/);
    await expect(pendingBubbles(page)).toHaveCount(0);
  });
});

test.describe("S6-5 세션 끊김 — 글은 남고 보내기만 잠긴다", () => {
  test("보내기 401 → 주소 그대로, 실패 말풍선(지우기만), 끊김 문구, 잠김, 이후 60초 채팅 요청 0", async ({
    page,
  }) => {
    await openRoom(page, "/chats/1?from=/products/11");
    await composer(page).fill("auth401 레드 M 30장 오늘 출고 되나요?");
    await composer(page).press("Enter");
    const failed = pendingBubbles(page);
    await expect(failed).toHaveAttribute("data-pending", "failed");
    await expect(failed).toContainText("레드 M 30장 오늘 출고 되나요?");
    await expect(
      failed.getByRole("button", { name: "다시 보내기" }),
    ).toHaveCount(0);
    await expect(
      failed.getByRole("button", { name: "지우기", exact: true }),
    ).toBeVisible();
    await expect(
      appAlert(page).filter({ hasText: SESSION_LOST }),
    ).toBeVisible();
    await expect(sendButton(page)).toBeDisabled();
    await expect(composer(page)).toHaveAttribute("readonly", "");
    // 로그인하기를 두지 않는다 — 누르면 쓴 글이 사라진다(디자인 결정 16)
    await expect(page.getByRole("link", { name: "로그인하기" })).toHaveCount(0);

    const before = await count(page, ANY_CHAT);
    await page.clock.fastForward(30_000);
    await setVisibility(page, "hidden");
    await setVisibility(page, "visible");
    await page.clock.fastForward(30_000);
    expect(await count(page, ANY_CHAT)).toBe(before);
    expect(new URL(page.url()).pathname).toBe("/chats/1");
  });

  test("쓰는 중 polling 401 → 입력 글 그대로, 읽기 전용, 끊김 문구, 이후 60초 채팅 요청 0", async ({
    page,
  }) => {
    await openRoom(page, "/chats/1");
    await composer(page).fill("아 블랙도요");
    await mock(page, "fail", { op: "messages", status: 401, times: 5 });
    await pauseClock(page);
    await page.clock.runFor(3_000);
    await expect
      .poll(async () => (await requests(page, MESSAGES_GET)).at(-1)?.status)
      .toBe(401);
    // 시계가 멈춰 있어 TanStack 알림(setTimeout 0)도 멈춰 있다 — 1ms씩 밀며 화면 반영을 기다린다
    await expect
      .poll(async () => {
        await page.clock.runFor(1);
        return appAlert(page).filter({ hasText: SESSION_LOST }).count();
      })
      .toBe(1);
    await expect(composer(page)).toHaveValue("아 블랙도요");
    await expect(composer(page)).toHaveAttribute("readonly", "");
    await expect(sendButton(page)).toBeDisabled();

    const before = await count(page, ANY_CHAT);
    await page.clock.runFor(60_000);
    expect(await count(page, ANY_CHAT)).toBe(before);
    expect(new URL(page.url()).pathname).toBe("/chats/1");
    await expect(bubbles(page)).toHaveCount(7);
  });
});

test("S6-6 오프라인 보내기 → 안내, 복귀해도 자동 재전송 없음, 즉시 polling 1회, 다시 보내기는 같은 키 1건", async ({
  page,
  context,
}) => {
  const sends = captureSends(page);
  await openRoom(page, "/chats/1");
  await settled(page);
  await incoming(page, 1, "혹시 보셨어요?");
  await context.setOffline(true);
  const gets = await count(page, MESSAGES_GET);

  await composer(page).fill("레드 M 30장요");
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
  await expect(failed).toHaveAttribute("data-pending", "failed");
  expect(await count(page, SEND_POST)).toBe(0);

  await failed.getByRole("button", { name: "다시 보내기" }).click();
  const sent = sentBubble(page, "레드 M 30장요");
  await expect(sent).toHaveCount(1);
  await expect(sent).toHaveAttribute("data-client-id", key ?? "");
  expect(sends.map((s) => s.key)).toEqual([key]);
});

test.describe("S6-7 받기", () => {
  test("incoming 주입 → 3초 → afterSequence 요청 → 도매 말풍선이 왼쪽에 생기고 바닥으로", async ({
    page,
  }) => {
    await openRoom(page, "/chats/1");
    await expect(bubbles(page)).toHaveCount(7);
    await pauseClock(page);
    const before = await count(page, MESSAGES_GET);
    await incoming(page, 1, "네 내일 오전 10시부터 있어요");
    await page.clock.runFor(3_000);
    await waitCount(page, MESSAGES_GET, before + 1);
    expect((await requests(page, MESSAGES_GET)).at(-1)?.url).toContain(
      "afterSequence=7",
    );
    const reply = sentBubble(page, "네 내일 오전 10시부터 있어요");
    await expect
      .poll(async () => {
        await page.clock.runFor(1);
        return reply.count();
      })
      .toBe(1);
    await expect(reply).toHaveAttribute("data-sender", "WHOLESALER");
    const area = await log(page).boundingBox();
    const box = await reply.boundingBox();
    expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThan(
      (area?.x ?? 0) + (area?.width ?? 0) / 2,
    );
    const gap = await log(page).evaluate(
      (el) => el.scrollHeight - el.scrollTop - el.clientHeight,
    );
    expect(gap).toBeLessThanOrEqual(1);
  });

  test("60개 주입 → hasMore면 기다리지 않고 바로 다음 요청, 누락 0 중복 0", async ({
    page,
  }) => {
    await openRoom(page, "/chats/1");
    await expect(bubbles(page)).toHaveCount(7);
    await pauseClock(page);
    const before = await count(page, MESSAGES_GET);
    await incoming(page, 1, "새 답", { count: 60 });
    await page.clock.runFor(3_000);
    // 시계가 멈춰 있는데도 두 번째 요청이 나간다 = 간격을 기다리지 않았다
    await waitCount(page, MESSAGES_GET, before + 2);
    const urls = (await requests(page, MESSAGES_GET))
      .slice(-2)
      .map((r) => r.url);
    expect(urls[0]).toContain("afterSequence=7");
    expect(urls[1]).toContain("afterSequence=57");
    await settled(page);
    await expect
      .poll(async () => {
        await page.clock.runFor(1);
        return bubbles(page).count();
      })
      .toBe(67);
    expect(await drawnSequences(page)).toEqual(
      Array.from({ length: 67 }, (_, i) => i + 1),
    );
  });
});

test.describe("S6-8 멈춤과 backoff", () => {
  test("탭 숨김 동안 60초 0, 다시 보이면 즉시 1회", async ({ page }) => {
    await openRoom(page, "/chats/1");
    await pauseClock(page);
    await setVisibility(page, "hidden");
    const before = await count(page, MESSAGES_GET);
    await page.clock.runFor(60_000);
    expect(await count(page, MESSAGES_GET)).toBe(before);
    await setVisibility(page, "visible");
    await waitCount(page, MESSAGES_GET, before + 1);
    await settled(page);
    expect(await count(page, MESSAGES_GET)).toBe(before + 1);
  });

  test("오프라인 동안 60초 0, 온라인 복귀 즉시 1회", async ({
    page,
    context,
  }) => {
    await openRoom(page, "/chats/1");
    await pauseClock(page);
    await context.setOffline(true);
    const before = await count(page, MESSAGES_GET);
    await page.clock.runFor(60_000);
    expect(await count(page, MESSAGES_GET)).toBe(before);
    await context.setOffline(false);
    await waitCount(page, MESSAGES_GET, before + 1);
    await settled(page);
    expect(await count(page, MESSAGES_GET)).toBe(before + 1);
  });

  test("fail messages times 5 → 3, 6, 12, 24초(±20%), 다섯 번째 30초 이하, 성공 뒤 3초. 화면엔 안 띄운다", async ({
    page,
  }) => {
    await openRoom(page, "/chats/1");
    await expect(bubbles(page)).toHaveCount(7);
    await pauseClock(page);
    await mock(page, "fail", { op: "messages", times: 5 });
    const before = await count(page, MESSAGES_GET);

    await page.clock.runFor(3_000);
    await waitCount(page, MESSAGES_GET, before + 1);
    await settled(page);
    await flushUntilFailures(page, 1);
    await expectNextPollWithin(page, 2_400, 3_600);
    await flushUntilFailures(page, 2);
    await expectNextPollWithin(page, 4_800, 7_200);
    await flushUntilFailures(page, 3);
    await expectNextPollWithin(page, 9_600, 14_400);
    await flushUntilFailures(page, 4);
    await expectNextPollWithin(page, 19_200, 28_800);
    await flushUntilFailures(page, 5);
    // 다섯 번째 실패 뒤: 기준 30초, 흔들림을 섞어도 30초를 넘지 않는다(24~30초)
    await expectNextPollWithin(page, 24_000, 30_000);
    await flushUntilFailures(page, 0);
    await expectNextPollWithin(page, 3_000, 3_000);

    const statuses = (await requests(page, MESSAGES_GET))
      .slice(-7)
      .map((r) => r.status);
    expect(statuses).toEqual([500, 500, 500, 500, 500, 200, 200]);
    await expect(page.getByText("대화를 불러오지 못했어요")).toHaveCount(0);
    await expect(bubbles(page)).toHaveCount(7);
  });
});

test("S6-9 쓰는 중 polling 갱신 3회 뒤에도 입력 글과 커서 그대로", async ({
  page,
}) => {
  await openRoom(page, "/chats/1");
  const text = "레드 M 30장 오늘 출고 되나요";
  await composer(page).fill(text);
  await composer(page).evaluate((el) =>
    (el as HTMLTextAreaElement).setSelectionRange(5, 5),
  );
  const before = await bubbles(page).count();
  for (const body of ["네", "확인해 볼게요", "오늘 돼요"]) {
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
  ).toEqual([5, 5]);
});

test("S6-11 새 도매 메시지 → live '무드온: 본문', 같은 본문 두 번이면 노드가 두 번 바뀐다, 내 글과 첫 로딩은 안 읽음", async ({
  page,
}) => {
  await openRoom(page, "/chats/1");
  // 05b(#288)부터 소매 보내기에 자동 답이 붙는다. 이 테스트는 "내 글" 낭독만 보므로 이 탭의 자동 답을 끈다
  // (꺼지면 넘김 줄만 생긴다 — SYSTEM 줄은 낭독하지 않고 말풍선 수에도 안 든다)
  await mock(page, "auto-reply", { enabled: false });
  const live = page.locator('[aria-live="polite"][data-ac="S6-11"]');
  await expect(live).toHaveText("");
  await live.evaluate((el) => {
    const w = window as unknown as { __liveSwaps: number };
    w.__liveSwaps = 0;
    new MutationObserver((records) => {
      for (const r of records) if (r.addedNodes.length > 0) w.__liveSwaps += 1;
    }).observe(el, { childList: true });
  });
  const swaps = () =>
    page.evaluate(
      () => (window as unknown as { __liveSwaps: number }).__liveSwaps,
    );

  // 내 글로는 안 바뀐다
  await composer(page).fill("레드 M 있어요?");
  await composer(page).press("Enter");
  await expect(sentBubble(page, "레드 M 있어요?")).toHaveCount(1);
  await page.clock.fastForward(3_000);
  expect(await swaps()).toBe(0);

  for (let i = 1; i <= 2; i++) {
    await incoming(page, 1, "네");
    await page.clock.fastForward(3_000);
    await expect.poll(swaps).toBe(i);
    await expect(live).toHaveText("무드온: 네");
  }
});

test("S6-12 사진 붙여넣기 → 안내, 입력 글 그대로", async ({ page }) => {
  await openRoom(page, "/chats/1");
  await composer(page).fill("레드 M 실물 사진이에요");
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
  await expect(composer(page)).toHaveValue("레드 M 실물 사진이에요");
});

test.describe("S6-13 첫 조회 401", () => {
  for (const op of ["room", "messages"] as const) {
    test(`fail ${op} 401 → 블록 안 끊김 문구 + 로그인하기, 입력창 없음, 주소 그대로, 60초 채팅 요청 0`, async ({
      page,
    }) => {
      await openProduct(page, 11);
      await mock(page, "fail", { op, status: 401, times: 5 });
      await enterRoom(page, 1, "/products/11");
      await expect(
        page.getByText("로그인이 끊겼어요", { exact: true }),
      ).toBeVisible();
      await expect(
        page.getByText("다시 로그인하면 이 대화를 이어서 볼 수 있어요"),
      ).toBeVisible();
      await expect(
        page.getByRole("link", { name: "로그인하기" }),
      ).toHaveAttribute("href", "/login");
      await expect(composer(page)).toHaveCount(0);
      const before = await count(page, ANY_CHAT);
      await page.clock.fastForward(60_000);
      expect(await count(page, ANY_CHAT)).toBe(before);
      expect(page.url()).toContain("/chats/1?from=/products/11");
    });
  }
});

test("S6-14 끊긴 뒤 상품으로 돌아가기 → 새 문서 요청, /login 도착(오류 화면 아님)", async ({
  page,
}) => {
  await openProduct(page, 11);
  await enterRoom(page, 1, "/products/11");
  await composer(page).fill("auth401 레드 M 있어요?");
  await composer(page).press("Enter");
  await expect(appAlert(page).filter({ hasText: SESSION_LOST })).toBeVisible();
  // 서버 세션도 끝났다 — 가짜 API는 쿠키가 없으면 401
  await page.context().clearCookies();
  const documentRequest = page.waitForRequest(
    (r) =>
      r.isNavigationRequest() && new URL(r.url()).pathname === "/products/11",
  );
  await page.getByRole("link", { name: "상품으로 돌아가기" }).click();
  await documentRequest;
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("button", { name: "로그인" })).toBeVisible();
  await expect(page.getByText("문제가 생겼어요")).toHaveCount(0);
});
