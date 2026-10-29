import { expect, test, type Page } from "@playwright/test";
import {
  addButton,
  askChip,
  assertStubServers,
  autoBubbles,
  box,
  captureCartPosts,
  cards,
  CART_POST,
  cartLink,
  choice,
  choiceGroups,
  composer,
  count,
  enterRoom,
  failCart,
  handoffLines,
  incoming,
  inquiryButton,
  log,
  mock,
  openRoom,
  pageOverflow,
  qtyInput,
  resetMock,
  SEND_POST,
  sendButton,
  signIn,
  useOwnCart,
  waitCount,
  watchRequests,
} from "./helpers";

/**
 * loop-05b-stock-reply QA(소매). `pnpm e2e:stub`으로 돈다(이름에 `retail`이 있어 stub 설정이 잡는다).
 * 개발 spec(`retail-stock-reply.spec.ts`)이 안 본 것만 더한다: 누출(DOM + 응답 본문 전부), 같은 틱 연타,
 * 숫자 입력 나머지 값, 왕복 뒤 수량 유지, 카드마다 자기 variant, 디자인 토큰 실측, 사장 시나리오 스크린샷.
 * 스크린샷은 `.claude/harness/runs/loop-05b-stock-reply/qa/`.
 */

assertStubServers();

const QA = ".claude/harness/runs/loop-05b-stock-reply/qa";
const ROOM = "/chats/1?from=/products/2001";
const ASK = "이 셔츠 몇 장 남았어요?";
const SESSION_LOST = "로그인이 끊겼어요. 다시 로그인하기 전엔 보낼 수 없어요";
/** 도매 상품 목 시드의 판매가능 수량(3001 40, 3002 35, 3004 20, 3005 18)이 글자로 새면 안 된다 */
const EXACT = ["40장", "35장", "20장", "18장", "availableQty"];

test.beforeEach(async ({ page }) => {
  await watchRequests(page);
  await page.clock.install({ time: new Date("2026-10-28T10:20:00+09:00") });
  await signIn(page);
  await useOwnCart(page);
});

/** 브라우저 fetch 응답 본문을 전부 남긴다(MSW가 답한 채팅 응답 포함). 문서와 RSC는 page.on('response')가 받는다 */
async function recordBodies(
  page: Page,
): Promise<() => Promise<{ url: string; text: string }[]>> {
  await page.addInitScript(() => {
    const store: { url: string; text: string }[] = [];
    (window as unknown as { __qaBodies: typeof store }).__qaBodies = store;
    const original = window.fetch.bind(window);
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const response = await original(input, init);
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input.url;
      response
        .clone()
        .text()
        .then((text) => store.push({ url, text }))
        .catch(() => undefined);
      return response;
    };
  });
  const docs: { url: string; text: string }[] = [];
  page.on("response", async (r) => {
    const type = r.request().resourceType();
    if (type !== "document" && type !== "fetch") return;
    try {
      docs.push({ url: r.url(), text: await r.text() });
    } catch {
      /* 리다이렉트 등 본문 없는 응답 */
    }
  });
  return async () => {
    const inPage = await page
      .evaluate(
        () =>
          (
            window as unknown as {
              __qaBodies?: { url: string; text: string }[];
            }
          ).__qaBodies ?? [],
      )
      .catch(() => []);
    return [...docs, ...inPage];
  };
}

function hits(text: string): string[] {
  return EXACT.filter((w) => text.includes(w));
}

async function askFree(page: Page, text = ASK) {
  const before = await choiceGroups(page).count();
  await composer(page).fill(text);
  await composer(page).press("Enter");
  await expect(choiceGroups(page)).toHaveCount(before + 1);
  return choiceGroups(page).nth(before);
}

async function sendText(page: Page, text: string) {
  const before = await count(page, SEND_POST);
  await composer(page).fill(text);
  await composer(page).press("Enter");
  await waitCount(page, SEND_POST, before + 1);
}

async function cardFor3002(page: Page) {
  const group = await askFree(page);
  await choice(group, "레드 / M").click();
  await expect(cards(page, 3002)).toHaveCount(2);
  return cards(page, 3002).last();
}

test.describe("사장 시나리오 (a) 장면 1 소매 절반 + 누출", () => {
  test("상품 상세 → 문의하기 → 자유 문장 → 칩 5 → 레드 / M → 10~49장 → 담기 → 헤더 1 → /cart, 정확 수량 0", async ({
    page,
  }) => {
    const bodies = await recordBodies(page);
    await page.goto("/products/2001");
    await expect(inquiryButton(page)).toBeVisible();
    await resetMock(page);
    await expect(cartLink(page, 0)).toBeVisible();
    await enterRoom(page, 1, "/products/2001");

    await composer(page).fill(ASK);
    await composer(page).press("Enter");
    await expect(choiceGroups(page)).toHaveCount(1);
    const group = choiceGroups(page).first();
    await expect(group.getByRole("button")).toHaveCount(5);
    await page.screenshot({ path: `${QA}/a1-clarify-1470.png` });

    await choice(group, "레드 / M").click();
    await expect(cards(page, 3002)).toHaveCount(2);
    const card = cards(page, 3002).last();
    await expect(card).toContainText("레드 / M 재고 10~49장");
    await addButton(card).click();
    await expect(card.getByRole("status")).toContainText("장바구니에 담았어요");
    await expect(cartLink(page, 1)).toBeVisible();
    await page.screenshot({ path: `${QA}/a2-card-added-1470.png` });

    // 방 화면 DOM: 보이는 글자와 속성 전부
    const html = await page.content();
    expect(hits(html), "방 DOM에 정확 수량").toEqual([]);

    await card
      .getByRole("link", { name: "장바구니 보기", exact: true })
      .click();
    await expect(page).toHaveURL("/cart");
    await expect(
      page.getByText("빈티지 플라워 셔츠", { exact: true }).first(),
    ).toBeVisible();
    await page.screenshot({ path: `${QA}/a3-cart-1470.png` });

    const leaked = (await bodies()).flatMap((b) =>
      hits(b.text).map((w) => `${new URL(b.url, "http://x").pathname} ${w}`),
    );
    // 채팅 응답(MSW)이 실제로 기록됐는지 — 빈 검사 방지
    const chatBodies = (await bodies()).filter((b) =>
      /\/api\/retail\/chat\//.test(b.url),
    );
    expect(chatBodies.length).toBeGreaterThan(0);
    expect(
      chatBodies.some(
        (b) => b.text.includes("10~49") || b.text.includes("UNDER_50"),
      ),
    ).toBe(true);
    expect(leaked, "응답 본문의 정확 수량").toEqual([]);
  });
});

test.describe("사장 시나리오 (b) (c) 재고 0, 협상어", () => {
  test("(b) 레드 L → 담기 disabled + 사장님께 전달했어요, 페이지 전체 '미송' 0", async ({
    page,
  }) => {
    await openRoom(page, ROOM);
    await sendText(page, "레드 L 몇 장 있어요");
    const card = cards(page, 3003);
    await expect(card).toHaveCount(1);
    await expect(addButton(card)).toBeDisabled();
    await expect(handoffLines(page).last()).toContainText(
      "사장님께 전달했어요",
    );
    await card.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${QA}/b-stock-none-1470.png` });
    const bodyText = await page.locator("body").innerText();
    expect(bodyText.includes("미송")).toBe(false);
  });

  for (const text of [
    "레드 M 할인 되나요?",
    "네고 돼요? 레드 M 몇 장",
    "레드 M 반품 되나요",
  ]) {
    test(`(c) "${text}" → 넘김 줄만, 새 카드와 칩 0`, async ({ page }) => {
      await openRoom(page, ROOM);
      const handoffs = await handoffLines(page).count();
      const cardCount = await cards(page).count();
      await sendText(page, text);
      await expect(handoffLines(page)).toHaveCount(handoffs + 1);
      await expect(cards(page)).toHaveCount(cardCount);
      await expect(choiceGroups(page)).toHaveCount(0);
    });
  }
});

test("(d) 소매 탭 근사: 자동 답 꺼짐 → 같은 문의 넘김만 → 켬 → 자동 답 카드", async ({
  page,
}) => {
  // 소매 탭 목과 도매 탭 목은 저장소가 따로라 도매 스위치가 이 탭에 닿지 않는다(01-plan §2-2). 손잡이로 근사
  await openRoom(page, ROOM);
  await mock(page, "auto-reply", { enabled: false });
  const handoffs = await handoffLines(page).count();
  const cardCount = await cards(page).count();
  await sendText(page, "레드 M 몇 장 있어요");
  await expect(handoffLines(page)).toHaveCount(handoffs + 1);
  await expect(cards(page)).toHaveCount(cardCount);
  await mock(page, "auto-reply", { enabled: true });
  await sendText(page, "레드 M 몇 장 있어요");
  await expect(cards(page)).toHaveCount(cardCount + 1);
  await expect(cards(page).last()).toContainText("레드 / M 재고 10~49장");
});

test("(e) 담기 401 → 쓰던 글, 수량 그대로, /login 이동 0, 칩 잠김", async ({
  page,
}) => {
  const navigations: string[] = [];
  page.on("framenavigated", (f) => {
    if (f === page.mainFrame()) navigations.push(new URL(f.url()).pathname);
  });
  await openRoom(page, ROOM);
  const group = await askFree(page);
  await choice(group, "레드 / M").click();
  await expect(cards(page, 3002)).toHaveCount(2);
  const card = cards(page, 3002).last();
  // 새 되묻기를 하나 더 받아 활성 칩 줄을 만든 뒤 401 — 그 줄도 잠겨야 한다(결정 29)
  const second = await askFree(page);
  await expect(choice(second, "레드 / S")).toBeEnabled();
  await qtyInput(card, "레드 / M").fill("12");
  await composer(page).fill("내일 들를게요");
  await failCart(page, 401);
  const before = navigations.length;
  await addButton(card).click();
  await expect(page.getByText(SESSION_LOST, { exact: true })).toBeVisible();
  expect(
    navigations.slice(before).filter((p) => p.startsWith("/login")),
  ).toEqual([]);
  await expect(page).toHaveURL(ROOM);
  await expect(composer(page)).toHaveValue("내일 들를게요");
  await expect(qtyInput(card, "레드 / M")).toHaveValue("12");
  await expect(sendButton(page)).toBeDisabled();
  await expect(askChip(page)).toBeDisabled();
  await expect(choice(second, "레드 / S")).toBeDisabled();
  await page.screenshot({ path: `${QA}/e-cart-401-1470.png` });
});

test.describe("반복 4패턴 나머지 값", () => {
  test("#1 숫자: 45.5, 1e5, -3, 전각 １０, 20자리 → 잠김 + 이유, 글자 그대로, POST 0", async ({
    page,
  }) => {
    const posts = captureCartPosts(page);
    await openRoom(page, ROOM);
    const card = await cardFor3002(page);
    const input = qtyInput(card, "레드 / M");
    for (const text of ["45.5", "1e5", "-3", "１０", "99999999999999999999"]) {
      await input.fill(text);
      await expect(input).toHaveValue(text);
      await expect(addButton(card)).toBeDisabled();
      await expect(input).toHaveAttribute("aria-invalid", "true");
    }
    // 못 읽는 값에서 ± 는 잠긴다(45.5 → + → 1 로 바뀌지 않는다)
    await input.fill("45.5");
    await expect(
      card.getByRole("button", { name: "레드 / M 수량 1 늘리기", exact: true }),
    ).toBeDisabled();
    expect(posts).toHaveLength(0);
  });

  test("#2 가려진 대상: 넘친 방에서 위쪽 카드의 담기는 그 카드 variant 로만 간다", async ({
    page,
  }) => {
    const posts = captureCartPosts(page);
    await openRoom(page, ROOM);
    const group = await askFree(page);
    await choice(group, "레드 / M").click();
    await expect(cards(page, 3002)).toHaveCount(2);
    await sendText(page, "네이비 S 몇 장 있어요");
    await expect(cards(page, 3004)).toHaveCount(1);
    await sendText(page, "네이비 M 몇 장 있어요");
    await expect(cards(page, 3005)).toHaveCount(1);
    // 화면 밖으로 밀린 시드 카드(첫 3002)를 눌러도 3002 하나
    await addButton(cards(page, 3002).first()).click();
    await expect(cards(page, 3002).first().getByRole("status")).toBeVisible();
    await addButton(cards(page, 3004)).click();
    await expect(cards(page, 3004).getByRole("status")).toBeVisible();
    expect(posts).toEqual([
      { variantId: 3002, qty: 1 },
      { variantId: 3004, qty: 1 },
    ]);
  });

  test("#3 왕복: 카드 수량 30을 친 뒤 도매 답이 오고 새 질문을 보내도 30 그대로, 칩 고를 때 입력창 글 그대로", async ({
    page,
  }) => {
    await openRoom(page, ROOM);
    const card = await cardFor3002(page);
    await qtyInput(card, "레드 / M").fill("30");
    await incoming(page, 1, "네 확인했습니다");
    await expect(log(page)).toContainText("네 확인했습니다");
    const group = await askFree(page);
    await expect(qtyInput(card, "레드 / M")).toHaveValue("30");
    await composer(page).fill("쓰던 글");
    await choice(group, "네이비 / M").click();
    await expect(cards(page, 3005)).toHaveCount(1);
    await expect(composer(page)).toHaveValue("쓰던 글");
    await expect(qtyInput(card, "레드 / M")).toHaveValue("30");
  });

  /*
   * 같은 틱 3연타(el.click() 세 번을 한 task 안에서). S8-7 담기와 S9-2 스위치는 ref/useSingleFlight 로 이걸 막고
   * 개발 spec 도 같은 방식으로 검사한다. 두 칩은 막는 장치가 없다 — 보류 말풍선 state 가 다음 렌더에야 칩을
   * disabled 로 만들기 때문. 결함 F2(04-qa.md)로 올렸고 #288 수정에서 test.fail 을 뗐다.
   * 실제 마우스 더블클릭(CDP 입력 이벤트 2개)은 아래 dblclick 테스트가 따로 본다.
   */
  for (const target of ["재고 문의 칩", "옵션 칩 레드 / M"] as const) {
    test(`#4 같은 틱 3연타: ${target} → 보내기 POST 1회`, async ({ page }) => {
      await openRoom(page, ROOM);
      const chip =
        target === "재고 문의 칩"
          ? askChip(page)
          : choice(await askFree(page), "레드 / M");
      const before = await count(page, SEND_POST);
      // 잡은 요소 증거(규칙 8)
      const caught = await chip.evaluate((el) => ({
        tag: el.tagName,
        text: el.textContent,
        dataAc: el.getAttribute("data-ac"),
        url: location.pathname + location.search,
      }));
      test
        .info()
        .annotations.push({
          type: "caught",
          description: JSON.stringify(caught),
        });
      await chip.evaluate((el) => {
        (el as HTMLButtonElement).click();
        (el as HTMLButtonElement).click();
        (el as HTMLButtonElement).click();
      });
      await expect(log(page).locator("[data-pending]")).toHaveCount(0);
      await expect
        .poll(() => count(page, SEND_POST), { timeout: 3_000 })
        .toBeGreaterThan(before);
      // 응답이 다 올 때까지 잠깐 더 본다(늦게 나간 두 번째, 세 번째 POST)
      await page.waitForTimeout(1_000);
      const sent = (await count(page, SEND_POST)) - before;
      test
        .info()
        .annotations.push({ type: "posts", description: String(sent) });
      expect(sent).toBe(1);
    });
  }

  for (const target of ["재고 문의 칩", "옵션 칩 레드 / M"] as const) {
    test(`#4 실제 더블클릭(dblclick): ${target} → 보내기 POST 1회`, async ({
      page,
    }) => {
      await openRoom(page, ROOM);
      const chip =
        target === "재고 문의 칩"
          ? askChip(page)
          : choice(await askFree(page), "레드 / M");
      const before = await count(page, SEND_POST);
      await chip.dblclick();
      await expect(log(page).locator("[data-pending]")).toHaveCount(0);
      await page.waitForTimeout(1_000);
      const sent = (await count(page, SEND_POST)) - before;
      test
        .info()
        .annotations.push({ type: "posts", description: String(sent) });
      expect(sent).toBe(1);
    });
  }
});

test.describe("390 넘친 방과 디자인 실측", () => {
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

  test("390x844 넘친 방: 가로 0, 칩 44, 맨 아래 카드 담기가 입력창에 안 가림(elementFromPoint)", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await crowd(page);
    await log(page).evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    const overflow = await pageOverflow(page);
    expect(overflow.x).toBe(0);
    expect(overflow.y).toBeLessThanOrEqual(1);
    await page.screenshot({ path: `${QA}/390-crowded-bottom.png` });
    for (const chip of await choiceGroups(page)
      .last()
      .getByRole("button")
      .all())
      expect((await box(chip)).height).toBeGreaterThanOrEqual(44);
    expect((await box(askChip(page))).height).toBeGreaterThanOrEqual(44);
    // 담기 버튼 각각을 보이게 한 뒤 그 가운데 점을 실제로 누가 차지하나
    for (const variant of [3002, 3004]) {
      const button = addButton(cards(page, variant).last());
      await button.scrollIntoViewIfNeeded();
      const b = await box(button);
      expect(b.height).toBeGreaterThanOrEqual(44);
      const top = await page.evaluate(
        ([x, y]) => {
          const el = document.elementFromPoint(x as number, y as number);
          return el?.closest("button")?.textContent ?? el?.tagName ?? null;
        },
        [b.x + b.width / 2, b.y + b.height / 2],
      );
      expect(top, `${variant} 담기 가운데 점`).toBe("장바구니에 담기");
      const input = await box(composer(page));
      expect(b.y + b.height).toBeLessThanOrEqual(input.y);
    }
    await page.screenshot({ path: `${QA}/390-crowded-card.png` });
  });

  async function measureCard(page: Page) {
    await openRoom(page, ROOM);
    const card = await cardFor3002(page);
    await addButton(card).click();
    await expect(card.getByRole("status")).toBeVisible();
    const group = choiceGroups(page).first();
    const m = await page.evaluate(() => {
      const g = document.querySelector(
        '[role="group"][aria-label="색상, 사이즈 고르기"]',
      ) as HTMLElement;
      const chip = g.querySelector("button") as HTMLElement;
      const cards = document.querySelectorAll("[data-variant-id]");
      const c = cards[cards.length - 1] as HTMLElement;
      const line = c.firstElementChild as HTMLElement;
      const strong = line.querySelector("b") as HTMLElement;
      const status = c.querySelector('[role="status"]') as HTMLElement;
      const btn = c.querySelector("button[data-ac]") as HTMLElement;
      const cs = (el: Element) => getComputedStyle(el);
      return {
        chipH: chip.getBoundingClientRect().height,
        chipRadius: cs(chip).borderTopLeftRadius,
        gap: cs(g).columnGap,
        cardBorder: cs(c).borderTopWidth,
        cardPad: cs(c).paddingTop,
        cardGap: cs(c).rowGap,
        lineSize: cs(line).fontSize,
        lineColor: cs(line).color,
        strongWeight: cs(strong).fontWeight,
        strongColor: cs(strong).color,
        statusSize: cs(status).fontSize,
        btnH: btn.getBoundingClientRect().height,
        btnRadius: cs(btn).borderTopLeftRadius,
      };
    });
    test
      .info()
      .annotations.push({ type: "measure", description: JSON.stringify(m) });
    await card.scrollIntoViewIfNeeded();
    await group.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${QA}/design-1470.png` });
    return m;
  }

  test("토큰 실측 1470: 옵션 칩 28, 칩 간격 6, 카드 위 선 1, 카드 위 여백 8, 담기 32", async ({
    page,
  }) => {
    const m = await measureCard(page);
    expect(m.chipH).toBe(28);
    expect(m.gap).toBe("6px");
    expect(m.cardBorder).toBe("1px");
    expect(m.cardPad).toBe("8px");
    expect(m.btnH).toBe(32);
  });

  test("토큰 실측 1470: 카드 한 줄 13px(--text-body), 굵게 500, 결과 줄 13px — 와이어프레임 .scard .fl .res", async ({
    page,
  }) => {
    const m = await measureCard(page);
    expect({
      line: m.lineSize,
      strong: m.strongWeight,
      status: m.statusSize,
    }).toEqual({
      line: "13px",
      strong: "500",
      status: "13px",
    });
  });
});
