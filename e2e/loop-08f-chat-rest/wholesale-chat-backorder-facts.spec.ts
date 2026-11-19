import { expect, test, type Locator, type Page } from "@playwright/test";
import { installClock, log, login, roomList } from "../loop-04-chat/helpers";

/**
 * #372 S2-2 도매 근거 칸 미송 줄 4형식(loop-08f 01-plan §4-2, §6 S2-2, Codex r1 1).
 *
 * 시계: T0 = 2026-10-29(목) 14:20 서울(골든 t0)에 **reset 전에** 고정한다. 미송 시드 입고일은 reset 시각
 * 기준 상대값이라(SKU 3019 = +7일 = 11/5) 실행 날짜에 흔들리지 않는다. 시계는 흐른다 — 테스트 하나가 1분 안에 끝난다.
 *
 * SKU id와 미송 id는 다르다: SKU 3019 = 미송 9003(2장, 원단 수급 지연), SKU 3011 = 미송 9002(1장, 미정).
 * 날짜와 사유는 SKU 단위라 `PUT /variants/3019/expected-inbound`로 바꾼다.
 *
 * 근거 줄을 만드는 순서(형식마다 다시): 방 1에 "미송 언제 와요?" → 서버 미송 되묻기 → 그 되묻기에 **제시된**
 * 보기 글자 + `inquiry {intent: BACKORDER, backorderId}`. 미송 칩은 직전 되묻기에 제시된 후보만 받는다
 * (`inquiry.ts` decideBackorder, 아니면 INVALID_TARGET 넘김).
 *
 * 목은 페이지 안(MSW)이다 — reset과 PUT은 그 문서 안에서 fetch로 부른다.
 */

const T0 = new Date("2026-10-29T14:20:00+09:00");
const ASK = "미송 언제 와요?";

interface Choice {
  kind?: string;
  label: string;
  backorderId?: number | null;
  variantId: number;
}

interface Injected {
  kind: string;
  sequence: number;
  body: string;
  autoReply?: { choices?: Choice[] | null } | null;
  handoff?: { reason: string | null } | null;
}

/** 이 테스트에서 주입한 판정 결과 전부. INVALID_TARGET 0을 끝에 한 번에 본다 */
let produced: Injected[] = [];

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

/** 방 1(봄봄상회)에 소매 메시지를 넣고 판정을 돌린다. 판정이 만든 줄(소매 메시지 뒤)만 돌려준다 */
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
  const decided = data.slice(1);
  produced.push(...decided);
  return decided;
}

async function putExpectedInbound(
  page: Page,
  variantId: number,
  body: { expectedInboundDate: string | null; expectedInboundReason: string },
): Promise<void> {
  const status = await page.evaluate(
    async ({ variantId, body }) => {
      const response = await fetch(
        `/api/wholesale/variants/${variantId}/expected-inbound`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      return response.status;
    },
    { variantId, body },
  );
  expect(status, `PUT expected-inbound ${variantId}`).toBe(200);
}

function bubbleOf(page: Page, message: Injected): Locator {
  return log(page).locator(`[data-sequence="${message.sequence}"]`);
}

/**
 * 되묻기 → 제시된 backorderId 고름 → AUTO_REPLY 말풍선. 되묻기 보기에 9002, 9003이 둘 다 있는지도 본다.
 */
async function askAndPick(
  page: Page,
  backorderId: number,
  /** 자동 답 뒤 따라오는 넘김 이유. 미정 미송은 답과 함께 ETA_UNKNOWN 넘김이 붙는다(06 S3-3) */
  followingHandoffs: string[] = [],
): Promise<Locator> {
  const [clarify, ...more] = await inject(page, ASK);
  expect(clarify?.kind, "미송 되묻기").toBe("CLARIFY");
  expect(more).toEqual([]);
  const choices = (clarify?.autoReply?.choices ?? []).filter(
    (c) => c.kind === "BACKORDER",
  );
  expect(choices.map((c) => c.backorderId)).toEqual(
    expect.arrayContaining([9002, 9003]),
  );
  const picked = choices.find((c) => c.backorderId === backorderId);
  expect(picked, `보기 ${backorderId}`).toBeDefined();
  if (clarify === undefined || picked === undefined) throw new Error("보기");
  await expect(bubbleOf(page, clarify)).toBeVisible();

  const [reply, ...rest] = await inject(page, picked.label, {
    backorderId,
    variantId: picked.variantId,
  });
  expect(reply?.kind, "칩 고름 → 자동 답").toBe("AUTO_REPLY");
  expect(rest.map((m) => `${m.kind}:${m.handoff?.reason ?? ""}`)).toEqual(
    followingHandoffs.map((reason) => `HANDOFF:${reason}`),
  );
  if (reply === undefined) throw new Error("자동 답");
  const bubble = bubbleOf(page, reply);
  await expect(bubble).toBeVisible();
  return bubble;
}

/** 근거 칸 미송 줄. 글자 정확히, 그 줄과 말풍선 가로 넘침 0 */
async function expectFactLine(bubble: Locator, text: string): Promise<void> {
  const line = bubble.locator('[data-ac~="08f:S2-2"]');
  await expect(line).toHaveCount(1);
  await expect(line).toHaveText(text);
  const overflow = await line.evaluate((el) => {
    const bubbleEl = el.closest("[data-sequence]") ?? el;
    return {
      line: el.scrollWidth - el.clientWidth,
      bubble: bubbleEl.scrollWidth - bubbleEl.clientWidth,
      doc:
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    };
  });
  expect(overflow).toEqual({ line: 0, bubble: 0, doc: 0 });
}

test.beforeEach(async ({ page }) => {
  produced = [];
  await installClock(page, T0);
  await login(page);
  await page.goto("/chats?room=1");
  await expect(roomList(page).getByRole("link").first()).toBeVisible();
  await reset(page);
  await expect(log(page)).toBeVisible();
});

test.afterEach(() => {
  /* 제시된 후보만 골랐으니 판정이 만든 줄에 INVALID_TARGET 넘김은 하나도 없다
     (넘김 줄의 종류와 이유는 askAndPick이 칩마다 정확히 본다) */
  expect(JSON.stringify(produced)).not.toContain("INVALID_TARGET");
});

test("S2-2 (a) 9003 예정 + 사유 → '미송 2장, 입고 예정 11/5(목), 사유 원단 수급 지연'", async ({
  page,
}) => {
  const bubble = await askAndPick(page, 9003);
  await expectFactLine(
    bubble,
    "미송 2장, 입고 예정 11/5(목), 사유 원단 수급 지연",
  );
  await expect(bubble.locator('[data-ac~="08f:S2-2"] b')).toHaveText([
    "2장",
    "11/5(목)",
  ]);
});

test("S2-2 (b) 9002 미정 → '미송 1장, 입고일 미정'", async ({ page }) => {
  const bubble = await askAndPick(page, 9002, ["ETA_UNKNOWN"]);
  await expectFactLine(bubble, "미송 1장, 입고일 미정");
  await expect(bubble.locator('[data-ac~="08f:S2-2"] b')).toHaveText(["1장"]);
});

test("S2-2 (c) PUT 3019 {2027-01-05, 공백 사유} 뒤 9003 → '미송 2장, 입고 예정 2027/1/5(화)'", async ({
  page,
}) => {
  await putExpectedInbound(page, 3019, {
    expectedInboundDate: "2027-01-05",
    expectedInboundReason: "  ",
  });
  const bubble = await askAndPick(page, 9003);
  await expectFactLine(bubble, "미송 2장, 입고 예정 2027/1/5(화)");
});

test("S2-2 (d) PUT 3019 {2026-11-05, 빈 사유} 뒤 9003 → '미송 2장, 입고 예정 11/5(목)'", async ({
  page,
}) => {
  await putExpectedInbound(page, 3019, {
    expectedInboundDate: "2026-11-05",
    expectedInboundReason: "",
  });
  const bubble = await askAndPick(page, 9003);
  await expectFactLine(bubble, "미송 2장, 입고 예정 11/5(목)");
});
