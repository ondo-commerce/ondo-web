import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  installClock,
  log,
  login,
  roomList,
  row,
} from "../loop-04-chat/helpers";

/**
 * #299 S4 도매 미송 보기 줄과 근거 줄(loop-06 01-plan §4-4 §6 S4, 디자인 결정 38). 05b-1 Codex 메타 M4
 * "미송 자동 답의 조회 시각을 e2e로 본다"를 닫는다. 와이어프레임 `17_wholesale-chat` `#state-bo-choices`
 * `#state-bo-facts`.
 *
 * 소매 메시지는 목 손잡이 `incoming {autoReply: true}`로 넣는다(상품 문맥 없이 판정만 돈다). 칩을 고른 소매
 * 메시지는 `inquiry {intent: BACKORDER, backorderId}`를 같이 싣는다 — 소매 화면이 보내는 것과 같은 모양.
 *
 * 시각: T0 = 2026-10-29 14:20(서울)에 **reset 전에** 시계를 고정한다. 미송 시드 입고일이 reset 시각 기준 상대값이라
 * (3019 = +7일 = 11월 5일, 3003 = −3일) 실행 날짜에 흔들리지 않는다. 시계는 흐른다 — 테스트 하나가 1분 안에 끝나
 * 조회 시각은 "14:20"이다.
 *
 * 목은 페이지 안이다 — 미송 탭과 채팅 사이는 클라이언트 이동만 한다(`page.goto`면 배분과 입고일이 시드로 돌아간다).
 * 채팅 reset이 미송 목도 되돌린다.
 *
 * S4-4는 기획의 "9001에 2장 배분" 대신 9003(SKU 3019, 가용 4)으로 한다 — 3003은 재고 0 시드라 배분할 수 없다
 * (G2 승인, 계약 02-dev 판단 1). 부분 배분 1장 → 남은 1장, 되묻기 뒤 나머지 1장 → 해소.
 */

const T0 = new Date("2026-10-29T14:20:00+09:00");
const ASK = "지난주 주문한 거 언제 와요?";
const LINEN = "린넨 셋업 자켓 베이지/L, 남은 2장, 9/7 주문 #7003";
const ORDER_LABELS = [
  "빈티지 플라워 셔츠 레드/L, 남은 4장, 9/4 주문 #7001",
  "와이드 데님 팬츠 소라/M, 남은 1장, 9/6 주문 #7002",
  "빈티지 플라워 셔츠 레드/L, 남은 2장, 9/6 주문 #7006",
  LINEN,
];
const NOT_LISTED = "다른 주문이에요";

interface Injected {
  kind: string;
  sequence: number;
  body: string;
}

/** 채팅 목 reset. 200 단언 */
async function reset(page: Page): Promise<void> {
  const status = await page.evaluate(async () => {
    const response = await fetch("/__mock/chat/reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    return response.status;
  });
  expect(status, "채팅 목 reset").toBe(200);
}

/**
 * 방 1(봄봄상회)에 소매 메시지를 넣고 판정을 돌린다. 판정이 만든 줄(소매 메시지 뒤)만 돌려준다.
 * `backorderId`를 주면 칩을 고른 메시지다.
 */
async function inject(
  page: Page,
  body: string,
  chip?: { backorderId: number; variantId: number },
): Promise<Injected[]> {
  const { status, data } = await page.evaluate(
    async ({ body, chip }) => {
      const response = await fetch("/__mock/chat/rooms/1/incoming", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          body,
          autoReply: true,
          ...(chip === null
            ? {}
            : { inquiry: { intent: "BACKORDER", listingId: null, ...chip } }),
        }),
      });
      const json = (await response.json()) as { data: Injected[] };
      return { status: response.status, data: json.data };
    },
    { body, chip: chip ?? null },
  );
  expect(status, `incoming ${body}`).toBe(201);
  return data.slice(1);
}

/** 판정이 만든 말풍선 하나(되묻기, 자동 답) */
function bubbleOf(page: Page, message: Injected | undefined): Locator {
  expect(message, "판정 결과 줄").toBeDefined();
  return log(page).locator(`[data-sequence="${message?.sequence}"]`);
}

/** 미송 보기 목록과 그 안의 보기 줄 */
function choiceList(bubble: Locator): Locator {
  return bubble.locator('[data-ac="S4-1 S4-2"]');
}
function choiceItems(bubble: Locator): Locator {
  return choiceList(bubble).locator('[data-ac="S4-1"]');
}

/** 근거 칸 끝 줄 */
function seenLine(bubble: Locator): Locator {
  return bubble.locator('[data-ac~="S7-13"]');
}

function handoffs(page: Page): Locator {
  return log(page).locator('[data-kind="HANDOFF"]');
}

/** 되묻기를 띄우고 보기 줄이 그려질 때까지. 그 말풍선을 돌려준다 */
async function askWhen(page: Page): Promise<Locator> {
  const [clarify] = await inject(page, ASK);
  expect(clarify?.kind).toBe("CLARIFY");
  const bubble = bubbleOf(page, clarify);
  await expect(choiceItems(bubble)).toHaveCount(5);
  return bubble;
}

/** 헤더 채팅 → 방 1. 클라이언트 이동 */
async function openRoom1(page: Page): Promise<void> {
  await page.getByRole("banner").getByRole("link", { name: /^채팅/ }).click();
  await expect(roomList(page).getByRole("link").first()).toBeVisible();
  await row(page, "봄봄상회").click();
  await expect(page).toHaveURL(/room=1$/);
  await expect(log(page)).toBeVisible();
}

/** 주 메뉴 미송 → SKU 1-2(린넨 셋업 자켓 베이지 L, 3019) 펼치기. 클라이언트 이동 */
async function openLinenSku(page: Page): Promise<void> {
  await page.getByRole("link", { name: "미송", exact: true }).click();
  await expect(page).toHaveURL(/\/backorders/);
  await page.getByRole("button", { name: "SKU 1-2 펼치기" }).click();
  await expect(
    page.getByRole("textbox", { name: "주문 1 봄봄상회 배분 수량" }),
  ).toBeVisible();
}

/** 펼친 3019에서 9003(주문 1, 봄봄상회)에 qty장 배분 */
async function allocateLinen(page: Page, qty: number): Promise<void> {
  const input = page.getByRole("textbox", {
    name: "주문 1 봄봄상회 배분 수량",
  });
  await input.fill(String(qty));
  const done = page.waitForResponse(
    (r) =>
      /\/api\/wholesale\/backorders\/allocations$/.test(r.url()) &&
      r.request().method() === "POST",
  );
  await page.getByRole("button", { name: "배분 확정" }).click();
  expect((await done).status()).toBe(201);
}

test.beforeEach(async ({ page }) => {
  await installClock(page, T0);
  await login(page);
  await page.goto("/chats?room=1");
  await expect(roomList(page).getByRole("link").first()).toBeVisible();
  await reset(page);
  await expect(log(page)).toBeVisible();
});

test("S4-1 S4-2 M4 미송 되묻기 보기 줄(한 보기 한 줄, 주문 불가 0) → 칩 9003 → 근거 줄 미송 2장 + 14:20 조회", async ({
  page,
}) => {
  const clarify = await askWhen(page);
  /* "보기" 이름표 한 번, 그 아래 보기마다 한 줄. 오래된 순 + 끝에 다른 주문이에요 */
  await expect(choiceList(clarify).locator(":scope > span").first()).toHaveText(
    "보기",
  );
  await expect(choiceItems(clarify)).toHaveText([...ORDER_LABELS, NOT_LISTED]);
  await expect(clarify).not.toContainText("(주문 불가)");
  await expect(clarify).not.toContainText("보기:");
  /* 도매에선 누를 수 없다 */
  await expect(clarify.getByRole("button")).toHaveCount(0);
  await expect(seenLine(clarify)).toHaveText("14:20 조회");

  const label = await choiceItems(clarify).nth(3).textContent();
  expect(label).toBe(LINEN);
  const [reply, ...rest] = await inject(page, LINEN, {
    backorderId: 9003,
    variantId: 3019,
  });
  expect(reply?.kind).toBe("AUTO_REPLY");
  expect(rest).toEqual([]);
  const bubble = bubbleOf(page, reply);
  await expect(bubble).toContainText(
    "린넨 셋업 자켓 베이지 L 남은 미송 2장은 11월 5일 도매 입고 예정이에요(원단 수급 지연)",
  );
  await expect(bubble).toContainText("미송 2장, 입고 예정 2026-11-05");
  await expect(bubble.locator("b").filter({ hasText: "2장" })).toHaveCount(1);
  await expect(seenLine(bubble)).toHaveText(/14:20 조회$/);
});

test("S4-3 미송 탭에서 3019 입고일을 T0+10일로 저장 → 같은 주입 → 답 문장과 근거 줄 새 날짜, 옛 날짜 0", async ({
  page,
}) => {
  /* 바꾸기 전 답: 11월 5일 */
  await askWhen(page);
  const [before] = await inject(page, LINEN, {
    backorderId: 9003,
    variantId: 3019,
  });
  await expect(bubbleOf(page, before)).toContainText("입고 예정 2026-11-05");

  await openLinenSku(page);
  const eta = page.getByRole("textbox", { name: "예상 입고일" });
  await expect(eta).toHaveValue("2026.11.05");
  await eta.fill("2026.11.08");
  await page.getByRole("button", { name: "저장", exact: true }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "저장했어요" }),
  ).toBeVisible();

  await openRoom1(page);
  await askWhen(page);
  const [after, ...rest] = await inject(page, LINEN, {
    backorderId: 9003,
    variantId: 3019,
  });
  expect(after?.kind).toBe("AUTO_REPLY");
  expect(rest).toEqual([]);
  const bubble = bubbleOf(page, after);
  await expect(bubble).toContainText(
    "린넨 셋업 자켓 베이지 L 남은 미송 2장은 11월 8일 도매 입고 예정이에요(원단 수급 지연)",
  );
  await expect(bubble).toContainText("미송 2장, 입고 예정 2026-11-08");
  await expect(bubble).not.toContainText("11월 5일");
  await expect(bubble).not.toContainText("2026-11-05");
  /* 지난 답은 고치지 않는다 */
  await expect(bubbleOf(page, before)).toContainText("입고 예정 2026-11-05");
});

test("S4-4 9003 1장 배분 → 칩 9003 근거 줄 미송 1장. 되묻기 뒤 나머지 1장 배분(해소) → 칩 9003 넘김, 입고 예정 문장 0", async ({
  page,
}) => {
  await openLinenSku(page);
  await allocateLinen(page, 1);

  await openRoom1(page);
  const clarify = await askWhen(page);
  /* 보기 글자도 지금 남은 수량 */
  await expect(choiceItems(clarify).nth(3)).toHaveText(
    "린넨 셋업 자켓 베이지/L, 남은 1장, 9/7 주문 #7003",
  );
  const [part] = await inject(
    page,
    "린넨 셋업 자켓 베이지/L, 남은 1장, 9/7 주문 #7003",
    {
      backorderId: 9003,
      variantId: 3019,
    },
  );
  expect(part?.kind).toBe("AUTO_REPLY");
  const bubble = bubbleOf(page, part);
  await expect(bubble).toContainText("남은 미송 1장은 11월 5일");
  await expect(bubble).toContainText("미송 1장, 입고 예정 2026-11-05");

  /* 보기를 띄운 뒤 해소 */
  const reopened = await askWhen(page);
  await expect(choiceItems(reopened).nth(3)).toContainText("9/7 주문 #7003");
  await openLinenSku(page);
  await allocateLinen(page, 1);

  await openRoom1(page);
  const autoBefore = await log(page)
    .locator('[data-kind="AUTO_REPLY"]')
    .count();
  const handoffBefore = await handoffs(page).count();
  const gone = await inject(
    page,
    "린넨 셋업 자켓 베이지/L, 남은 1장, 9/7 주문 #7003",
    { backorderId: 9003, variantId: 3019 },
  );
  expect(gone.map((m) => m.kind)).toEqual(["HANDOFF"]);
  expect(JSON.stringify(gone)).not.toContain("입고 예정");
  await expect(handoffs(page)).toHaveCount(handoffBefore + 1);
  await expect(log(page).locator('[data-kind="AUTO_REPLY"]')).toHaveCount(
    autoBefore,
  );
});
