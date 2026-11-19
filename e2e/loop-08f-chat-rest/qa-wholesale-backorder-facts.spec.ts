import { expect, test, type Locator, type Page } from "@playwright/test";
import { installClock, log, login, roomList } from "../loop-04-chat/helpers";

/**
 * 08f QA 재현 spec, #382에서 회귀 시험으로 커밋.
 *
 * loop-08f QA — #372 도매 근거 칸 미송 줄. 기본 설정 wholesale(3100, MSW)로 돈다.
 * 개발 spec(`wholesale-chat-backorder-facts.spec.ts`)의 4형식에 지난 날짜와 긴 사유를 더해 1280, 1470에서 찍는다.
 * 도우미는 그 spec에서 옮겨 왔다(spec 파일끼리 import하면 시험이 두 번 등록된다).
 *
 * 스크린샷은 `.claude/harness/runs/loop-08f-chat-rest/qa/`.
 */

const SHOT = ".claude/harness/runs/loop-08f-chat-rest/qa";
const T0 = new Date("2026-10-29T14:20:00+09:00");
const ASK = "미송 언제 와요?";
const LONG_REASON =
  "원단 공장이 이번 주 휴무라 다음 주 화요일 이후 다시 들어오고, 블랙은 먼저 레드는 조금 늦게 들어올 수 있어요";

interface Choice {
  kind?: string;
  label: string;
  backorderId?: number | null;
  variantId: number;
}

interface Injected {
  kind: string;
  sequence: number;
  autoReply?: { choices?: Choice[] | null } | null;
  handoff?: { reason: string | null } | null;
}

async function fetchStatus(
  page: Page,
  url: string,
  method: string,
  body: unknown,
): Promise<{ status: number; data: Injected[] }> {
  return page.evaluate(
    async ({ url, method, body }) => {
      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await response.json().catch(() => ({}))) as {
        data?: unknown;
      };
      return {
        status: response.status,
        data: Array.isArray(json.data) ? (json.data as Injected[]) : [],
      };
    },
    { url, method, body },
  );
}

async function inject(
  page: Page,
  body: string,
  chip?: { backorderId: number; variantId: number },
): Promise<Injected[]> {
  const { status, data } = await fetchStatus(
    page,
    "/__mock/chat/rooms/1/incoming",
    "POST",
    {
      body,
      autoReply: true,
      ...(chip === undefined
        ? {}
        : { inquiry: { intent: "BACKORDER", listingId: null, ...chip } }),
    },
  );
  expect(status, `incoming ${body}`).toBe(201);
  return data.slice(1);
}

async function putInbound(
  page: Page,
  date: string | null,
  reason: string,
): Promise<void> {
  const { status } = await fetchStatus(
    page,
    "/api/wholesale/variants/3019/expected-inbound",
    "PUT",
    { expectedInboundDate: date, expectedInboundReason: reason },
  );
  expect(status, "PUT 3019 expected-inbound").toBe(200);
}

/** 되묻기 → 제시된 보기 고름 → AUTO_REPLY 말풍선과 판정 줄 종류 */
async function askAndPick(
  page: Page,
  backorderId: number,
): Promise<{ bubble: Locator; kinds: string[] }> {
  const [clarify] = await inject(page, ASK);
  expect(clarify?.kind).toBe("CLARIFY");
  const picked = (clarify?.autoReply?.choices ?? []).find(
    (c) => c.backorderId === backorderId,
  );
  if (picked === undefined) throw new Error(`보기 ${backorderId} 없음`);
  const decided = await inject(page, picked.label, {
    backorderId,
    variantId: picked.variantId,
  });
  const reply = decided[0];
  expect(reply?.kind).toBe("AUTO_REPLY");
  const bubble = log(page).locator(`[data-sequence="${reply?.sequence}"]`);
  await expect(bubble).toBeVisible();
  await bubble.scrollIntoViewIfNeeded();
  return {
    bubble,
    kinds: decided.map((m) => `${m.kind}:${m.handoff?.reason ?? ""}`),
  };
}

const CASES: {
  name: string;
  put?: { date: string | null; reason: string };
  backorderId: number;
  text: string;
}[] = [
  {
    name: "a-plan-reason",
    backorderId: 9003,
    text: "미송 2장, 입고 예정 11/5(목), 사유 원단 수급 지연",
  },
  { name: "b-undecided", backorderId: 9002, text: "미송 1장, 입고일 미정" },
  {
    name: "c-next-year-blank",
    put: { date: "2027-01-05", reason: "  " },
    backorderId: 9003,
    text: "미송 2장, 입고 예정 2027/1/5(화)",
  },
  {
    name: "d-empty-reason",
    put: { date: "2026-11-05", reason: "" },
    backorderId: 9003,
    text: "미송 2장, 입고 예정 11/5(목)",
  },
  {
    name: "e-past-date",
    put: { date: "2026-10-26", reason: "원단 수급 지연" },
    backorderId: 9003,
    text: "미송 2장, 입고 예정 10/26(월), 사유 원단 수급 지연",
  },
  {
    name: "f-long-reason",
    put: { date: "2026-11-05", reason: LONG_REASON },
    backorderId: 9003,
    text: `미송 2장, 입고 예정 11/5(목), 사유 ${LONG_REASON}`,
  },
];

for (const viewport of [
  { width: 1280, height: 800 },
  { width: 1470, height: 900 },
]) {
  test(`QA 08f-2 ${viewport.width} 근거 칸 미송 줄 6형식(4형식 + 지난 날짜 + 긴 사유): 글자, 넘침 0, 스크린샷`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await installClock(page, T0);
    await login(page);
    await page.goto("/chats?room=1");
    await expect(roomList(page).getByRole("link").first()).toBeVisible();
    const reset = await fetchStatus(page, "/__mock/chat/reset", "POST", {});
    expect(reset.status).toBe(200);
    await expect(log(page)).toBeVisible();

    const record: Record<string, unknown> = {};
    for (const c of CASES) {
      if (c.put !== undefined) await putInbound(page, c.put.date, c.put.reason);
      const { bubble, kinds } = await askAndPick(page, c.backorderId);
      const line = bubble.locator('[data-ac~="08f:S2-2"]');
      await expect(line).toHaveText(c.text);
      const m = await line.evaluate((el) => {
        const bubbleEl = el.closest("[data-sequence]") ?? el;
        const box = el.getBoundingClientRect();
        const bbox = bubbleEl.getBoundingClientRect();
        return {
          lineOverflow: el.scrollWidth - el.clientWidth,
          bubbleOverflow: bubbleEl.scrollWidth - bubbleEl.clientWidth,
          docOverflow:
            document.documentElement.scrollWidth -
            document.documentElement.clientWidth,
          insideBubble: box.left >= bbox.left && box.right <= bbox.right,
          height: Math.round(box.height),
          bold: [...el.querySelectorAll("b, strong")].map((b) => b.textContent),
          color: getComputedStyle(el).color,
          fontSize: getComputedStyle(el).fontSize,
        };
      });
      record[c.name] = { kinds, ...m };
      expect(m.lineOverflow, `${c.name} 줄 넘침`).toBeLessThanOrEqual(0);
      expect(m.bubbleOverflow, `${c.name} 말풍선 넘침`).toBeLessThanOrEqual(0);
      expect(m.docOverflow, `${c.name} 문서 넘침`).toBeLessThanOrEqual(0);
      expect(m.insideBubble, `${c.name} 말풍선 안`).toBe(true);
      expect(kinds.join(" "), `${c.name} INVALID_TARGET 0`).not.toContain(
        "INVALID_TARGET",
      );
      await bubble.screenshot({
        path: `${SHOT}/b3-facts-${c.name}-${viewport.width}.png`,
      });
    }
    test.info().annotations.push({
      type: "근거 줄 실측",
      description: JSON.stringify(record),
    });
  });
}
