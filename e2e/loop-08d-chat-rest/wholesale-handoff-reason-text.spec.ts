import { expect, test, type Page } from "@playwright/test";
import {
  installClock,
  log,
  login,
  mock,
  roomList,
} from "../loop-04-chat/helpers";

/**
 * #353 S6-2 도매 넘김 이유 문구(loop-08d 01-plan §4-6, §6 S6). 사람을 찾는 소매 말 → 넘김 줄 아래 HUMAN_REQUEST 글.
 *
 * 소매 메시지는 목 손잡이 `incoming {autoReply: true}`로 방 1(봄봄상회)에 넣는다 — 판정은 `autoReply`나
 * 상품 문맥이 있어야 돈다(loop-07 `wholesale-handoff-reason.spec.ts`와 같은 길). 이유 줄 자리, 묶음 구조는 loop-07
 * 결정 39~42 그대로라 그쪽 spec이 보고, 여기는 새 글이 실제 화면에 그려지는지만 본다.
 *
 * "새 줄"은 넣은 메시지 다음 줄만 본다 — 시드에 넘김 줄이 있어도 통과하지 않게 DOM 순서로 자른다.
 */

const T0 = new Date("2026-10-29T14:20:00+09:00");
const ASK = "사장님이랑 통화하고 싶어요";
const REASON = "사장님과 직접 이야기하고 싶어 해요";

interface Line {
  kind: string;
  reason: string | null;
  reasonText: string | null;
}

/** 방 1에 넣고 판정까지. 넣은 메시지의 sequence와 판정이 만든 줄 kind */
async function inject(
  page: Page,
  body: string,
): Promise<{ sequence: number; made: string[] }> {
  const { status, data } = await page.evaluate(async (body) => {
    const response = await fetch("/__mock/chat/rooms/1/incoming", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body, autoReply: true }),
    });
    const json = (await response.json()) as {
      data: { kind: string; sequence: number; body: string }[];
    };
    return { status: response.status, data: json.data };
  }, body);
  expect(status, `incoming ${body}`).toBe(201);
  const [source, ...made] = data;
  if (source === undefined) throw new Error("넣은 메시지가 응답에 없다");
  expect(source.body).toBe(body);
  return { sequence: source.sequence, made: made.map((m) => m.kind) };
}

function linesAfter(page: Page, sequence: number): Promise<Line[]> {
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
    }));
  }, sequence);
}

test.beforeEach(async ({ page }) => {
  await installClock(page, T0);
  await login(page);
  await page.goto("/chats?room=1");
  await expect(roomList(page).getByRole("link").first()).toBeVisible();
  await mock(page, "reset");
  await expect(log(page)).toBeVisible();
});

test("S6-2 '사장님이랑 통화하고 싶어요' → 넘김 줄 아래 '사장님과 직접 이야기하고 싶어 해요'", async ({
  page,
}) => {
  const asked = await inject(page, ASK);
  expect(asked.made).toEqual(["HANDOFF"]);
  await expect
    .poll(() => linesAfter(page, asked.sequence))
    .toEqual([
      { kind: "HANDOFF", reason: "HUMAN_REQUEST", reasonText: REASON },
    ]);
  /* 이유 글은 넘김 note 안, 알약 아래 한 줄. note 안에 다른 role 없음(결정 39) */
  const note = log(page)
    .locator('[role="note"][data-reason="HUMAN_REQUEST"]')
    .last();
  await expect(note.locator("[data-reason-text]")).toHaveText(REASON);
  await expect(note.locator("[role]")).toHaveCount(0);
});
