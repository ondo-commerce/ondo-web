import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  installClock,
  log,
  login,
  mock,
  roomList,
  row,
  watchRequests,
} from "../loop-04-chat/helpers";

/**
 * loop-07 QA — 도매 쪽(#302). 기본 설정 wholesale 프로젝트가 돈다(파일 이름 `wholesale-` 접두어 매칭).
 * 개발 spec(`wholesale-handoff-reason.spec.ts`)은 방 1만 본다. 여기는:
 *  1. 소유권 — 방 2(대기상회, 소매처 2)에 봄봄상회(소매처 1) 37,500 이 새지 않는다(소매처 필터 변이를 화면이 잡는지)
 *  2. 넘김 이유 8개 중 개발 e2e 밖 5개(NO_RELATION, PERIOD, MULTI_INTENT, LOOKUP_FAILED, OFF)
 *  3. 재고 의도 유지 — "이 셔츠 얼마 남았어요?"는 재고 쪽, 미수 금액 0
 *  4. 같은 이유 반복 → 줄 0(H21), 디자인 실측 + 스크린샷
 */

const T0 = new Date("2026-10-29T14:20:00+09:00");
const ASK = "지금 미수 얼마예요?";
const SHOTS = ".claude/harness/runs/loop-07-receivable-reply/qa";

const REASON = {
  NEGOTIATION: "가격, 외상, 교환, 반품 이야기예요",
  MULTI_INTENT: "한 번에 두 가지를 물었어요",
  PAYMENT_REPORT: "입금했다는 말이에요. 정산 탭에서 입금을 확인해 주세요",
  PERIOD: "기간을 정해 물었어요. 기간별 금액은 자동으로 답하지 않아요",
  AMOUNT_UNSURE: "잔액과 연체 내역 확인이 필요해요",
  NO_RELATION: "정산 기록이 없는 소매처예요",
  LOOKUP_FAILED: "정산 조회에 실패했어요",
  OFF: "자동 답변이 꺼져 있어요",
} as const;

interface Injected {
  kind: string;
  sequence: number;
  body: string;
  handoff?: {
    reason: string;
    intent: string | null;
    sourceSequence: number;
  } | null;
  autoReply?: {
    intent: string;
    facts: { receivable: unknown; stock: unknown };
  } | null;
}

interface Line {
  kind: string;
  reason: string | null;
  reasonText: string | null;
  sequence: number | null;
  text: string;
}

async function reset(page: Page): Promise<void> {
  const status = await page.evaluate(async () => {
    const r = await fetch("/__mock/chat/reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    return r.status;
  });
  expect(status, "채팅 목 reset").toBe(200);
}

async function inject(
  page: Page,
  roomId: number,
  body: string,
): Promise<{ source: Injected; made: Injected[] }> {
  const { status, data } = await page.evaluate(
    async ({ roomId, body }) => {
      const r = await fetch(`/__mock/chat/rooms/${roomId}/incoming`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body, autoReply: true }),
      });
      const json = (await r.json()) as { data: Injected[] };
      return { status: r.status, data: json.data };
    },
    { roomId, body },
  );
  expect(status, `incoming ${body}`).toBe(201);
  const [source, ...made] = data;
  if (source === undefined) throw new Error("넣은 메시지가 응답에 없다");
  expect(source.body).toBe(body);
  return { source, made };
}

function linesAfter(page: Page, source: Injected): Promise<Line[]> {
  return log(page).evaluate((root, sequence) => {
    const nodes = [...root.querySelectorAll<HTMLElement>("[data-kind]")];
    const at = nodes.findIndex((n) => n.dataset.sequence === String(sequence));
    if (at < 0) return [];
    return nodes.slice(at + 1).map((node) => ({
      kind: node.dataset.kind ?? "",
      reason: node.dataset.reason ?? null,
      reasonText:
        node.querySelector<HTMLElement>("[data-reason-text]")?.textContent ??
        null,
      sequence:
        node.dataset.sequence === undefined
          ? null
          : Number(node.dataset.sequence),
      text: node.textContent ?? "",
    }));
  }, source.sequence);
}

async function waitLinesAfter(
  page: Page,
  source: Injected,
  n: number,
): Promise<Line[]> {
  await expect
    .poll(async () => (await linesAfter(page, source)).length)
    .toBe(n);
  return linesAfter(page, source);
}

function handoffNotes(page: Page): Locator {
  return log(page).locator('[role="note"][data-kind="HANDOFF"]');
}

/** 목록에서 방을 연다(클라이언트 이동 — 목 저장소가 남는다) */
async function openRoom(page: Page, name: string, roomId: number) {
  await row(page, name).click();
  await expect(page).toHaveURL(new RegExp(`room=${roomId}$`));
  await expect(log(page)).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await watchRequests(page);
  await installClock(page, T0);
  await login(page);
  await page.goto("/chats?room=1");
  await expect(roomList(page).getByRole("link").first()).toBeVisible();
  await reset(page);
  await expect(log(page)).toBeVisible();
});

test("QA-W1 소유권: 방 2(대기상회, 소매처 2) 미수 → '지금 갚을 돈은 없어요', 응답과 화면 어디에도 37,500 없음", async ({
  page,
}) => {
  await openRoom(page, "대기상회", 2);
  const asked = await inject(page, 2, ASK);
  expect(asked.made.map((m) => m.kind)).toEqual(["AUTO_REPLY"]);
  expect(asked.made[0]?.autoReply?.facts.receivable).toEqual({
    outstandingAmount: 0,
    prepaidAmount: 0,
    overdue: { count: 0, amount: 0, maxDaysOverdue: 0 },
  });
  expect(asked.made[0]?.body).toBe("지금 갚을 돈은 없어요");
  const [line] = await waitLinesAfter(page, asked.source, 1);
  expect(line?.kind).toBe("AUTO_REPLY");
  expect(line?.text).toContain("지금 갚을 돈은 없어요");
  expect(line?.text).not.toContain("37,500");
  /* 방 2 는 시드 넘김(협상)이 열려 있다 — 미수 답은 넘김 줄 없이 금액만 */
  await expect(handoffNotes(page)).toHaveCount(1);
});

test("QA-W2 NO_RELATION: 방 4(나래옷방, 정산 기록 없음) 미수 → 넘김 줄 + '정산 기록이 없는 소매처예요', 금액 0", async ({
  page,
}) => {
  await openRoom(page, "나래옷방", 4);
  const asked = await inject(page, 4, ASK);
  expect(asked.made.map((m) => [m.kind, m.handoff?.reason])).toEqual([
    ["HANDOFF", "NO_RELATION"],
  ]);
  expect(asked.made[0]?.handoff?.sourceSequence).toBe(asked.source.sequence);
  expect(await waitLinesAfter(page, asked.source, 1)).toMatchObject([
    { kind: "HANDOFF", reason: "NO_RELATION", reasonText: REASON.NO_RELATION },
  ]);
});

for (const [text, reason] of [
  ["이번 달 미수 얼마예요?", "PERIOD"],
  ["지난달 외상 얼마예요", "PERIOD"],
  ["미수랑 미송 같이 알려 주세요", "MULTI_INTENT"],
  ["입금했는데 미수 얼마예요?", "PAYMENT_REPORT"],
] as const)
  test(`QA-W3 이유 줄: '${text}' → ${reason}`, async ({ page }) => {
    const asked = await inject(page, 1, text);
    expect(asked.made.map((m) => [m.kind, m.handoff?.reason])).toEqual([
      ["HANDOFF", reason],
    ]);
    expect(await waitLinesAfter(page, asked.source, 1)).toMatchObject([
      { kind: "HANDOFF", reason, reasonText: REASON[reason] },
    ]);
  });

test("QA-W4 '이번 달 얼마예요?'(미수 낱말 없음) → 넘김, 금액 0. 이유 값을 기록한다", async ({
  page,
}) => {
  const asked = await inject(page, 1, "이번 달 얼마예요?");
  expect(asked.made.map((m) => m.kind)).toEqual(["HANDOFF"]);
  const lines = await waitLinesAfter(page, asked.source, 1);
  test.info().annotations.push({
    type: "reason",
    description: `${asked.made[0]?.handoff?.reason} / 이유 줄: ${lines[0]?.reasonText}`,
  });
  expect(lines[0]?.text).not.toMatch(/\d+,\d{3}원/);
});

test("QA-W5 LOOKUP_FAILED → 이유 줄, 다음 질문은 정상 답(조회 실패가 500 이 아니다)", async ({
  page,
}) => {
  await mock(page, "fail", { op: "receivable", times: 1 });
  const failed = await inject(page, 1, ASK);
  expect(await waitLinesAfter(page, failed.source, 1)).toMatchObject([
    {
      kind: "HANDOFF",
      reason: "LOOKUP_FAILED",
      reasonText: REASON.LOOKUP_FAILED,
    },
  ]);
  const next = await inject(page, 1, ASK);
  expect(next.made.map((m) => m.kind)).toEqual(["AUTO_REPLY"]);
});

test("QA-W6 RECEIVABLE 만 꺼짐 → OFF 이유 줄", async ({ page }) => {
  await mock(page, "auto-reply", {
    enabled: true,
    intents: { STOCK: true, BACKORDER: true, RECEIVABLE: false },
  });
  const asked = await inject(page, 1, ASK);
  expect(await waitLinesAfter(page, asked.source, 1)).toMatchObject([
    { kind: "HANDOFF", reason: "OFF", reasonText: REASON.OFF },
  ]);
});

test("QA-W7 재고 의도 유지: 상품 문맥 + '이 셔츠 얼마 남았어요?' → 재고 쪽(STOCK), 미수 금액 0", async ({
  page,
}) => {
  await mock(page, "rooms/1/context", { listingId: 2001 });
  const asked = await inject(page, 1, "이 셔츠 얼마 남았어요?");
  expect(asked.made.length).toBeGreaterThan(0);
  test.info().annotations.push({
    type: "made",
    description: JSON.stringify(
      asked.made.map((m) => [m.kind, m.autoReply?.intent, m.handoff?.reason]),
    ),
  });
  for (const m of asked.made) {
    if (m.autoReply) expect(m.autoReply.intent).toBe("STOCK");
    expect(m.body).not.toContain("갚을 돈");
  }
  const lines = await waitLinesAfter(page, asked.source, asked.made.length);
  expect(lines.map((l) => l.text).join("")).not.toContain("37,500");
});

test("QA-W8 같은 이유 반복(H21): 협상 두 번 → 넘김 줄 1, 사장 답 뒤 협상 → 새 줄", async ({
  page,
}) => {
  const one = await inject(page, 1, "조금 깎아 주세요");
  expect(one.made.map((m) => m.kind)).toEqual(["HANDOFF"]);
  const two = await inject(page, 1, "더 깎아 주세요");
  expect(two.made).toEqual([]);
  await expect(handoffNotes(page)).toHaveCount(1);
  await expect(linesAfter(page, two.source)).resolves.toEqual([]);
});

test("QA-W9 디자인 실측: 이유 줄 13px secondary 가운데, 알약 border-strong 둥근 모서리, 묶음 note 1개, 1470 스크린샷", async ({
  page,
}) => {
  await inject(page, 1, "조금 깎아 주세요");
  await inject(page, 1, "방금 입금했어요");
  await expect(handoffNotes(page)).toHaveCount(2);
  const m = await handoffNotes(page)
    .nth(1)
    .evaluate((note) => {
      const token = (name: string) => {
        const probe = document.createElement("span");
        probe.style.color = `var(${name})`;
        document.body.append(probe);
        const v = getComputedStyle(probe).color;
        probe.remove();
        return v;
      };
      const pill = note.querySelector<HTMLElement>(":scope > span");
      const why = note.querySelector<HTMLElement>("[data-reason-text]");
      const p = pill ? getComputedStyle(pill) : null;
      const w = why ? getComputedStyle(why) : null;
      return {
        whySize: w?.fontSize,
        whyColor: w?.color,
        whyAlign: w?.textAlign,
        whyAc: why?.dataset.ac,
        tokenSecondary: token("--color-secondary-foreground"),
        pillBorder: p?.borderTopColor,
        tokenBorderStrong: token("--color-border-strong"),
        pillRadius: p ? parseFloat(p.borderTopLeftRadius) : 0,
        pillHeight: pill?.getBoundingClientRect().height ?? 0,
        whyOverflow: why ? why.scrollWidth > why.clientWidth : true,
        roles: note.querySelectorAll("[role]").length,
      };
    });
  expect(m.whySize).toBe("13px");
  expect(m.whyColor).toBe(m.tokenSecondary);
  expect(m.whyAlign).toBe("center");
  expect(m.whyAc).toBe("S3-1");
  expect(m.pillBorder).toBe(m.tokenBorderStrong);
  expect(m.pillRadius).toBeGreaterThanOrEqual(m.pillHeight / 2 - 1);
  expect(m.whyOverflow).toBe(false);
  expect(m.roles).toBe(0);
  await page.screenshot({ path: `${SHOTS}/wholesale-handoff-reason-1470.png` });
});

/* F1: 고치기 전 잡힌 요소 = 방 1 새 자동 답 안 `<span data-ac="S7-13">14:20 조회</span>`(loop-04 번호만).
   이제 `data-ac="S7-13 S3-5 S3-3"` — test.fail 을 뗐다 */
test('QA-W10 data-ac: 근거 칸 조회 시각에 07 번호(S3-5)가 있는가 — 와이어프레임 #state-rc-seen-date `.seen data-ac="S3-5 S3-3"`', async ({
  page,
}) => {
  const asked = await inject(page, 1, ASK);
  const [line] = await waitLinesAfter(page, asked.source, 1);
  const seen = log(page)
    .locator(`[data-sequence="${line?.sequence}"]`)
    .getByText("14:20 조회", { exact: true });
  await expect(seen).toHaveCount(1);
  const ac = (await seen.getAttribute("data-ac")) ?? "";
  test.info().annotations.push({ type: "data-ac", description: ac });
  expect(ac.split(" ")).toContain("S3-5");
});

/* F4: 고치기 전엔 재고 되묻기 [CLARIFY, STOCK, "어떤 색상, 사이즈요?"]가 나왔다. 이제 "얼마" + 기간 말이면 PERIOD 넘김 */
test("QA-W11 loop-04 원안 문장 '이번 달 얼마 남았어요?'(상품 문맥 있음) → 기간 말이 있으니 넘김, 미수 금액 0", async ({
  page,
}) => {
  await mock(page, "rooms/1/context", { listingId: 2001 });
  const asked = await inject(page, 1, "이번 달 얼마 남았어요?");
  test.info().annotations.push({
    type: "made",
    description: JSON.stringify(
      asked.made.map((m) => [
        m.kind,
        m.autoReply?.intent,
        m.handoff?.reason,
        m.body,
      ]),
    ),
  });
  for (const m of asked.made) expect(m.body).not.toContain("갚을 돈");
  expect(
    asked.made.map((m) => [m.kind, m.handoff?.reason, m.handoff?.intent]),
  ).toEqual([["HANDOFF", "PERIOD", "RECEIVABLE"]]);
});

test("QA-W12 정산 탭 봄봄상회 행 숫자와 채팅 답 37,500 대조(스크린샷)", async ({
  page,
}) => {
  await page
    .getByRole("navigation", { name: "주 메뉴" })
    .getByRole("link", { name: "정산", exact: true })
    .click();
  await expect(page).toHaveURL(/\/settlements/);
  const toggle = page.getByRole("button", { name: "봄봄상회 펼치기" });
  await expect(toggle).toBeVisible();
  const rowText = await toggle.locator("xpath=ancestor::tr[1]").textContent();
  test.info().annotations.push({ type: "row", description: rowText ?? "" });
  await page.screenshot({ path: `${SHOTS}/wholesale-settlements-1470.png` });
  expect(rowText ?? "").toContain("37,500");
});
