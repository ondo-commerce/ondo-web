import { expect, test, type Page } from "@playwright/test";
import {
  ASK_DISCOUNT,
  ASK_RECEIVABLE,
  assertStubServers,
  bodyOf,
  cardLines,
  handoffLines,
  linesAfter,
  messageBySequence,
  mock,
  openRoomById,
  PAYMENT_REPORT,
  receivableCard,
  receivableCards,
  say,
  seenOf,
  settlementLink,
  start,
  waitLinesAfter,
} from "./helpers";

/**
 * loop-07 QA — 소매 쪽(#268). `pnpm e2e:stub` 으로 돈다(파일 이름에 `retail`).
 * 개발 spec(`retail-receivable-reply.spec.ts`)이 안 보는 것만 본다:
 *  1. 누출 구조 단언 — 실제 화면이 받은 send 응답과 GET messages 응답의 키와 facts 값(문자열 검색이 아니라 toEqual)
 *  2. 디자인 결정 46 — 협상 넘김이 열린 채 "방금 입금했어요"면 소매에 "사장님께 전달했어요"가 두 번
 *  3. 기간 말, 조회 실패, 꺼짐 → 금액 0
 *  4. 디자인 실측(토큰, 390/1470 높이) + 스크린샷 `runs/loop-07-receivable-reply/qa/*.png`
 */

assertStubServers();

const SHOTS = ".claude/harness/runs/loop-07-receivable-reply/qa";

/** 소매 ChatMessage 스펙 키(`openapi/retail.json`). 이 밖의 키가 오면 누출이다 */
const RETAIL_MESSAGE_KEYS = [
  "autoReply",
  "body",
  "clientMessageId",
  "id",
  "inquiry",
  "kind",
  "roomId",
  "sender",
  "sentAt",
  "sequence",
].sort();

/** 도매 판정 원본과 도매 응답에만 있어야 하는 키 */
const FORBIDDEN_KEYS = [
  "balance",
  "unpaid",
  "prepaid",
  "exact",
  "asOf",
  "ledgerBalance",
  "retailerName",
  "paidLast7Days",
  "handoff",
  "reason",
  "sourceSequence",
];

interface WireMessage {
  kind: string;
  sequence: number;
  autoReply: {
    intent: string;
    facts: { receivable: unknown };
  } | null;
  [key: string]: unknown;
}

/** 객체 안 모든 키(깊이 전부) */
function allKeys(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(allKeys);
  if (value === null || typeof value !== "object") return [];
  return Object.entries(value).flatMap(([k, v]) => [k, ...allKeys(v)]);
}

/** 화면이 보낸 send 요청의 응답을 기다리며 보낸다 */
async function sayAndCapture(page: Page, text: string): Promise<WireMessage[]> {
  const response = page.waitForResponse(
    (r) =>
      /\/api\/retail\/chat\/rooms\/\d+\/messages$/.test(r.url()) &&
      r.request().method() === "POST",
  );
  await say(page, text);
  const r = await response;
  expect(r.status()).toBe(201);
  const json = (await r.json()) as { data: unknown };
  const data = json.data as
    | WireMessage[]
    | { message: WireMessage; autoReplies?: WireMessage[] }
    | Record<string, unknown>;
  // 응답 모양에 기대지 않으려고 안의 메시지(kind + sequence 있는 객체)를 전부 모은다
  const found: WireMessage[] = [];
  const walk = (v: unknown) => {
    if (Array.isArray(v)) return v.forEach(walk);
    if (v === null || typeof v !== "object") return;
    const o = v as Record<string, unknown>;
    if (typeof o.kind === "string" && typeof o.sequence === "number")
      found.push(o as WireMessage);
    Object.values(o).forEach(walk);
  };
  walk(data);
  return found;
}

/** 브라우저에서 GET messages(목이 받는다) */
async function fetchMessages(
  page: Page,
  roomId: number,
): Promise<WireMessage[]> {
  return page.evaluate(async (roomId) => {
    const r = await fetch(`/api/retail/chat/rooms/${roomId}/messages?size=50`);
    const json = (await r.json()) as { data: WireMessage[] };
    return json.data;
  }, roomId);
}

const FACTS_ROOM1 = {
  outstandingAmount: 37_500,
  prepaidAmount: 0,
  overdue: { count: 1, amount: 37_500, maxDaysOverdue: 54 },
};
const FACTS_ROOM33 = {
  outstandingAmount: 52_000,
  prepaidAmount: 0,
  overdue: { count: 0, amount: 0, maxDaysOverdue: 0 },
};

test("QA-R1 누출 구조: 방 1 send/messages 의 receivable 은 (101,1) 세 칸 그대로, 넘김 줄에 handoff 키 0, 소매 스펙 밖 키 0", async ({
  page,
}) => {
  await start(page, "/");
  await openRoomById(page, 1);

  const ask = await sayAndCapture(page, ASK_RECEIVABLE);
  const replies = ask.filter((m) => m.kind === "AUTO_REPLY");
  expect(replies).toHaveLength(1);
  expect(replies[0]?.autoReply?.intent).toBe("RECEIVABLE");
  expect(replies[0]?.autoReply?.facts.receivable).toEqual(FACTS_ROOM1);

  const discount = await sayAndCapture(page, ASK_DISCOUNT);
  const handoffs = discount.filter((m) => m.kind === "HANDOFF");
  expect(handoffs).toHaveLength(1);
  for (const m of [...ask, ...discount])
    expect(Object.keys(m).sort(), `send 응답 키 seq ${m.sequence}`).toEqual(
      RETAIL_MESSAGE_KEYS,
    );
  const sendKeys = allKeys([...ask, ...discount]);
  for (const k of FORBIDDEN_KEYS)
    expect(sendKeys, `send 키 ${k}`).not.toContain(k);

  const listed = await fetchMessages(page, 1);
  expect(listed.some((m) => m.kind === "HANDOFF")).toBe(true);
  for (const m of listed)
    expect(Object.keys(m).sort(), `messages 키 seq ${m.sequence}`).toEqual(
      RETAIL_MESSAGE_KEYS,
    );
  const listedKeys = allKeys(listed);
  for (const k of FORBIDDEN_KEYS)
    expect(listedKeys, `messages 키 ${k}`).not.toContain(k);
  const listedReply = listed.find((m) => m.sequence === replies[0]?.sequence);
  expect(listedReply?.autoReply?.facts.receivable).toEqual(FACTS_ROOM1);
});

test("QA-R2 다른 도매처 금액 0: 방 33 은 (102,1) facts 그대로, 37,500 이 응답 어디에도 없다", async ({
  page,
}) => {
  await start(page, "/");
  await openRoomById(page, 33);
  const ask = await sayAndCapture(page, ASK_RECEIVABLE);
  const reply = ask.find((m) => m.kind === "AUTO_REPLY");
  expect(reply?.autoReply?.facts.receivable).toEqual(FACTS_ROOM33);
  const raw = JSON.stringify(await fetchMessages(page, 33));
  expect(raw).not.toContain("37500");
  expect(raw).not.toContain("37,500");
});

test("QA-R3 디자인 결정 46: 협상 넘김 열린 채 '방금 입금했어요' → 전달 줄이 한 번 더(총 2), 카드 0", async ({
  page,
}) => {
  await start(page, "/");
  await openRoomById(page, 1);
  await say(page, ASK_DISCOUNT);
  expect(
    (await waitLinesAfter(page, ASK_DISCOUNT, 1)).map((l) => l.kind),
  ).toEqual(["HANDOFF"]);
  await say(page, PAYMENT_REPORT);
  const after = await waitLinesAfter(page, PAYMENT_REPORT, 1);
  expect(after.map((l) => l.kind)).toEqual(["HANDOFF"]);
  expect(after[0]?.text).toContain("사장님께 전달했어요");
  await expect(handoffLines(page)).toHaveCount(2);
  /* 같은 이유(협상)를 또 쓰면 줄이 안 쌓인다(H21) */
  await say(page, "더 깎아 주세요");
  await expect
    .poll(async () => (await linesAfter(page, "더 깎아 주세요", 1)).length, {
      timeout: 4_000,
    })
    .toBe(0);
  await expect(handoffLines(page)).toHaveCount(2);
  await expect(receivableCards(page)).toHaveCount(0);
});

for (const [name, text] of [
  ["기간 말", "이번 달 미수 얼마예요?"],
  ["기간 말 + 얼마만", "이번 달 얼마예요?"],
  ["입금 + 미수", "입금했는데 미수 얼마예요?"],
  ["미수 + 남았", "미수 얼마나 남았어요?"],
] as const)
  test(`QA-R4 금액 없이 넘김(${name}): '${text}' → 새 줄 = 넘김 줄 1, 카드 0, 금액 0`, async ({
    page,
  }) => {
    await start(page, "/");
    await openRoomById(page, 1);
    await say(page, text);
    const after = await waitLinesAfter(page, text, 1);
    expect(after.map((l) => l.kind)).toEqual(["HANDOFF"]);
    expect(after.map((l) => l.text).join("")).not.toMatch(/\d+,\d{3}원/);
    await expect(receivableCards(page)).toHaveCount(0);
  });

test("QA-R5 조회 실패(fail receivable) → 전달 줄, 다음 질문은 정상 카드", async ({
  page,
}) => {
  await start(page, "/");
  await openRoomById(page, 1);
  await mock(page, "fail", { op: "receivable", times: 1 });
  await say(page, ASK_RECEIVABLE);
  const first = await waitLinesAfter(page, ASK_RECEIVABLE, 1);
  expect(first.map((l) => l.kind)).toEqual(["HANDOFF"]);
  await say(page, ASK_RECEIVABLE);
  const second = await waitLinesAfter(page, ASK_RECEIVABLE, 1, 2);
  expect(second.map((l) => l.kind)).toEqual(["AUTO_REPLY"]);
  expect(
    await cardLines(
      receivableCard(messageBySequence(page, second[0]?.sequence ?? -1)),
    ),
  ).toEqual(["갚을 돈 37,500원", "기한 지남 1건 37,500원 (최대 54일)"]);
});

test("QA-R6 미수만 꺼짐 → 넘김, 카드 0", async ({ page }) => {
  await start(page, "/");
  await openRoomById(page, 1);
  await mock(page, "auto-reply", {
    enabled: true,
    intents: { STOCK: true, BACKORDER: true, RECEIVABLE: false },
  });
  await say(page, ASK_RECEIVABLE);
  const after = await waitLinesAfter(page, ASK_RECEIVABLE, 1);
  expect(after.map((l) => l.kind)).toEqual(["HANDOFF"]);
  await expect(receivableCards(page)).toHaveCount(0);
});

/** 카드 실측. 토큰 값은 `:root` 의 CSS 변수를 같은 요소에 칠해 계산된 값으로 비교한다 */
async function measureCard(page: Page, sequence: number) {
  return messageBySequence(page, sequence).evaluate((root) => {
    const token = (name: string, prop: "color" | "borderTopColor") => {
      const probe = document.createElement("span");
      probe.style.setProperty(
        prop === "color" ? "color" : "border-top-color",
        `var(${name})`,
      );
      document.body.append(probe);
      const v = getComputedStyle(probe)[prop];
      probe.remove();
      return v;
    };
    const card = root.querySelector<HTMLElement>("[data-receivable-card]");
    const link = card?.querySelector<HTMLElement>("a");
    const strong = card?.querySelector<HTMLElement>("b");
    const line = card?.querySelector<HTMLElement>("[data-line]");
    const seen = root.querySelector<HTMLElement>("[data-seen]");
    const cs = (el: HTMLElement | null | undefined) =>
      el ? getComputedStyle(el) : null;
    const reds = [...(card?.querySelectorAll<HTMLElement>("*") ?? [])].filter(
      (el) =>
        getComputedStyle(el).color === token("--color-destructive", "color"),
    ).length;
    return {
      cardBorderTop: cs(card)?.borderTopColor,
      tokenBorder: token("--color-border", "borderTopColor"),
      cardBorderWidth: cs(card)?.borderTopWidth,
      lineColor: cs(line)?.color,
      tokenSecondary: token("--color-secondary-foreground", "color"),
      lineSize: cs(line)?.fontSize,
      strongColor: cs(strong)?.color,
      tokenForeground: token("--color-foreground", "color"),
      strongWeight: cs(strong)?.fontWeight,
      seenSize: cs(seen)?.fontSize,
      seenColor: cs(seen)?.color,
      tokenMuted: token("--color-muted-foreground", "color"),
      linkHeight: link?.getBoundingClientRect().height ?? 0,
      linkLines: link
        ? Math.round(
            link.getBoundingClientRect().height /
              parseFloat(getComputedStyle(link).lineHeight || "20"),
          )
        : 0,
      linkWhiteSpaceWraps: link ? link.scrollWidth > link.clientWidth : true,
      linkRadius: cs(link)?.borderTopLeftRadius,
      linkDecoration: cs(link)?.textDecorationLine,
      reds,
      docOverflow:
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth,
    };
  });
}

for (const width of [1470, 390] as const)
  test(`QA-R7 디자인 실측 ${width}: 카드 위 선 = border, 줄 = secondary 13px, 굵게 = foreground 500, 조회 = muted 12px, 링크 ${width === 390 ? "44" : "28"}px 한 줄, 빨강 0, 가로 넘침 0`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    await start(page, "/");
    await openRoomById(page, 1);
    await say(page, ASK_RECEIVABLE);
    const after = await waitLinesAfter(page, ASK_RECEIVABLE, 1);
    const seq = after[0]?.sequence ?? -1;
    const reply = messageBySequence(page, seq);
    await expect(seenOf(reply)).toHaveText("14:20 조회");
    await settlementLink(receivableCard(reply)).scrollIntoViewIfNeeded();
    const m = await measureCard(page, seq);
    expect(m.cardBorderTop).toBe(m.tokenBorder);
    expect(m.cardBorderWidth).toBe("1px");
    expect(m.lineColor).toBe(m.tokenSecondary);
    expect(m.lineSize).toBe("13px");
    expect(m.strongColor).toBe(m.tokenForeground);
    expect(m.strongWeight).toBe("500");
    expect(m.seenSize).toBe("12px");
    expect(m.seenColor).toBe(m.tokenMuted);
    expect(m.linkHeight).toBe(width === 390 ? 44 : 28);
    expect(m.linkWhiteSpaceWraps).toBe(false);
    expect(m.linkDecoration).toBe("none");
    expect(m.reds).toBe(0);
    expect(m.docOverflow).toBe(false);
    await reply.screenshot({ path: `${SHOTS}/retail-card-${width}.png` });
    if (width === 390)
      await page.screenshot({ path: `${SHOTS}/retail-room-390.png` });
  });

test("QA-R8 정산 링크를 누르면 같은 탭에서 /settlements?wholesaler=101 로 간다", async ({
  page,
}) => {
  await start(page, "/");
  await openRoomById(page, 1);
  await say(page, ASK_RECEIVABLE);
  const after = await waitLinesAfter(page, ASK_RECEIVABLE, 1);
  const reply = messageBySequence(page, after[0]?.sequence ?? -1);
  await expect(bodyOf(reply)).toContainText("37,500원");
  const pages = page.context().pages().length;
  await settlementLink(receivableCard(reply)).click();
  await expect(page).toHaveURL("/settlements?wholesaler=101");
  expect(page.context().pages().length).toBe(pages);
  /* 정산 화면 내용은 보지 않는다 — 가짜 API(stub-api.ts)에 원장 경로 `/api/retail/settlements/{id}/ledger`가 없어
     error.tsx("지금 화면을 불러올 수 없어요")가 뜬다. 주소와 같은 탭 이동까지만 이 설정의 보장 범위다(기획 §2-1) */
});
