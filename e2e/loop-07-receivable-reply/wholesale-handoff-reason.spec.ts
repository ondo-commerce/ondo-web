import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  COUNT_GET,
  chatLink,
  count,
  requests,
  settled,
  waitCount,
} from "../loop-05b2-notify-read/helpers";
import {
  composer,
  installClock,
  log,
  login,
  MESSAGES_GET,
  roomList,
  row,
  SEND_POST,
  watchRequests,
} from "../loop-04-chat/helpers";

/**
 * #302 S3 도매 넘김 이유 줄, 닫힘, 입금 뒤 새 금액(loop-07 01-plan §2-1 4~6, §4-2, §4-3 4 5, §6 S3, 디자인 결정
 * 39~44). 와이어프레임 `17_wholesale-chat` `#state-handoff-reason` `#state-rc-scene3` `#state-rc-latest`
 * (`data-loop="07"` 섹션 — S3-n 번호가 loop-04와 겹친다).
 *
 * 소매 메시지는 목 손잡이 `incoming {autoReply: true}`로 방 1(봄봄상회, 도매처 101 × 소매처 1)에 넣는다(06a와 같다).
 * 입금은 정산 탭 화면으로 등록한다 — 사장이 실제로 하는 길이고, 정산 목과 채팅 목이 같은 페이지 안 저장소라 다음
 * 미수 답이 그 입금을 바로 읽는다(계약 02-dev S1-6). 화면 이동은 전부 클라이언트 이동이다(`page.goto`면 목이 시드로).
 *
 * 시각: T0 = 2026-10-29 14:20(서울)에 **reset 전에** 고정한다. 정산 시드 7004(9/4 출고 37,500원)라 T0 연체는 54일.
 * 시계는 흐른다. 배지 polling(30초)은 `fastForward`로 민다.
 *
 * "새 줄"은 넣은 소매 메시지 뒤에 그려진 줄만 본다(앞 회차 교훈: 새 말풍선만 정확 값 단언). 방에 같은 글이 이미
 * 있어도 통과하지 않게, DOM 순서(= sequence 순서)로 그 메시지 다음 줄을 잘라 온다.
 */

const T0 = new Date("2026-10-29T14:20:00+09:00");
const ASK = "지금 미수 얼마예요?";
const DISCOUNT = "조금 깎아 주세요";
const PAID = "방금 입금했어요";
const OWNER_REPLY = "확인하고 바로 연락드릴게요";

const BODY_B =
  "갚을 돈은 37,500원이에요. 그중 기한 지난 것 1건, 37,500원이에요";
const BODY_D =
  "지금 갚을 돈은 없어요. 미리 낸 돈(선수금) 12,500원이 남아 있어요";
const HANDOFF_PILL = "자동 답변이 답하지 못했어요. 직접 답해 주세요";
const REASON = {
  NEGOTIATION: "가격, 외상, 교환, 반품 이야기예요",
  PAYMENT_REPORT: "입금했다는 말이에요. 정산 탭에서 입금을 확인해 주세요",
  AMOUNT_UNSURE: "잔액과 연체 내역 확인이 필요해요",
} as const;

const PAYMENT_POST = {
  path: /\/api\/wholesale\/payments$/,
  method: "POST",
} as const;

interface Injected {
  kind: string;
  sequence: number;
  body: string;
}

/** 넣은 소매 메시지 뒤에 그려진 줄 하나 */
interface Line {
  kind: string;
  /** 넘김 줄의 `handoff.reason`. 다른 줄은 null */
  reason: string | null;
  /** 넘김 줄 아래 이유 글. 없으면 null */
  reasonText: string | null;
  /** 말풍선이면 sequence. 넘김 줄은 null(그 줄엔 sequence 속성이 없다) */
  sequence: number | null;
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

/** 방 1에 소매 메시지를 넣고 판정을 돌린다. [넣은 메시지, ...판정이 만든 줄] */
async function inject(
  page: Page,
  body: string,
): Promise<{ source: Injected; made: Injected[] }> {
  const { status, data } = await page.evaluate(async (body) => {
    const response = await fetch("/__mock/chat/rooms/1/incoming", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body, autoReply: true }),
    });
    const json = (await response.json()) as { data: Injected[] };
    return { status: response.status, data: json.data };
  }, body);
  expect(status, `incoming ${body}`).toBe(201);
  const [source, ...made] = data;
  expect(source?.body).toBe(body);
  if (source === undefined) throw new Error("넣은 메시지가 응답에 없다");
  return { source, made };
}

/** `source` 뒤에 그려진 줄들(화면 순서) */
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
    }));
  }, source.sequence);
}

/** `source` 뒤 줄이 `n`개가 될 때까지(polling 3초) 기다린 뒤 돌려준다 */
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

function bubble(page: Page, sequence: number | undefined): Locator {
  expect(sequence, "말풍선 sequence").toBeDefined();
  return log(page).locator(`[data-sequence="${sequence}"]`);
}

/** 근거 칸 끝 조회 시각 줄. 와이어프레임 07 `.seen data-ac="S3-5 S3-3"`(QA F1) — loop-04 번호 S7-13과 같은 요소 */
function seenLine(bubble: Locator): Locator {
  return bubble.locator('[data-ac~="S3-5"]');
}

function handoffNotes(page: Page): Locator {
  return log(page).locator('[role="note"][data-kind="HANDOFF"]');
}

/** 오른쪽 방 패널 */
function roomPanel(page: Page): Locator {
  return page.locator('[data-ac="S2-5 S3-9"]');
}

/** 방 머리 `답 필요` */
function needsReplyBadge(page: Page): Locator {
  return roomPanel(page)
    .locator('[data-ac="S2-2"]')
    .getByText("답 필요", { exact: true });
}

/** 채팅 링크 이름(`features/notification/derive` 규칙): 0이면 숫자 없이 "채팅" */
function chatLabel(n: number): string {
  return n > 0 ? `채팅, 답 필요 ${n}건` : "채팅";
}

/**
 * 다음 30초 count를 밀고, 그 응답의 `chatsNeedingReply`가 헤더 이름에 **그려질 때까지** 기다린 뒤 그 수를 돌려준다.
 *
 * QA F2: 응답 settle만 기다리고 바로 aria-label을 읽으면, 부하가 있을 때 React가 다시 그리기 전 값(첫 자동 답
 * 전 3건)을 읽었다. 그래서 기준을 응답 본문에서 잡고 화면이 그 값이 되는 것을 확인한다.
 * 앞서 날아간 count가 다 끝난 뒤에 응답 대기를 건다 — 밀기 전 요청의 응답(옛 값)을 잡지 않게.
 */
async function nextPoll(page: Page): Promise<number> {
  await expect
    .poll(async () =>
      (await requests(page, COUNT_GET)).every((r) => r.status !== null),
    )
    .toBe(true);
  const before = await count(page, COUNT_GET);
  const response = page.waitForResponse(
    (r) => COUNT_GET.path.test(r.url()) && r.request().method() === "GET",
  );
  await page.clock.fastForward(30_000);
  await waitCount(page, COUNT_GET, before + 1);
  const body = (await (await response).json()) as {
    data: { chatsNeedingReply: number };
  };
  const n = body.data.chatsNeedingReply;
  await expect(chatLink(page)).toHaveAccessibleName(chatLabel(n));
  return n;
}

/** 헤더 채팅 → 방 1. 클라이언트 이동 */
async function openRoom1(page: Page): Promise<void> {
  await chatLink(page).click();
  await expect(roomList(page).getByRole("link").first()).toBeVisible();
  await row(page, "봄봄상회").click();
  await expect(page).toHaveURL(/room=1$/);
  await expect(log(page)).toBeVisible();
}

/**
 * 주 메뉴 정산 → 봄봄상회 펼치기 → 입금액 → 버튼. `settle`이면 `입금 및 정산`(배분 표 자동 채움: 7004에 37,500),
 * 아니면 `입금만 진행`(배분 없음 = 선수금). 보낸 본문을 돌려준다.
 */
async function registerPayment(
  page: Page,
  amount: number,
  mode: "settle" | "paymentOnly",
): Promise<unknown> {
  await page
    .getByRole("navigation", { name: "주 메뉴" })
    .getByRole("link", { name: "정산", exact: true })
    .click();
  await expect(page).toHaveURL(/\/settlements/);
  await page.getByRole("button", { name: "봄봄상회 펼치기" }).click();
  await page.getByLabel("입금액", { exact: true }).fill(String(amount));
  const button = page.getByRole("button", {
    name: mode === "settle" ? "입금 및 정산" : "입금만 진행",
    exact: true,
  });
  await expect(button).toBeEnabled();
  const done = page.waitForResponse(
    (r) => PAYMENT_POST.path.test(r.url()) && r.request().method() === "POST",
  );
  await button.click();
  const response = await done;
  expect(response.status(), "입금 등록").toBe(201);
  return response.request().postDataJSON();
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

test("S3-1 넘김 줄 + 이유 한 줄: NEGOTIATION, 이유가 바뀐 PAYMENT_REPORT 새 줄. note 하나로 묶이고 링크, 버튼 0", async ({
  page,
}) => {
  const discount = await inject(page, DISCOUNT);
  expect(discount.made.map((m) => m.kind)).toEqual(["HANDOFF"]);
  expect(await waitLinesAfter(page, discount.source, 1)).toEqual([
    {
      kind: "HANDOFF",
      reason: "NEGOTIATION",
      reasonText: REASON.NEGOTIATION,
      sequence: null,
    },
  ]);

  const paid = await inject(page, PAID);
  expect(paid.made.map((m) => m.kind)).toEqual(["HANDOFF"]);
  expect(await waitLinesAfter(page, paid.source, 1)).toEqual([
    {
      kind: "HANDOFF",
      reason: "PAYMENT_REPORT",
      reasonText: REASON.PAYMENT_REPORT,
      sequence: null,
    },
  ]);

  /* 이유가 다른 넘김 줄 둘은 둘 다 그대로(디자인 결정 41). 알약과 이유가 note 하나 — 낭독은 한 번(결정 39) */
  const notes = handoffNotes(page);
  await expect(notes).toHaveCount(2);
  await expect(notes.nth(0)).toHaveText(
    new RegExp(
      `^시스템, \\d\\d:\\d\\d: ${HANDOFF_PILL}\\d\\d:\\d\\d${REASON.NEGOTIATION}$`,
    ),
  );
  await expect(notes.nth(1).locator("[data-reason-text]")).toHaveText(
    REASON.PAYMENT_REPORT,
  );
  /* 묶음 안 note 는 하나(이유 줄에 role 없음). "정산 탭"은 글자 — 링크, 버튼 0(결정 40) */
  await expect(notes.nth(1).getByRole("note")).toHaveCount(0);
  await expect(notes.nth(1).getByRole("link")).toHaveCount(0);
  await expect(notes.nth(1).getByRole("button")).toHaveCount(0);
  /* 이유 줄은 알약 아래(같은 묶음, 세로) */
  const pill = await notes
    .nth(1)
    .locator(":scope > span")
    .first()
    .boundingBox();
  const why = await notes.nth(1).locator("[data-reason-text]").boundingBox();
  expect(why && pill ? why.y >= pill.y + pill.height : false).toBe(true);
});

test("S3-2 장면 3 도매 절반: 미수 답 → 협상 넘김(답 필요, 배지 +1) → 미수 답(답 필요 그대로) → 입금 넘김 새 줄 → 사장 답(닫힘, 배지 −1), 입금 0건", async ({
  page,
}) => {
  /* 1. 미수 답 + 근거 + 14:20 조회. 미수 답엔 넘김 줄이 없다 */
  const first = await inject(page, ASK);
  expect(first.made.map((m) => m.kind)).toEqual(["AUTO_REPLY"]);
  const [firstLine] = await waitLinesAfter(page, first.source, 1);
  expect(firstLine?.kind).toBe("AUTO_REPLY");
  const firstReply = bubble(page, firstLine?.sequence ?? undefined);
  await expect(firstReply).toContainText(BODY_B);
  await expect(firstReply).toContainText("미결제 37,500원, 선수금 0원");
  await expect(firstReply).toContainText("연체 1건 37,500원 (최대 54일)");
  await expect(seenLine(firstReply)).toHaveText("14:20 조회");
  /* 시드의 마지막 소매 말에 자동 답이 붙어 방 1은 답 필요가 아니다 — 여기서 배지 기준을 잡는다 */
  await expect(needsReplyBadge(page)).toHaveCount(0);
  const before = await nextPoll(page);

  /* 2. 협상 → 넘김 줄 + NEGOTIATION 이유, 답 필요, 30초 뒤 배지 +1 */
  const discount = await inject(page, DISCOUNT);
  expect(await waitLinesAfter(page, discount.source, 1)).toEqual([
    {
      kind: "HANDOFF",
      reason: "NEGOTIATION",
      reasonText: REASON.NEGOTIATION,
      sequence: null,
    },
  ]);
  await expect(needsReplyBadge(page)).toBeVisible();
  await nextPoll(page);
  await expect(chatLink(page)).toHaveAccessibleName(
    `채팅, 답 필요 ${before + 1}건`,
  );

  /* 3. 열린 넘김 중 미수 → 자동 답만(넘김 줄 0), 금액 같음. 자동 답으로는 안 닫힌다 */
  const again = await inject(page, ASK);
  expect(again.made.map((m) => m.kind)).toEqual(["AUTO_REPLY"]);
  const [againLine] = await waitLinesAfter(page, again.source, 1);
  const againReply = bubble(page, againLine?.sequence ?? undefined);
  await expect(againReply).toContainText(BODY_B);
  await expect(seenLine(againReply)).toHaveText(/^\d\d:\d\d 조회$/);
  await expect(handoffNotes(page)).toHaveCount(1);
  await expect(needsReplyBadge(page)).toBeVisible();

  /* 4. 입금 알림 → 이유가 달라 새 넘김 줄 */
  const paid = await inject(page, PAID);
  expect(await waitLinesAfter(page, paid.source, 1)).toEqual([
    {
      kind: "HANDOFF",
      reason: "PAYMENT_REPORT",
      reasonText: REASON.PAYMENT_REPORT,
      sequence: null,
    },
  ]);
  await expect(handoffNotes(page)).toHaveCount(2);

  /* 5. 사장 TEXT → 닫힘: 답 필요 사라짐, 30초 뒤 배지 −1 */
  const sent = page.waitForResponse(
    (r) => SEND_POST.path.test(r.url()) && r.request().method() === "POST",
  );
  await composer(page).fill(OWNER_REPLY);
  await composer(page).press("Enter");
  expect((await sent).status()).toBe(201);
  await expect(
    log(page).locator('[data-kind="TEXT"]').filter({ hasText: OWNER_REPLY }),
  ).toHaveCount(1);
  await expect(needsReplyBadge(page)).toHaveCount(0);
  await nextPoll(page);
  await expect(chatLink(page)).toHaveAccessibleName(
    before === 0 ? "채팅" : `채팅, 답 필요 ${before}건`,
  );

  /* 6. 닫힘은 사장이 답했다는 뜻이지 입금 확인이 아니다 — 입금 요청 0, 정산 원장에 입금 줄 0 그대로 */
  expect(await count(page, PAYMENT_POST)).toBe(0);
  await page
    .getByRole("navigation", { name: "주 메뉴" })
    .getByRole("link", { name: "정산", exact: true })
    .click();
  await page.getByRole("button", { name: "봄봄상회 펼치기" }).click();
  await page.getByRole("radio", { name: "미수원장", exact: true }).click();
  /* 원장이 그려진 뒤(시드 판매 줄) 구분 칸이 "입금"인 줄을 센다. 배지 글자는 화살표 + 이름("↓입금") */
  const ledger = page.locator("#settlement-detail-1");
  await expect(
    ledger.getByRole("cell", { name: /판매$/ }).first(),
  ).toBeVisible();
  await expect(ledger.getByRole("cell", { name: /^↓?입금$/ })).toHaveCount(0);
});

test("S3-3 최신 금액: 37,500 14:20 조회 → 14:25 정산 탭 입금 50,000(7004에 37,500) → 같은 질문 → 새 답 D 12,500, 근거 선수금 12,500, 14:25 조회, 37,500 0", async ({
  page,
}) => {
  const first = await inject(page, ASK);
  const [firstLine] = await waitLinesAfter(page, first.source, 1);
  const firstReply = bubble(page, firstLine?.sequence ?? undefined);
  await expect(firstReply).toContainText("미결제 37,500원, 선수금 0원");
  await expect(seenLine(firstReply)).toHaveText("14:20 조회");

  await page.clock.setSystemTime(new Date(T0.getTime() + 5 * 60_000));
  const body = await registerPayment(page, 50_000, "settle");
  expect(body).toMatchObject({
    retailerId: 1,
    amount: 50_000,
    allocations: [{ orderId: 7004, amount: 37_500 }],
  });

  await openRoom1(page);
  const second = await inject(page, ASK);
  expect(second.made.map((m) => m.kind)).toEqual(["AUTO_REPLY"]);
  const lines = await waitLinesAfter(page, second.source, 1);
  expect(lines.map((l) => l.kind)).toEqual(["AUTO_REPLY"]);
  const reply = bubble(page, lines[0]?.sequence ?? undefined);
  await expect(reply.locator(":scope > div > span").nth(1)).toHaveText(BODY_D);
  await expect(reply).toContainText("미결제 0원, 선수금 12,500원");
  await expect(reply).toContainText("연체 없음");
  await expect(seenLine(reply)).toHaveText("14:25 조회");
  /* 와이어프레임 07 `#state-rc-latest` 번호(QA F1): 미결제 줄 S3-3, 조회 시각 S3-5 S3-3 */
  await expect(reply.locator('[data-ac="S3-3"]')).toHaveText(
    "미결제 0원, 선수금 12,500원",
  );
  await expect(seenLine(reply)).toHaveAttribute("data-ac", "S7-13 S3-5 S3-3");
  await expect(reply).not.toContainText("37,500");
  /* 앞 답은 그대로 둔다 — 그때 본 값이다 */
  await expect(seenLine(firstReply)).toHaveText("14:20 조회");
});

test("S3-4 미배분 입금: 20,000 입금만 진행 → 미수 질문 → 새 줄 = 넘김 줄 + AMOUNT_UNSURE 이유, 자동 답 0", async ({
  page,
}) => {
  const body = await registerPayment(page, 20_000, "paymentOnly");
  expect(body).toMatchObject({
    retailerId: 1,
    amount: 20_000,
    allocations: [],
  });

  await openRoom1(page);
  const asked = await inject(page, ASK);
  expect(asked.made.map((m) => m.kind)).toEqual(["HANDOFF"]);
  expect(await waitLinesAfter(page, asked.source, 1)).toEqual([
    {
      kind: "HANDOFF",
      reason: "AMOUNT_UNSURE",
      reasonText: REASON.AMOUNT_UNSURE,
      sequence: null,
    },
  ]);
  await expect(needsReplyBadge(page)).toBeVisible();
});

test("S3-5 다음 날 09:00 이 되면 같은 근거 줄이 '10/29 14:20 조회'", async ({
  page,
}) => {
  const asked = await inject(page, ASK);
  const [line] = await waitLinesAfter(page, asked.source, 1);
  const reply = bubble(page, line?.sequence ?? undefined);
  await expect(seenLine(reply)).toHaveText("14:20 조회");
  await page.clock.setSystemTime(new Date("2026-10-30T09:00:00+09:00"));
  /* 방의 1분 tick(리뷰 M4)이 지금 시각으로 다시 그린다 */
  await page.clock.fastForward(60_000);
  await expect(seenLine(reply)).toHaveText("10/29 14:20 조회");
  await expect(reply).toContainText("미결제 37,500원, 선수금 0원");
});

test("S3-5 자정을 넘긴 뒤 polling 응답이 없어도(오프라인) 1분 안에 '10/29 14:20 조회' — 기준이 마지막 응답 시각이 아니라 지금 시각(리뷰 M4)", async ({
  page,
  context,
}) => {
  const asked = await inject(page, ASK);
  const [line] = await waitLinesAfter(page, asked.source, 1);
  const reply = bubble(page, line?.sequence ?? undefined);
  await expect(seenLine(reply)).toHaveText("14:20 조회");

  /* 날아가는 메시지 요청을 다 받은 뒤 끊는다 — 끊긴 뒤 도착한 응답이 기준 시각을 옮기면 이 테스트가 뜻을 잃는다 */
  await settled(page, MESSAGES_GET);
  await context.setOffline(true);
  const before = await count(page, MESSAGES_GET);

  await page.clock.setSystemTime(new Date("2026-10-30T00:00:30+09:00"));
  await page.clock.fastForward(60_000);
  await expect(seenLine(reply)).toHaveText("10/29 14:20 조회");
  /* 그 사이 메시지 요청 0 — 날짜는 polling 응답이 아니라 tick이 붙였다 */
  expect(await count(page, MESSAGES_GET)).toBe(before);
  await context.setOffline(false);
});
