import { expect, test, type Page } from "@playwright/test";
import {
  addButton,
  askChip,
  assertStubServers,
  autoBubbles,
  box,
  captureCartPosts,
  captureSends,
  cards,
  CART_POST,
  cartLink,
  choice,
  choiceGroups,
  composer,
  count,
  failCart,
  flushSend,
  handoffLines,
  incoming,
  liveRegion,
  log,
  mock,
  MESSAGES_GET,
  openRoom,
  pageOverflow,
  pauseAfterPoll,
  qtyInput,
  runPolls,
  SEND_POST,
  sendButton,
  signIn,
  slowCart,
  useOwnCart,
  waitCount,
  watchRequests,
} from "./helpers";

/**
 * #288 S8 — 소매 재고 문의 칩, 되묻기 칩, 재고 카드, 장바구니 담기(+ S7-13 소매 조회 시각).
 * 판정은 브라우저 채팅 목(`packages/api/src/mocks/chat/inquiry.ts`), 담기는 가짜 API(3199) 장바구니다.
 * 시간은 `page.clock`. 방 1의 상품 문맥은 목 reset 시각의 2001(빈티지 플라워 셔츠)이다.
 */

assertStubServers();

const ROOM = "/chats/1?from=/products/2001";
const SESSION_LOST = "로그인이 끊겼어요. 다시 로그인하기 전엔 보낼 수 없어요";
const ASK = "이 셔츠 몇 장 남았어요?";
const LABELS = ["레드 / S", "레드 / M", "레드 / L", "네이비 / S", "네이비 / M"];

test.beforeEach(async ({ page }) => {
  await watchRequests(page);
  await page.clock.install({ time: new Date("2026-10-28T10:30:00+09:00") });
  await signIn(page);
  await useOwnCart(page);
});

/** 자유 문장으로 물어 되묻기가 올 때까지. 시드 되묻기(보기 없음)는 칩 줄이 없어 세지 않는다 */
async function askFree(page: Page, text = ASK) {
  const before = await choiceGroups(page).count();
  await composer(page).fill(text);
  await composer(page).press("Enter");
  await expect(choiceGroups(page)).toHaveCount(before + 1);
  // `.last()`는 게으른 locator라 다음 되묻기가 오면 그쪽을 가리킨다 — 자리를 고정한다
  return choiceGroups(page).nth(before);
}

/** 되묻기 → 레드 / M → 카드까지. 시드에 3002 카드가 하나 있어 새 카드는 마지막 것이다 */
async function cardFor3002(page: Page) {
  const group = await askFree(page);
  await choice(group, "레드 / M").click();
  await expect(cards(page, 3002)).toHaveCount(2);
  return cards(page, 3002).last();
}

async function sendText(page: Page, text: string) {
  const before = await count(page, SEND_POST);
  await composer(page).fill(text);
  await composer(page).press("Enter");
  await waitCount(page, SEND_POST, before + 1);
}

test.describe("S8-1 S8-2 재고 문의 칩", () => {
  test("S8-1 상품에서 연 방 → 칩 → POST 1회 {body, inquiry {STOCK, 2001, null…}}. 도매처 홈이나 from 없음이면 칩 0개", async ({
    page,
  }) => {
    const sends = captureSends(page);
    await openRoom(page, ROOM);
    await askChip(page).click();
    await waitCount(page, SEND_POST, 1);
    expect(sends.map((s) => s.body)).toEqual([
      {
        body: "이 상품 몇 장 남았어요?",
        inquiry: {
          intent: "STOCK",
          listingId: 2001,
          variantId: null,
          backorderId: null,
          label: null,
        },
      },
    ]);
    // 칩도 자유 문장과 같은 되묻기를 받는다(장면 2')
    await expect(choiceGroups(page)).toHaveCount(1);

    await openRoom(page, "/chats/1?from=/wholesalers/101");
    await expect(composer(page)).toBeVisible();
    await expect(askChip(page)).toHaveCount(0);
    await openRoom(page, "/chats/1");
    await expect(composer(page)).toBeVisible();
    await expect(askChip(page)).toHaveCount(0);
  });

  test("S8-2 칩 3연타 → POST 1회, 보내는 동안 disabled + aria-busy, 쓰던 '가나다'와 커서 그대로", async ({
    page,
  }) => {
    await openRoom(page, ROOM);
    await composer(page).fill("가나다");
    await composer(page).evaluate((el) =>
      (el as HTMLTextAreaElement).setSelectionRange(1, 1),
    );
    await pauseAfterPoll(page);

    await askChip(page).click();
    // 같은 틱에 두 번 더 — 이미 disabled라 브라우저가 버린다
    await askChip(page).evaluate((el) => {
      (el as HTMLButtonElement).click();
      (el as HTMLButtonElement).click();
    });
    await expect(askChip(page)).toBeDisabled();
    await expect(askChip(page)).toHaveAttribute("aria-busy", "true");
    await expect(composer(page)).toHaveValue("가나다");
    await expect(composer(page)).toBeFocused();
    expect(
      await composer(page).evaluate((el) => [
        (el as HTMLTextAreaElement).selectionStart,
        (el as HTMLTextAreaElement).selectionEnd,
      ]),
    ).toEqual([1, 1]);

    await flushSend(page);
    await expect(choiceGroups(page)).toHaveCount(1);
    await expect(askChip(page)).toBeEnabled();
    expect(await count(page, SEND_POST)).toBe(1);
    await expect(composer(page)).toHaveValue("가나다");
  });
});

test.describe("S8-3 S8-4 S8-12 되묻기와 카드", () => {
  test("S8-3 polling 0회 — 보내기 응답만으로 내 말풍선 바로 아래 되묻기 + 칩 5개, 자동 답변, 조회 시각", async ({
    page,
  }) => {
    await openRoom(page, ROOM);
    await pauseAfterPoll(page);
    const polls = await count(page, MESSAGES_GET);

    await composer(page).fill(ASK);
    await composer(page).press("Enter");
    await flushSend(page);

    const clarify = autoBubbles(page, "CLARIFY").last();
    await expect(clarify).toContainText("어떤 색상, 사이즈요?");
    await expect(clarify).toContainText("자동 답변");
    await expect(clarify.getByText(/^\d{2}:\d{2} 조회$/)).toBeVisible();
    const group = clarify.getByRole("group", { name: "색상, 사이즈 고르기" });
    await expect(group.getByRole("button")).toHaveText(LABELS);
    for (const label of LABELS)
      await expect(choice(group, label)).toBeEnabled();
    // 내 말풍선 바로 다음 형제가 이 되묻기다
    const previous = await clarify.evaluate(
      (el) => el.previousElementSibling?.textContent ?? "",
    );
    expect(previous).toContain(ASK);
    expect(await count(page, MESSAGES_GET)).toBe(polls);
  });

  test("S8-4 칩 레드 / M → POST {body: 칩 글자, inquiry.variantId 3002} → 카드, 칩 5개 잠김, 레드 / M만 고름", async ({
    page,
  }) => {
    const sends = captureSends(page);
    await openRoom(page, ROOM);
    const group = await askFree(page);
    await choice(group, "레드 / M").click();
    await waitCount(page, SEND_POST, 2);
    expect(sends[1]?.body).toEqual({
      body: "레드 / M",
      inquiry: {
        intent: "STOCK",
        listingId: 2001,
        variantId: 3002,
        backorderId: null,
        label: "레드 / M",
      },
    });

    await expect(cards(page, 3002)).toHaveCount(2);
    const card = cards(page, 3002).last();
    await expect(card).toContainText(
      "레드 / M 재고 10~49장, 지금 주문할 수 있어요, 한 번에 최대 500장",
    );
    const reply = autoBubbles(page, "AUTO_REPLY").last();
    await expect(reply).toContainText("자동 답변");
    await expect(reply.getByText(/^\d{2}:\d{2} 조회$/)).toBeVisible();
    await expect(qtyInput(card, "레드 / M")).toHaveValue("1");

    for (const label of LABELS)
      await expect(choice(group, label)).toBeDisabled();
    await expect(choice(group, "레드 / M")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(choice(group, "레드 / M")).toHaveAccessibleName(
      "레드 / M (고름)",
    );
    await expect(group.locator('[aria-pressed="true"]')).toHaveCount(1);
  });

  test("S8-12 live 영역: 되묻기 → '무드온 자동 답변: 어떤 색상, 사이즈요?', 내 칩 보내기로는 그대로, 응답 자동 답으로 바뀐다", async ({
    page,
  }) => {
    await openRoom(page, ROOM);
    const group = await askFree(page);
    await expect(liveRegion(page)).toHaveText(
      "무드온 자동 답변: 어떤 색상, 사이즈요?",
    );
    await pauseAfterPoll(page);
    await choice(group, "레드 / M").click();
    await expect(log(page).locator("[data-pending]")).toHaveCount(1);
    await expect(liveRegion(page)).toHaveText(
      "무드온 자동 답변: 어떤 색상, 사이즈요?",
    );
    await flushSend(page);
    await expect(liveRegion(page)).toHaveText(
      "무드온 자동 답변: 레드 M은 10~49장 있어요. 지금 주문할 수 있어요(한 번에 최대 500장)",
    );
  });
});

test.describe("S8-5 ~ S8-8 장바구니 담기", () => {
  test("S8-5 담기 → POST {3002, 1} 1회 → 담았어요 + 장바구니 보기, 헤더 0 → 1. 또 담으면 '(지금 2장)', 헤더 1", async ({
    page,
  }) => {
    const posts = captureCartPosts(page);
    await openRoom(page, ROOM);
    await expect(cartLink(page, 0)).toBeVisible();
    const card = await cardFor3002(page);

    await addButton(card).click();
    await expect(card.getByRole("status")).toHaveText(
      "장바구니에 담았어요장바구니 보기",
    );
    await expect(
      card.getByRole("link", { name: "장바구니 보기" }),
    ).toHaveAttribute("href", "/cart");
    await expect(cartLink(page, 1)).toBeVisible();
    expect(posts).toEqual([{ variantId: 3002, qty: 1 }]);

    await addButton(card).click();
    await expect(card.getByRole("status")).toContainText(
      "장바구니에 담았어요(지금 2장)",
    );
    await expect(cartLink(page, 1)).toBeVisible();
    expect(posts).toHaveLength(2);
  });

  test("S8-6 수량 0, 빈칸, abc, 2.5, -1, 501 → 잠김 + 이유, 글자 그대로, POST 0. 500 → qty 500 1회", async ({
    page,
  }) => {
    const posts = captureCartPosts(page);
    await openRoom(page, ROOM);
    const card = await cardFor3002(page);
    const input = qtyInput(card, "레드 / M");
    const cases: [string, string][] = [
      ["0", "1장 이상 넣어 주세요"],
      ["", "1장 이상 넣어 주세요"],
      ["abc", "숫자만 넣을 수 있어요(소수점, 부호는 못 받아요)"],
      ["2.5", "숫자만 넣을 수 있어요(소수점, 부호는 못 받아요)"],
      ["-1", "숫자만 넣을 수 있어요(소수점, 부호는 못 받아요)"],
      ["501", "한 번에 500장까지 담을 수 있어요"],
    ];
    for (const [text, reason] of cases) {
      await input.fill(text);
      await expect(input).toHaveValue(text);
      await expect(addButton(card)).toBeDisabled();
      await expect(card.getByText(reason, { exact: true })).toBeVisible();
      await expect(input).toHaveAttribute("aria-invalid", "true");
    }
    expect(posts).toHaveLength(0);

    await input.fill("500");
    await expect(addButton(card)).toBeEnabled();
    await addButton(card).click();
    await expect(card.getByRole("status")).toBeVisible();
    expect(posts).toEqual([{ variantId: 3002, qty: 500 }]);
  });

  test("S8-7 누르는 즉시 담는 중 + disabled, 3연타 POST 1회. 500 → 다시 눌러 주세요, 수량 그대로, 다시 누르면 1회", async ({
    page,
  }) => {
    await openRoom(page, ROOM);
    const card = await cardFor3002(page);
    await qtyInput(card, "레드 / M").fill("30");
    await failCart(page, 500);

    await addButton(card).evaluate((el) => {
      (el as HTMLButtonElement).click();
      (el as HTMLButtonElement).click();
      (el as HTMLButtonElement).click();
    });
    await expect(card.getByRole("alert")).toHaveText(
      "장바구니에 담지 못했어요. 다시 눌러 주세요",
    );
    expect(await count(page, CART_POST)).toBe(1);
    await expect(qtyInput(card, "레드 / M")).toHaveValue("30");

    // 담는 중은 응답 전까지 — 가짜 API가 응답을 붙잡아 둔 동안 버튼 글과 잠김을 본다
    await slowCart(page, 2_000);
    await addButton(card).click();
    await expect(addButton(card)).toHaveText("담는 중");
    await expect(addButton(card)).toBeDisabled();
    await expect(addButton(card)).toHaveAttribute("aria-busy", "true");
    await expect(card.getByRole("alert")).toHaveCount(0);
    await expect(card.getByRole("status")).toContainText("장바구니에 담았어요");
    await expect(addButton(card)).toHaveText("장바구니에 담기");
    expect(await count(page, CART_POST)).toBe(2);
  });

  test("S8-8 담기 401 → 주소 그대로, 끊김 문구, 보내기, 담기, 칩 잠김, 입력창 글과 수량 그대로", async ({
    page,
  }) => {
    await openRoom(page, ROOM);
    const card = await cardFor3002(page);
    await qtyInput(card, "레드 / M").fill("30");
    await composer(page).fill("가나다");
    await failCart(page, 401);

    await addButton(card).click();
    await expect(page.getByText(SESSION_LOST)).toBeVisible();
    await expect(page).toHaveURL(ROOM);
    await expect(composer(page)).toHaveValue("가나다");
    await expect(sendButton(page)).toBeDisabled();
    await expect(addButton(card)).toBeDisabled();
    await expect(qtyInput(card, "레드 / M")).toHaveValue("30");
    await expect(qtyInput(card, "레드 / M")).toBeDisabled();
    await expect(askChip(page)).toBeDisabled();
    // 카드 안에 따로 문구를 띄우지 않는다(결정 29)
    await expect(card.getByRole("alert")).toHaveCount(0);
  });

  test("S8-8 담기 403 → /approval 로 보낸다", async ({ page }) => {
    await openRoom(page, ROOM);
    const card = await cardFor3002(page);
    await failCart(page, 403);
    const approval = page.waitForRequest((r) =>
      new URL(r.url()).pathname.startsWith("/approval"),
    );
    await addButton(card).click();
    await approval;
  });
});

test.describe("S8-9 S8-10 재고 없음, 협상어", () => {
  test("S8-9 '레드 L 몇 장 있어요' → 카드 재고 없음, 담기 disabled, 수량 칸 없음, 바로 아래 넘김 줄, POST 0, '미송' 0", async ({
    page,
  }) => {
    await openRoom(page, ROOM);
    await sendText(page, "레드 L 몇 장 있어요");
    const card = cards(page, 3003);
    await expect(card).toHaveCount(1);
    await expect(card).toContainText("레드 / L 재고 없음");
    const reply = autoBubbles(page, "AUTO_REPLY").last();
    await expect(reply).toContainText("지금은 재고가 없어요");
    await expect(addButton(card)).toBeDisabled();
    await expect(card.getByRole("textbox")).toHaveCount(0);
    const next = await reply.evaluate(
      (el) => (el.nextElementSibling as HTMLElement | null)?.dataset.kind,
    );
    expect(next).toBe("HANDOFF");
    await expect(handoffLines(page).last()).toContainText(
      "사장님께 전달했어요",
    );
    await addButton(card).click({ force: true });
    expect(await count(page, CART_POST)).toBe(0);
    await expect(log(page)).not.toContainText("미송");
  });

  test("S8-10 '레드 M 10장 사면 깎아 주세요' → 넘김 줄만, 카드와 칩 0개", async ({
    page,
  }) => {
    await openRoom(page, ROOM);
    const handoffs = await handoffLines(page).count();
    const replies = await autoBubbles(page, "AUTO_REPLY").count();
    const clarifies = await autoBubbles(page, "CLARIFY").count();
    await sendText(page, "레드 M 10장 사면 깎아 주세요");
    await expect(handoffLines(page)).toHaveCount(handoffs + 1);
    await expect(handoffLines(page).last()).toHaveText(/사장님께 전달했어요/);
    await expect(autoBubbles(page, "AUTO_REPLY")).toHaveCount(replies);
    await expect(autoBubbles(page, "CLARIFY")).toHaveCount(clarifies);
    await expect(choiceGroups(page)).toHaveCount(0);
  });
});

test.describe("S8-11 넘친 방 — 가려진 대상", () => {
  /** 되묻기 2 + 카드 3(새로) + 넘김 1 */
  async function crowd(page: Page) {
    await openRoom(page, ROOM);
    const group = await askFree(page);
    await choice(group, "레드 / M").click();
    await expect(cards(page, 3002)).toHaveCount(2);
    await sendText(page, "네이비 S 몇 장 있어요");
    await expect(cards(page, 3004)).toHaveCount(1);
    await sendText(page, "레드 L 몇 장 있어요");
    await expect(cards(page, 3003)).toHaveCount(1);
    await askFree(page);
    await expect(choiceGroups(page)).toHaveCount(2);
  }

  for (const viewport of [
    { width: 1470, height: 900 },
    { width: 390, height: 844 },
  ]) {
    test(`S8-11 ${viewport.width}x${viewport.height} 페이지 세로 ≤1px, 가로 0, 맨 아래에서 마지막 카드 담기가 입력창 위`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await crowd(page);
      await log(page).evaluate((el) => {
        el.scrollTop = el.scrollHeight;
      });
      const overflow = await pageOverflow(page);
      expect(overflow.y).toBeLessThanOrEqual(1);
      expect(overflow.x).toBe(0);
      const lastAdd = await box(addButton(cards(page).last()));
      const input = await box(composer(page));
      const chipRow = await box(askChip(page));
      expect(lastAdd.y + lastAdd.height).toBeLessThanOrEqual(
        Math.min(input.y, chipRow.y),
      );
      // 아래끝 비교만으론 화면 위로 밀려난 버튼도 통과한다(codex-meta M5). 가운데 점을 실제로 누가
      // 차지하는지, 그 점이 메시지 영역 안인지까지 본다. 마지막 카드는 재고 0이라 버튼이 비활성이고,
      // Button의 disabled:pointer-events-none 때문에 그대로 찍으면 아래 요소가 잡힌다. 잠깐 auto로 두고
      // 찍는다 — 보려는 건 누를 수 있느냐가 아니라 그 자리에 다른 게 덮여 있지 않느냐다
      const logHandle = await log(page).elementHandle();
      const hit = await addButton(cards(page).last()).evaluate(
        (button, logEl) => {
          const r = button.getBoundingClientRect();
          const x = r.left + r.width / 2;
          const y = r.top + r.height / 2;
          const area = (logEl as HTMLElement).getBoundingClientRect();
          const prev = (button as HTMLElement).style.pointerEvents;
          (button as HTMLElement).style.pointerEvents = "auto";
          const el = document.elementFromPoint(x, y);
          (button as HTMLElement).style.pointerEvents = prev;
          return {
            isButton: el !== null && (el === button || button.contains(el)),
            inLog: (logEl as HTMLElement).contains(button),
            inArea:
              x >= area.left &&
              x <= area.right &&
              y >= area.top &&
              y <= area.bottom,
          };
        },
        logHandle,
      );
      expect(hit).toEqual({ isButton: true, inLog: true, inArea: true });

      if (viewport.width === 390) {
        const group = choiceGroups(page).last();
        const chips = group.getByRole("button");
        for (const chip of await chips.all())
          expect((await box(chip)).height).toBeGreaterThanOrEqual(44);
        expect((await box(askChip(page))).height).toBeGreaterThanOrEqual(44);
        // 줄바꿈 — 칩 줄이 칩 하나보다 높다
        expect((await box(group)).height).toBeGreaterThan(
          (await box(chips.first())).height,
        );
        // 칩 줄이 말풍선 밖으로 넘치지 않는다
        const bubble = await box(autoBubbles(page, "CLARIFY").last());
        const groupBox = await box(group);
        expect(groupBox.x + groupBox.width).toBeLessThanOrEqual(
          bubble.x + bubble.width + 1,
        );
      }
    });
  }
});

test.describe("S8-14 S8-15 S8-16 polling, 다시 보내기, 칩 잠금", () => {
  test("S8-14 응답의 되묻기 뒤 polling 3회 → 같은 sequence 말풍선 1개씩, 오름차순", async ({
    page,
  }) => {
    await openRoom(page, ROOM);
    await askFree(page);
    await pauseAfterPoll(page);
    await runPolls(page, 3);
    const sequences = await log(page)
      .locator("[data-sequence]")
      .evaluateAll((nodes) =>
        nodes.map((n) => Number((n as HTMLElement).dataset.sequence)),
      );
    expect(new Set(sequences).size).toBe(sequences.length);
    expect([...sequences].sort((a, b) => a - b)).toEqual(sequences);
    await expect(choiceGroups(page)).toHaveCount(1);
  });

  test("S8-15 옵션 칩 보내기 500 → 다시 보내기: 같은 키, 같은 {body, inquiry}. 그동안 줄은 고른 채 잠김", async ({
    page,
  }) => {
    const sends = captureSends(page);
    await openRoom(page, ROOM);
    const group = await askFree(page);
    await mock(page, "fail", { op: "send", status: 500 });
    await choice(group, "레드 / M").click();
    const failed = log(page).locator('[data-pending="failed"]');
    await expect(failed).toHaveCount(1);
    for (const label of LABELS)
      await expect(choice(group, label)).toBeDisabled();
    await expect(choice(group, "레드 / M")).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    await failed.getByRole("button", { name: "다시 보내기" }).click();
    await waitCount(page, SEND_POST, 3);
    await expect(cards(page, 3002)).toHaveCount(2);
    const [first, second] = sends.slice(1);
    expect(second?.key).toBe(first?.key);
    expect(second?.body).toEqual(first?.body);
    expect(first?.body).toEqual({
      body: "레드 / M",
      inquiry: {
        intent: "STOCK",
        listingId: 2001,
        variantId: 3002,
        backorderId: null,
        label: "레드 / M",
      },
    });
  });

  test("S8-16 되묻기 뒤 도매 사람 답 → 칩 전부 disabled. 같은 상품 재문의 → 새 칩만 활성", async ({
    page,
  }) => {
    await openRoom(page, ROOM);
    const first = await askFree(page);
    await incoming(page, 1, "잠시만요, 확인해 드릴게요");
    await expect(log(page)).toContainText("잠시만요, 확인해 드릴게요");
    for (const label of LABELS)
      await expect(choice(first, label)).toBeDisabled();
    await expect(first.locator('[aria-pressed="true"]')).toHaveCount(0);

    const second = await askFree(page);
    for (const label of LABELS) {
      await expect(choice(first, label)).toBeDisabled();
      await expect(choice(second, label)).toBeEnabled();
    }
  });
});

test("S7-13 소매 조회 시각 — 시드와 새 자동 답 말풍선 전부 'HH:mm 조회'", async ({
  page,
}) => {
  await openRoom(page, ROOM);
  await cardFor3002(page);
  const autos = log(page).locator(
    '[data-kind="CLARIFY"], [data-kind="AUTO_REPLY"]',
  );
  const n = await autos.count();
  expect(n).toBeGreaterThanOrEqual(4);
  for (const bubble of await autos.all())
    await expect(bubble.getByText(/^\d{2}:\d{2} 조회$/)).toHaveCount(1);
});
