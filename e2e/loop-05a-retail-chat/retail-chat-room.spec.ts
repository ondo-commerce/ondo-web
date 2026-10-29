import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import {
  ANY_CHAT,
  appAlert,
  assertStubServers,
  box,
  bubbles,
  composer,
  count,
  CREATE_POST,
  drawnSequences,
  incoming,
  inquiryButton,
  log,
  mock,
  MESSAGES_GET,
  openProduct,
  openLongRoom,
  openRoom,
  pageOverflow,
  requests,
  resetMock,
  sendButton,
  signIn,
  stubRequests,
  waitCount,
  watchRequests,
} from "./helpers";

/**
 * #284 S5 — 문의하기 입구, 방 만들기, 방 화면. 와이어프레임 `18_retail-chat`.
 * 방 1 = 무드온(101), 33 = 라온(102), 34 = 103(30자 상호, reset 뒤 새로 만든다).
 */

assertStubServers();

test.beforeEach(async ({ page }) => {
  await watchRequests(page);
  await signIn(page);
});

/** 입구를 눌러 방으로. 클라이언트 이동이라 목 상태(걸어 둔 실패, 만든 방)가 남는다 */
async function enter(page: Page, roomId: number, from: string) {
  await inquiryButton(page).click();
  await expect(page).toHaveURL(`/chats/${roomId}?from=${from}`);
}

test.describe("S5-1 S5-2 S5-3 S5-4 입구", () => {
  test("S5-1 상품 상세 판매처 칸의 문의하기 → POST 1회 {101, 11} → /chats/1?from=/products/11", async ({
    page,
  }) => {
    await openProduct(page, 11);
    // 판매처 칸 안, 도매처 홈 링크 앞
    const seller = page
      .locator("div", { has: page.getByRole("link", { name: "도매처 홈" }) })
      .last();
    await expect(
      seller.getByRole("button", { name: "문의하기", exact: true }),
    ).toBeVisible();
    await enter(page, 1, "/products/11");
    const posts = await requests(page, CREATE_POST);
    expect(posts).toHaveLength(1);
    await expect(
      page.getByRole("heading", { level: 1, name: "무드온" }),
    ).toBeVisible();
  });

  test("S5-2 도매처 홈 머리의 문의하기 → {101, null} → /chats/1?from=/wholesalers/101, 거래 없는 도매처(102)에도 버튼", async ({
    page,
  }) => {
    let body: unknown = null;
    page.on("request", (r) => {
      if (r.method() === "POST" && /\/api\/retail\/chat\/rooms$/.test(r.url()))
        body = r.postDataJSON();
    });
    await page.goto("/wholesalers/101");
    await expect(
      page.getByRole("link", { name: "거래처에서 보기" }),
    ).toBeVisible();
    await resetMock(page);
    await enter(page, 1, "/wholesalers/101");
    expect(body).toEqual({ wholesalerId: 101, listingId: null });
    expect(await count(page, CREATE_POST)).toBe(1);

    await page.goto("/wholesalers/102");
    await expect(
      page.getByRole("link", { name: "거래처에서 보기" }),
    ).toHaveCount(0);
    await expect(inquiryButton(page)).toBeVisible();
  });

  test("S5-1 본문은 {wholesalerId: 101, listingId: 11}", async ({ page }) => {
    let body: unknown = null;
    page.on("request", (r) => {
      if (r.method() === "POST" && /\/api\/retail\/chat\/rooms$/.test(r.url()))
        body = r.postDataJSON();
    });
    await openProduct(page, 11);
    await enter(page, 1, "/products/11");
    expect(body).toEqual({ wholesalerId: 101, listingId: 11 });
  });

  test("S5-3 멱등(계약): 101 두 번 200 방 1, 103 → 201 방 34 → 다시 200 34, 999 → 404", async ({
    page,
  }) => {
    await openRoom(page, "/chats/1");
    const results = await page.evaluate(async () => {
      const create = async (wholesalerId: number) => {
        const r = await fetch("/api/retail/chat/rooms", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ wholesalerId, listingId: null }),
        });
        const json = (await r.json()) as {
          data?: { roomId: number };
          code?: string;
        };
        return [r.status, json.data?.roomId ?? json.code] as const;
      };
      return [
        await create(101),
        await create(101),
        await create(103),
        await create(103),
        await create(999),
      ];
    });
    expect(results).toEqual([
      [200, 1],
      [200, 1],
      [201, 34],
      [200, 34],
      [404, "RESOURCE_NOT_FOUND"],
    ]);
  });

  test("S5-4 누르면 즉시 여는 중 + disabled, 3연타 → POST 1회", async ({
    page,
  }) => {
    await openProduct(page, 11);
    // 응답을 늦춰 `여는 중`을 붙잡는다 — 목은 페이지 안이라 fetch를 감싼다
    await page.evaluate(() => {
      const original = window.fetch.bind(window);
      window.fetch = async (input, init) => {
        const response = await original(input, init);
        if (
          (init?.method ?? "GET") === "POST" &&
          String(input).endsWith("/api/retail/chat/rooms")
        )
          await new Promise((r) => setTimeout(r, 800));
        return response;
      };
    });
    const button = inquiryButton(page);
    await button.click();
    const opening = page.getByRole("button", { name: "여는 중", exact: true });
    await expect(opening).toBeDisabled();
    await expect(opening).toHaveAttribute("aria-busy", "true");
    await opening.click({ force: true });
    await opening.click({ force: true });
    await expect(page).toHaveURL("/chats/1?from=/products/11");
    expect(await count(page, CREATE_POST)).toBe(1);
  });

  test("S5-4 fail create 500 → 버튼 아래 실패 한 줄, 다시 누르면 재요청 1회", async ({
    page,
  }) => {
    await openProduct(page, 11);
    await mock(page, "fail", { op: "create", status: 500 });
    await inquiryButton(page).click();
    await expect(appAlert(page)).toHaveText(
      "대화방을 열지 못했어요. 다시 눌러 주세요",
    );
    await expect(inquiryButton(page)).toBeEnabled();
    expect(await count(page, CREATE_POST)).toBe(1);
    await enter(page, 1, "/products/11");
    expect(await count(page, CREATE_POST)).toBe(2);
  });

  test("S5-4 fail create 404 → '이 도매처와는 대화할 수 없어요', 버튼은 켜진 채", async ({
    page,
  }) => {
    await openProduct(page, 11);
    await mock(page, "fail", { op: "create", status: 404 });
    await inquiryButton(page).click();
    await expect(appAlert(page)).toHaveText("이 도매처와는 대화할 수 없어요");
    await expect(inquiryButton(page)).toBeEnabled();
  });

  test("S5-4 fail create 403 → /approval", async ({ page }) => {
    // 승인 대기 화면은 PENDING 계정만 머문다(승인된 계정은 마켓으로 돌려보낸다)
    await signIn(page, "pending");
    await openProduct(page, 11);
    await mock(page, "fail", { op: "create", status: 403 });
    await inquiryButton(page).click();
    await expect(page).toHaveURL("/approval");
  });
});

test("S5-12 새 브라우저 context에서 상품 상세 직행 → 곧바로 문의하기 → POST가 MSW에 잡힌다(가짜 API에 /chat/ 0건)", async ({
  browser,
}) => {
  const context = await browser.newContext({
    baseURL: test.info().project.use.baseURL,
    locale: "ko-KR",
  });
  const page = await context.newPage();
  /* worker 등록을 1.5초 늦춘다 — 로컬에선 worker가 버튼보다 먼저 떠 버려 "기다리지 않는 입구"도
     통과했다(변이 검사). 늦춰 두면 기다리지 않는 입구의 POST는 프록시를 지나 가짜 API에 닿는다 */
  await page.addInitScript(() => {
    const container = navigator.serviceWorker;
    const register = container.register.bind(container);
    container.register = (url, options) =>
      new Promise((resolve) => setTimeout(resolve, 1500)).then(() =>
        register(url, options),
      );
  });
  await signIn(page);
  const before = (await stubRequests(page)).filter((r) => r.includes("/chat/"));
  await page.goto("/products/11");
  // worker 준비를 기다리지 않고 바로 누른다 — 입구가 Promise를 기다려야 한다
  await inquiryButton(page).click();
  await expect(page).toHaveURL("/chats/1?from=/products/11");
  await expect(
    page.getByRole("heading", { level: 1, name: "무드온" }),
  ).toBeVisible();
  const after = (await stubRequests(page)).filter((r) => r.includes("/chat/"));
  expect(after).toEqual(before);
  await context.close();
});

test("S5-12 worker 시작이 한 번 실패해도 다시 누르면 새로 시작해 방이 열린다(리뷰 F2)", async ({
  page,
}) => {
  /* 첫 등록만 1초 뒤 실패시킨다 — 그 사이 누른 문의하기는 같은(실패할) 준비 Promise를 기다린다.
     실패한 Promise를 기억에 남기면 두 번째 누름도 즉시 실패한다 */
  await page.addInitScript(() => {
    const container = navigator.serviceWorker;
    const register = container.register.bind(container);
    let calls = 0;
    (window as unknown as { __registerCalls: () => number }).__registerCalls =
      () => calls;
    container.register = (url, options) => {
      calls += 1;
      return calls === 1
        ? new Promise((_, reject) =>
            setTimeout(
              () => reject(new Error("worker 파일 다운로드 실패")),
              1000,
            ),
          )
        : register(url, options);
    };
  });
  await page.goto("/products/11");
  await inquiryButton(page).click();
  await expect(appAlert(page)).toHaveText(
    "대화방을 열지 못했어요. 다시 눌러 주세요",
  );
  await inquiryButton(page).click();
  await expect(page).toHaveURL("/chats/1?from=/products/11");
  await expect(
    page.getByRole("heading", { level: 1, name: "무드온" }),
  ).toBeVisible();
  expect(
    await page.evaluate(() =>
      (
        window as unknown as { __registerCalls: () => number }
      ).__registerCalls(),
    ),
  ).toBe(2);
});

test.describe("S5-5 S5-6 방 화면", () => {
  test("S5-5 방 머리 무드온, sequence 오름차순, 날짜 구분선, RETAILER 오른쪽 WHOLESALER TEXT 왼쪽", async ({
    page,
  }) => {
    await openRoom(page, "/chats/1?from=/products/11");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("무드온");
    expect(await drawnSequences(page)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    await expect(log(page).getByRole("separator")).toHaveText([
      "10월 27일 (화)",
      "10월 28일 (수)",
    ]);
    const area = await box(log(page));
    const center = area.x + area.width / 2;
    const mine = bubbles(page).and(page.locator('[data-sender="RETAILER"]'));
    const theirs = bubbles(page).and(
      page.locator('[data-sender="WHOLESALER"][data-kind="TEXT"]'),
    );
    await expect(mine).toHaveCount(4);
    await expect(theirs).toHaveCount(1);
    for (const b of await mine.all())
      expect((await box(b)).x).toBeGreaterThan(center);
    for (const b of await theirs.all()) {
      const t = await box(b);
      expect(t.x + t.width).toBeLessThan(center);
    }
  });

  test("S5-6 AUTO_REPLY, CLARIFY는 왼쪽에 자동 답변 + HH:mm 조회, 근거 칸과 칩 없음", async ({
    page,
  }) => {
    /* 시드 날(10/28)에 연다. loop-07부터 오늘이 아닌 답은 `10/28 09:20 조회`로 날짜가 붙는다(Q4) — 실행 날짜에
       흔들리지 않게 시드와 같은 날로 고정한다. 날짜 붙은 표기는 loop-07 S2-5가 본다 */
    await page.clock.install({ time: new Date("2026-10-28T10:00:00+09:00") });
    await openRoom(page, "/chats/1");
    const autos = bubbles(page).and(
      page.locator('[data-kind="AUTO_REPLY"], [data-kind="CLARIFY"]'),
    );
    await expect(autos).toHaveCount(2);
    const area = await box(log(page));
    for (const a of await autos.all()) {
      await expect(a.getByText("자동 답변", { exact: true })).toBeVisible();
      const b = await box(a);
      expect(b.x + b.width).toBeLessThan(area.x + area.width / 2 + 1);
    }
    await expect(autos.nth(0).getByText(/^\d\d:\d\d 조회$/)).toHaveText(
      "09:20 조회",
    );
    await expect(autos.nth(1).getByText(/^\d\d:\d\d 조회$/)).toHaveText(
      "09:22 조회",
    );
    // 근거 칸(정확 수량), 되묻기 글자, 옵션 칩 없음. 05b(#288)부터 재고 답엔 카드(수량 −/+, 담기)가 붙는다 —
    // 대화 안 버튼은 그 카드 것뿐이다(시드 되묻기는 보기가 없어 칩 줄이 없다)
    await expect(log(page).getByText(/판매가능|되묻기|주문 한도/)).toHaveCount(
      0,
    );
    await expect(log(page).getByRole("button")).toHaveCount(3);
    await expect(
      log(page).locator("[data-variant-id]").getByRole("button"),
    ).toHaveCount(3);
  });

  test("S5-6 HANDOFF는 가운데 '사장님께 전달했어요', 모르는 kind는 body만 왼쪽", async ({
    page,
  }) => {
    await openProduct(page, 21);
    await incoming(page, 33, "주문서를 보냈어요", { kind: "ORDER_LINK" });
    await enter(page, 33, "/products/21");
    const handoff = log(page).getByRole("note");
    await expect(handoff).toContainText("사장님께 전달했어요");
    await expect(log(page).getByText("직접 답해 주세요")).toHaveCount(0);
    const area = await box(log(page));
    const h = await box(handoff);
    expect(
      Math.abs(h.x + h.width / 2 - (area.x + area.width / 2)),
    ).toBeLessThan(4);
    const unknown = log(page).locator('[data-kind="ORDER_LINK"]');
    await expect(unknown).toHaveText(/주문서를 보냈어요/);
    await expect(unknown.getByText("자동 답변")).toHaveCount(0);
    const u = await box(unknown);
    expect(u.x + u.width).toBeLessThan(area.x + area.width / 2);
  });
});

/**
 * S5-7 계약 — 소매 응답의 모든 `autoReply.facts`를 `ChatRetailFacts` 스키마로 재귀 검사한다.
 * 스키마에 없는 키(정확 수량 `availableQty` 같은)가 하나라도 있으면 실패. `additionalProperties`가
 * 스키마에 안 적혀 있어도 false로 읽는다(01-plan S5-7).
 */
type Schema = {
  $ref?: string;
  oneOf?: Schema[];
  type?: string | string[];
  properties?: Record<string, Schema>;
};
const SPEC = JSON.parse(
  readFileSync("packages/api/openapi/retail.json", "utf8"),
) as { components: { schemas: Record<string, Schema> } };

function resolve(schema: Schema): Schema {
  if (schema.$ref === undefined) return schema;
  const name = schema.$ref.split("/").at(-1) ?? "";
  const found = SPEC.components.schemas[name];
  if (found === undefined) throw new Error(`스키마 ${name} 없음`);
  return resolve(found);
}

function extraKeys(value: unknown, schema: Schema, path: string): string[] {
  const s = resolve(schema);
  if (value === null) return [];
  if (s.oneOf) {
    const options = s.oneOf.map(resolve).filter((o) => o.type !== "null");
    // 객체 하나 + null인 꼴만 쓴다
    return options.flatMap((o) => extraKeys(value, o, path));
  }
  if (typeof value !== "object" || Array.isArray(value)) return [];
  const props = s.properties ?? {};
  return Object.entries(value as Record<string, unknown>).flatMap(([k, v]) => {
    const child = props[k];
    return child === undefined
      ? [`${path}.${k}`]
      : extraKeys(v, child, `${path}.${k}`);
  });
}

test("S5-7 정확 수량 비노출(계약): messages, send 응답의 facts가 ChatRetailFacts 밖 키 0, 재고 미송 미수 각 1건 이상", async ({
  page,
}) => {
  await openRoom(page, "/chats/1");
  const bodies = await page.evaluate(async () => {
    const get = (id: number) =>
      fetch(`/api/retail/chat/rooms/${id}/messages?size=100`).then((r) =>
        r.json(),
      );
    const send = await fetch("/api/retail/chat/rooms/1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": crypto.randomUUID(),
      },
      body: JSON.stringify({ body: "몇 장 남았어요?", inquiry: null }),
    }).then((r) => r.json());
    return {
      rooms: [await get(1), await get(33)],
      send,
      raw: JSON.stringify([await get(1), await get(33)]),
    };
  });
  expect(bodies.raw).not.toContain("availableQty");
  const factsSchema: Schema = { $ref: "#/components/schemas/ChatRetailFacts" };
  type Msg = { autoReply: { facts: Record<string, unknown> } | null };
  const messages: Msg[] = [
    ...bodies.rooms.flatMap((r: { data: Msg[] }) => r.data),
    bodies.send.data.message,
    ...bodies.send.data.generatedMessages,
  ];
  const facts = messages.flatMap((m) =>
    m.autoReply ? [m.autoReply.facts] : [],
  );
  const extras = facts.flatMap((f) => extraKeys(f, factsSchema, "facts"));
  expect(extras).toEqual([]);
  // 빈 검사 방지 — 세 갈래가 다 있어야 검사가 의미 있다
  expect(facts.filter((f) => f.stock !== null).length).toBeGreaterThanOrEqual(
    1,
  );
  expect(
    facts.filter((f) => f.backorder !== null).length,
  ).toBeGreaterThanOrEqual(1);
  expect(
    facts.filter((f) => f.receivable !== null).length,
  ).toBeGreaterThanOrEqual(1);
});

test.describe("S5-8 빈 방, 없는 방, 첫 조회 실패", () => {
  test("S5-8 메시지 0개 방(103 새 방 34) → 안내와 입력창", async ({ page }) => {
    await openProduct(page, 31);
    await enter(page, 34, "/products/31");
    await expect(
      log(page).getByText("궁금한 걸 남겨 주세요. 사장님이 보고 답해요"),
    ).toBeVisible();
    await expect(composer(page)).toBeVisible();
  });

  test("S5-8 /chats/2(남의 방) → 대화를 찾을 수 없어요 + 홈으로, 입력창 없음", async ({
    page,
  }) => {
    await page.goto("/chats/2");
    await expect(page.getByText("대화를 찾을 수 없어요")).toBeVisible();
    await expect(page.getByRole("link", { name: "홈으로" })).toBeVisible();
    await expect(composer(page)).toHaveCount(0);
  });

  test("S5-8 /chats/abc → 404 화면(서버에 묻지 않음)", async ({ page }) => {
    await page.goto("/chats/abc");
    await expect(page.getByText("찾는 페이지가 없어요")).toBeVisible();
    expect(await count(page, ANY_CHAT)).toBe(0);
  });

  test("S5-8 fail messages 500 → 블록 안 오류 + 다시 시도, 입력창 없음, 누르면 재요청 1회", async ({
    page,
  }) => {
    await openProduct(page, 11);
    await mock(page, "fail", { op: "messages", status: 500 });
    await enter(page, 1, "/products/11");
    const alert = appAlert(page);
    await expect(alert).toContainText("대화를 불러오지 못했어요");
    await expect(alert).toContainText("잠시 뒤 다시 시도해 주세요.");
    await expect(composer(page)).toHaveCount(0);
    // 앱 기본 retry(2회 더)를 타지 않는다
    expect(await count(page, MESSAGES_GET)).toBe(1);
    await page.getByRole("button", { name: "다시 시도" }).click();
    await expect(log(page)).toBeVisible();
    await waitCount(page, MESSAGES_GET, 2);
    await expect(composer(page)).toBeVisible();
  });
});

test.describe("S5-9 가려짐과 높이", () => {
  for (const viewport of [
    { width: 1470, height: 900 },
    { width: 390, height: 844 },
  ]) {
    test(`S5-9 ${viewport.width}x${viewport.height}: 넘치는 대화(50개)에서 페이지 스크롤 0, 블록이 창 안, 마지막 말풍선이 입력창에 안 가림, 공백 없는 1000자도 폭 안`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await openLongRoom(page);
      // 메시지 영역이 실제로 넘친다 — 넘치지 않는 방으로는 페이지 스크롤 0이 거저 통과한다(F6)
      expect(
        await log(page).evaluate((el) => el.scrollHeight > el.clientHeight),
      ).toBe(true);
      await composer(page).fill("가".repeat(1000));
      await sendButton(page).click();
      await expect(bubbles(page)).toHaveCount(51);
      const overflow = await pageOverflow(page);
      expect(overflow.y).toBeLessThanOrEqual(1);
      expect(overflow.x).toBeLessThanOrEqual(0);
      const block = await box(
        page.getByRole("region", { name: "무드온 대화" }),
      );
      expect(block.y + block.height).toBeLessThanOrEqual(viewport.height);
      const last = await box(bubbles(page).last());
      const input = await box(composer(page));
      expect(last.y + last.height).toBeLessThanOrEqual(input.y);
      const area = await box(log(page));
      expect(last.x + last.width).toBeLessThanOrEqual(
        area.x + area.width + 0.5,
      );
    });
  }
});

test.describe("S5-13 S5-14 돌아가기와 재진입", () => {
  test("S5-13 상품으로 돌아가기 → /products/11, 브라우저 뒤로가기도 /products/11", async ({
    page,
  }) => {
    await openProduct(page, 11);
    await enter(page, 1, "/products/11");
    await page.goBack();
    await expect(page).toHaveURL("/products/11");
    await page.goto("/chats/1?from=/products/11");
    const back = page.getByRole("link", { name: "상품으로 돌아가기" });
    await expect(back).toHaveAttribute("href", "/products/11");
    await back.click();
    await expect(page).toHaveURL("/products/11");
  });

  test("S5-13 from이 외부 주소(https://, //)면 버리고 도매처 홈(/wholesalers/101)", async ({
    page,
  }) => {
    for (const from of ["https://x.test", "//x.test"]) {
      await page.goto(`/chats/1?from=${encodeURIComponent(from)}`);
      await expect(log(page)).toBeVisible();
      await expect(
        page.getByRole("link", { name: "상품으로 돌아가기" }),
      ).toHaveCount(0);
      await expect(
        page.getByRole("link", { name: "도매처 홈" }),
      ).toHaveAttribute("href", "/wholesalers/101");
    }
  });

  test("S5-14 101 문의 → 방 1에 '가' → 102 도매처 홈 문의 → 방 33 → 다시 101 → 방 1, '가' 그대로. 3회 모두 200", async ({
    page,
  }) => {
    await openProduct(page, 11);
    await enter(page, 1, "/products/11");
    await composer(page).fill("가");
    await composer(page).press("Enter");
    // 서버 sequence를 받은 내 말풍선 중 본문이 정확히 "가"인 것
    const sent = bubbles(page).filter({
      has: page.locator("div", { hasText: /^가$/ }),
    });
    await expect(sent).toHaveCount(1);
    // 102로 — 전부 클라이언트 이동(목 상태가 남는다)
    await page.getByRole("link", { name: /도마켓/ }).click();
    await page.getByRole("link", { name: "린넨 팬츠" }).click();
    await expect(page).toHaveURL("/products/21");
    await page.getByRole("link", { name: "도매처 홈" }).click();
    await expect(page).toHaveURL("/wholesalers/102");
    await enter(page, 33, "/wholesalers/102");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("라온");
    await page.getByRole("link", { name: /도마켓/ }).click();
    await page.getByRole("link", { name: "코튼 셔츠" }).click();
    await expect(page).toHaveURL("/products/11");
    await enter(page, 1, "/products/11");
    await expect(sent).toHaveCount(1);
    const posts = await requests(page, CREATE_POST);
    expect(posts.map((p) => p.status)).toEqual([200, 200, 200]);
  });
});

test.describe("S5-15 S5-16 390 블록 상태와 키보드", () => {
  test("S5-15 390x844: 30자 상호 한 줄, 링크 줄바꿈 없음, 10줄 입력은 160px에서 멈추고 말풍선 안 가림, 오류 두 줄에도 보내기 창 안", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openProduct(page, 31);
    await enter(page, 34, "/products/31");
    const title = page.getByRole("heading", { level: 1 });
    await expect(title).toHaveAttribute(
      "title",
      "코튼클럽 동대문 신평화패션타운 삼층 본점 직영 도매상회",
    );
    const single = await title.evaluate((el) => ({
      truncated: el.scrollWidth > el.clientWidth,
      lines: Math.round(
        el.getBoundingClientRect().height /
          parseFloat(getComputedStyle(el).lineHeight),
      ),
    }));
    expect(single).toEqual({ truncated: true, lines: 1 });
    const link = page.getByRole("link", { name: "상품으로 돌아가기" });
    // 줄바꿈 없음(글 한 줄) + ≤40rem 손가락 높이 44(QA F4)
    const linkShape = await link.evaluate((el) => {
      // 글자 노드가 몇 줄로 그려졌나 — 줄마다 사각형이 하나씩 생긴다(아이콘은 빼고 글자만 잰다)
      const text = [...el.childNodes].find(
        (n) => n.nodeType === Node.TEXT_NODE,
      );
      const range = document.createRange();
      if (text) range.selectNodeContents(text);
      return {
        boxes: el.getClientRects().length,
        textLines: new Set(
          [...range.getClientRects()].map((r) => Math.round(r.top)),
        ).size,
        height: Math.round(el.getBoundingClientRect().height),
      };
    });
    expect(linkShape).toEqual({ boxes: 1, textLines: 1, height: 44 });

    // 넘치는 대화의 방 1로 — 10줄 입력(QA F6: 시드 방은 메시지 영역을 안 넘친다)
    await openLongRoom(page);
    await composer(page).fill(
      Array.from({ length: 10 }, (_, i) => `줄 ${i + 1}`).join("\n"),
    );
    const input = await box(composer(page));
    expect(input.height).toBeLessThanOrEqual(160.5);
    // 메시지 영역이 줄어든 뒤 바닥 맞춤이 한 프레임 뒤에 돈다
    await expect
      .poll(async () => {
        const last = await box(bubbles(page).last());
        return last.y + last.height <= (await box(composer(page))).y;
      })
      .toBe(true);

    // 1001자 → 입력창 아래 안내(두 줄로 꺾여도) 보내기가 창 안
    await composer(page).fill("가".repeat(1001));
    await expect(
      page.getByText("1,000자까지 보낼 수 있어요 (1,001/1,000)"),
    ).toBeVisible();
    const send = await box(sendButton(page));
    expect(send.y + send.height).toBeLessThanOrEqual(844);
    expect((await pageOverflow(page)).y).toBeLessThanOrEqual(1);
  });

  test("S5-15 390x480: 넘치는 대화에서도 블록이 하한 448을 지키고 페이지는 하한 초과분만큼만 스크롤", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 480 });
    await openLongRoom(page);
    const block = await box(page.getByRole("region", { name: "무드온 대화" }));
    expect(Math.round(block.height)).toBe(448);
    // 하한 448 + 헤더 57 + 여백 16 = 521 → 480 창에서 41px(와이어프레임 실측). "> 0"만 보면 250도 통과했다(F6)
    const overflowY = (await pageOverflow(page)).y;
    expect(overflowY).toBeGreaterThanOrEqual(40);
    expect(overflowY).toBeLessThanOrEqual(42);
  });

  test("S5-16 390x480 키보드 근사: 입력창 포커스 → 입력창과 보내기가 창 안, 보내기 → POST 1회", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 480 });
    await openRoom(page, "/chats/1");
    // 05b(#288): 재고 문장엔 자동 답이 붙어 말풍선이 9개가 된다. 이 테스트는 보내기 1회만 보므로 끈다
    await mock(page, "auto-reply", { enabled: false });
    await composer(page).focus();
    await composer(page).fill("레드 M 몇 장 있어요?");
    const inside = await page.evaluate(() => {
      const input = document.querySelector("textarea")?.getBoundingClientRect();
      const send = [...document.querySelectorAll("button")]
        .find((b) => b.textContent === "보내기")
        ?.getBoundingClientRect();
      return (
        input !== undefined &&
        send !== undefined &&
        input.bottom <= innerHeight &&
        send.bottom <= innerHeight &&
        input.top >= 0
      );
    });
    expect(inside).toBe(true);
    await sendButton(page).click();
    await expect(bubbles(page)).toHaveCount(8);
    expect(
      await count(page, {
        path: /\/api\/retail\/chat\/rooms\/1\/messages$/,
        method: "POST",
      }),
    ).toBe(1);
  });
});
