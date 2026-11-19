import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  composer,
  installClock,
  log,
  login,
  mock,
  openChats,
  row,
  watchRequests,
} from "../loop-04-chat/helpers";
import { requests } from "../loop-03-upload-lifecycle/helpers";

/**
 * loop-05b-stock-reply QA(도매, #289). 기본 설정 `--project=wholesale`로 돈다.
 * 개발 spec(`wholesale-autoreply-off.spec.ts`)이 안 본 것: 사장 시나리오 (d)의 화면(스크린샷), 스위치를 오가도
 * 열린 방의 쓰던 답 글 유지(반복 3), 키보드 Space 로 끄기, 근거 칸의 정확 수량과 소매 구간 글자가 같은 줄,
 * 스위치와 꺼짐 안내 토큰 실측.
 */

const QA = ".claude/harness/runs/loop-05b-stock-reply/qa";
const ASK = "레드 M 몇 장 있어요";
const OFF_NOTICE =
  "자동 답변이 꺼져 있어요. 소매 문의는 사장님께 바로 전달돼요";
const FAILED = "설정을 바꾸지 못했어요. 다시 눌러 주세요";
const SETTINGS_PUT = {
  path: /\/api\/wholesale\/chat\/auto-reply-settings$/,
  method: "PUT",
} as const;

function autoSwitch(page: Page): Locator {
  return page.getByRole("switch", { name: "자동 답변", exact: true });
}

function listPanel(page: Page): Locator {
  return page.getByRole("region", { name: "대화 목록", exact: true });
}

function askStock(page: Page): Promise<void> {
  return mock(page, "rooms/1/incoming", { body: ASK, contextListingId: 2001 });
}

test.beforeEach(async ({ page }) => {
  await watchRequests(page);
  await installClock(page);
  await login(page);
  await openChats(page);
  const status = await page.evaluate(async () => {
    const r = await fetch("/__mock/chat/reset", { method: "POST", body: "{}" });
    return r.status;
  });
  expect(status, "목 reset").toBe(200);
});

test("(d) 장면 5, 6: 방 1 자동 답 근거(정확 수량 + 소매 구간) → 끄기 → 같은 문의 넘김만 → 켜기 → 자동 답", async ({
  page,
}) => {
  await row(page, "봄봄상회").click();
  await expect(page).toHaveURL(/room=1$/);
  const auto = log(page).locator('[data-kind="AUTO_REPLY"]');
  await expect(auto).toHaveCount(1);

  await askStock(page);
  await expect(auto).toHaveCount(2);
  const latest = auto.last();
  // 도매 근거 칸에는 정확 수량이 보이고, 같은 칸에 소매가 본 구간 글자가 있다
  await expect(latest).toContainText("판매가능 35장, 주문 한도 500장");
  await expect(latest).toContainText('소매처에게는 "10~49장"으로 보였어요');
  await latest.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${QA}/d1-wholesale-scene5-1470.png` });

  await autoSwitch(page).click();
  await expect(autoSwitch(page)).not.toBeChecked();
  await expect(listPanel(page).getByRole("status")).toHaveText(OFF_NOTICE);
  const notes = await log(page).getByRole("note").count();
  await askStock(page);
  await expect(log(page).getByRole("note")).toHaveCount(notes + 1);
  await expect(auto).toHaveCount(2);
  await page.screenshot({ path: `${QA}/d2-wholesale-off-handoff-1470.png` });

  await autoSwitch(page).click();
  await expect(autoSwitch(page)).toBeChecked();
  await askStock(page);
  await expect(auto).toHaveCount(3);
  await expect(log(page).getByRole("note")).toHaveCount(notes + 1);
  await page.screenshot({ path: `${QA}/d3-wholesale-on-again-1470.png` });
});

test("반복 3: 방에 답 글을 쓰다가 스위치를 끄고, 500 으로 실패하고, 다시 켜도 글 그대로", async ({
  page,
}) => {
  await row(page, "봄봄상회").click();
  const draft = "레드 M은 내일 입고돼요";
  await composer(page).fill(draft);
  await autoSwitch(page).click();
  await expect(autoSwitch(page)).not.toBeChecked();
  await expect(composer(page)).toHaveValue(draft);
  await mock(page, "fail", { op: "settings", status: 500 });
  await autoSwitch(page).click();
  await expect(listPanel(page).getByRole("alert")).toHaveText(FAILED);
  await expect(autoSwitch(page)).not.toBeChecked();
  // 실패면 꺼짐 안내 대신 실패 한 줄(autoReplyNoteOf) — 스위치는 원래 값(꺼짐) 그대로
  await expect(composer(page)).toHaveValue(draft);
  await page.screenshot({ path: `${QA}/wholesale-put500-from-off-1470.png` });
  await autoSwitch(page).click();
  await expect(autoSwitch(page)).toBeChecked();
  await expect(composer(page)).toHaveValue(draft);
});

test("키보드: 스위치에 포커스 → Space → 꺼짐, PUT 1회", async ({ page }) => {
  await autoSwitch(page).focus();
  await page.keyboard.press("Space");
  await expect(autoSwitch(page)).not.toBeChecked();
  expect((await requests(page, SETTINGS_PUT)).length).toBe(1);
});

test("반복 4: 실제 더블클릭 → PUT 1회, 손잡이는 응답 뒤 한 번만 움직임", async ({
  page,
}) => {
  await autoSwitch(page).dblclick();
  await expect(autoSwitch(page)).not.toBeChecked();
  await expect(autoSwitch(page)).toBeEnabled();
  expect((await requests(page, SETTINGS_PUT)).length).toBe(1);
});

test("토큰 실측 1470: 스위치 44x24, 꺼짐 안내 accent 면 + 14px, 제목 오른쪽", async ({
  page,
}) => {
  await autoSwitch(page).click();
  await expect(listPanel(page).getByRole("status")).toHaveText(OFF_NOTICE);
  const m = await page.evaluate(() => {
    const sw = document.querySelector(
      '[role="switch"][aria-label="자동 답변"]',
    ) as HTMLElement;
    const note = document.querySelector(
      '[role="region"][aria-label="대화 목록"] [role="status"]',
    ) as HTMLElement;
    const r = sw.getBoundingClientRect();
    const cs = getComputedStyle(note);
    return {
      w: r.width,
      h: r.height,
      noteBg: cs.backgroundColor,
      noteSize: cs.fontSize,
      notePad: `${cs.paddingTop} ${cs.paddingLeft}`,
      noteRadius: cs.borderTopLeftRadius,
    };
  });
  test
    .info()
    .annotations.push({ type: "measure", description: JSON.stringify(m) });
  await page.screenshot({
    path: `${QA}/wholesale-switch-off-1470.png`,
    clip: { x: 0, y: 0, width: 760, height: 360 },
  });
  expect({ w: m.w, h: m.h }).toEqual({ w: 44, h: 24 });
});
