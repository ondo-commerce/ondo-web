import { expect, test, type Page } from "@playwright/test";
import {
  AFTER_GET,
  alignTop,
  assertStubServers,
  composer,
  count,
  incoming,
  log,
  logMetrics,
  openHistoryRoom,
  settled,
  topOf,
} from "../loop-08d-chat-rest/retail-history-helpers";

/**
 * loop-08e S3(#363) — 소매 방 리사이즈 경합. 바닥에서 입력창이 세 줄로 늘어 ResizeObserver가 바닥에 붙이면
 * (scrollTop 변경) scroll 이벤트는 다음 프레임에 나간다. 그 사이에 log가 줄면(화면 키보드) 다음 프레임은
 * scroll → ResizeObserver 순서다. 고치기 전엔 scroll이 줄어든 높이로 "바닥 아님"을 쓰고, ResizeObserver가
 * 붙이기를 건너뛰어 바닥에서 줄어든 만큼(244px) 떨어졌다. `pnpm e2e:stub`.
 *
 * 순서 고정(§4-3 시험): 기획은 한 `page.evaluate`에서 세 줄 + 상자 줄임을 같이 하라고 했지만, 그러면 두 변경이
 * 한 번의 ResizeObserver로 합쳐져 경합이 안 난다(고치기 전에도 4회 0실패, 02-dev-363 표 A). 그래서 앱의
 * ResizeObserver가 세 줄을 처리한 **뒤**, 다음 프레임 **전**(그 프레임의 ResizeObserver 콜백에서 건 0ms 타이머)에
 * 상자를 줄인다. 이 순서가 실제로 났는지(첫 scroll이 줄어든 높이를 봤는지)도 단언한다.
 */

assertStubServers();

const ROOM1_READ = {
  path: /\/api\/retail\/chat\/rooms\/1\/read$/,
  method: "POST",
} as const;

const THREE_LINES = "레드 L\n두 장\n내일 가요";
const SHRINK_PX = 244;

function jumpButton(page: Page) {
  return page.locator('button[data-ac~="08d:S4-2"]');
}

interface RaceResult {
  /** 상자를 줄인 뒤 첫 scroll 이벤트가 본 log clientHeight. scroll이 없었으면 null */
  firstScrollHeight: number | null;
  /** 줄인 뒤 log clientHeight */
  shrunkHeight: number;
  /** 줄인 뒤 첫 콜백 순서 */
  order: string[];
}

/**
 * 순서 고정 경합. `order`
 * - `lines-then-shrink`: 세 줄 → 앱 ResizeObserver 처리 → (다음 프레임 전) 상자 244px 줄임. S3-1
 * - `shrink-then-lines`: 상자 줄임 → 두 프레임 → 세 줄. S3-3 ②
 * 끝나고 두 프레임을 기다린다
 */
function race(
  page: Page,
  order: "lines-then-shrink" | "shrink-then-lines",
): Promise<RaceResult> {
  return page.evaluate(
    async ({ order, text, shrink }) => {
      const frame = () =>
        new Promise<void>((r) => requestAnimationFrame(() => r()));
      const logEl = document.querySelector<HTMLElement>('[role="log"]')!;
      const panel = logEl.closest<HTMLElement>('[data-ac="S5-5 S5-9"]')!;
      const textarea = panel.querySelector("textarea")!;
      const result: RaceResult = {
        firstScrollHeight: null,
        shrunkHeight: 0,
        order: [],
      };
      const typeLines = () => {
        /* 제어 컴포넌트라 프로토타입 setter로 넣고 input을 보낸다(React가 값 변화를 본다) */
        Object.getOwnPropertyDescriptor(
          HTMLTextAreaElement.prototype,
          "value",
        )!.set!.call(textarea, text);
        textarea.dispatchEvent(new Event("input", { bubbles: true }));
      };
      const doShrink = () => {
        panel.style.height = `${panel.getBoundingClientRect().height - shrink}px`;
        result.shrunkHeight = logEl.clientHeight;
        /* 줄인 뒤 첫 콜백 순서를 남긴다. 이 관찰자는 앱 것보다 늦게 만들어져 같은 프레임에서 앱 것 뒤에 돈다 */
        logEl.addEventListener(
          "scroll",
          () => {
            result.firstScrollHeight = logEl.clientHeight;
            result.order.push("scroll");
          },
          { once: true },
        );
        const probe = new ResizeObserver(() => {
          probe.disconnect();
          result.order.push("resize");
        });
        probe.observe(logEl);
      };

      if (order === "lines-then-shrink") {
        await new Promise<void>((resolve) => {
          /* 세 줄로 늘어난 log를 앱 ResizeObserver가 처리한 그 프레임 안에서 0ms 타이머를 건다 —
             다음 프레임(scroll 이벤트가 나가는 때)보다 먼저 돈다 */
          const afterApp = new ResizeObserver(() => {
            afterApp.disconnect();
            setTimeout(() => {
              doShrink();
              resolve();
            }, 0);
          });
          typeLines();
          afterApp.observe(logEl);
        });
      } else {
        doShrink();
        await frame();
        await frame();
        typeLines();
      }
      await frame();
      await frame();
      return result;
    },
    { order, text: THREE_LINES, shrink: SHRINK_PX },
  );
}

/** 마지막 말풍선 아래 끝이 입력창 위끝보다 위 */
async function lastBubbleAboveComposer(page: Page): Promise<void> {
  const last = await log(page).evaluate((el) => {
    const nodes = el.querySelectorAll("[data-sequence]");
    return nodes[nodes.length - 1]!.getBoundingClientRect().bottom;
  });
  const input = await composer(page).boundingBox();
  if (input === null) throw new Error("입력창 없음");
  expect(last).toBeLessThanOrEqual(input.y);
}

/** polling 한 번이 더 나가고 응답까지. 읽음 POST가 날 틈을 고정 지연 대신 이걸로 준다 */
async function nextPoll(page: Page): Promise<void> {
  const before = await count(page, AFTER_GET);
  await expect
    .poll(() => count(page, AFTER_GET), { timeout: 8000 })
    .toBeGreaterThan(before);
  await settled(page, AFTER_GET);
}

for (const viewport of [
  { width: 390, height: 844 },
  { width: 1280, height: 800 },
]) {
  test.describe(`S3-1 순서 고정 재현 ${viewport.width}`, () => {
    test.use({ viewport });

    test("바닥 → 세 줄 → (다음 프레임 전) 상자 244px 줄임 → 바닥 ≤ 1px, 마지막 말풍선 입력창 위", async ({
      page,
    }) => {
      await openHistoryRoom(page);
      const result = await race(page, "lines-then-shrink");
      /* 경합 순서가 실제로 났다: 줄인 뒤 첫 콜백이 scroll이고, 그 scroll은 줄어든 높이를 봤다 */
      expect(result.order[0]).toBe("scroll");
      expect(result.firstScrollHeight).toBe(result.shrunkHeight);
      expect((await logMetrics(page)).fromBottom).toBeLessThanOrEqual(1);
      await lastBubbleAboveComposer(page);
      await expect(jumpButton(page)).toHaveCount(0);
    });
  });
}

test.describe("S3-2 원래 경로 390", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  /* `--repeat-each=10` 보조. 확률 경합이라 한 번 통과가 증거는 아니다 — 증거는 S3-1 */
  test("세 줄 fill 직후 기다림 없이 창 390×600 → 바닥 ≤ 1px", async ({
    page,
  }) => {
    await openHistoryRoom(page);
    await composer(page).fill(THREE_LINES);
    await page.setViewportSize({ width: 390, height: 600 });
    await expect
      .poll(async () => (await logMetrics(page)).fromBottom, { timeout: 3000 })
      .toBeLessThanOrEqual(1);
    await lastBubbleAboveComposer(page);
  });
});

test.describe("S3-3 회귀 390", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("① 위 출발: S3-1 순서 → 첫 보이던 말풍선 top 이동 ≤ 4px, 읽음 POST 0, 버튼 0", async ({
    page,
  }) => {
    await openHistoryRoom(page);
    await expect.poll(() => count(page, ROOM1_READ)).toBeGreaterThan(0);
    await settled(page, ROOM1_READ);
    await alignTop(page, 100);
    await expect
      .poll(async () => (await logMetrics(page)).fromBottom)
      .toBeGreaterThanOrEqual(200);
    const reads = await count(page, ROOM1_READ);
    const top = await topOf(page, 100);
    await race(page, "lines-then-shrink");
    expect(Math.abs((await topOf(page, 100)) - top)).toBeLessThanOrEqual(4);
    await nextPoll(page);
    expect(await count(page, ROOM1_READ)).toBe(reads);
    await expect(jumpButton(page)).toHaveCount(0);
  });

  test("② 상자 먼저 줄이고 세 줄 → 바닥 ≤ 1px", async ({ page }) => {
    await openHistoryRoom(page);
    await race(page, "shrink-then-lines");
    expect((await logMetrics(page)).fromBottom).toBeLessThanOrEqual(1);
    await lastBubbleAboveComposer(page);
  });

  test("③ 바닥에서 휠 위로(사용자 스크롤 창 안)와 같은 task에 상자 줄임 → 바닥으로 안 끌려감, 새 메시지는 버튼", async ({
    page,
  }) => {
    await openHistoryRoom(page);
    const afterWheel = await log(page).evaluate(async (el, shrink) => {
      const frame = () =>
        new Promise<void>((r) => requestAnimationFrame(() => r()));
      const panel = el.closest<HTMLElement>('[data-ac="S5-5 S5-9"]')!;
      /* 사장 휠(onWheel이 사용자 스크롤 창을 연다)과 그 휠이 만든 스크롤, 창 줄임을 한 task에.
         휠은 40px — 바닥 여유(48px) 안이라 옛 높이로 재면 "바닥"이고, 지금 높이로 재야 "바닥 아님"이다.
         이 차이가 사용자 스크롤 예외(`bottomCheckHeight`)를 가른다(300px이면 어느 높이로 재도 바닥 아님) */
      el.dispatchEvent(new WheelEvent("wheel", { deltaY: -40, bubbles: true }));
      el.scrollTop -= 40;
      const top = el.scrollTop;
      panel.style.height = `${panel.getBoundingClientRect().height - shrink}px`;
      await frame();
      await frame();
      return top;
    }, SHRINK_PX);
    expect(
      Math.abs((await logMetrics(page)).scrollTop - afterWheel),
    ).toBeLessThanOrEqual(4);
    /* 바닥 아님으로 판정됐으면 새 줄이 와도 따라가지 않고 버튼이 뜬다 */
    await incoming(page, 1, "휠 뒤 답");
    await expect(jumpButton(page)).toHaveText("새 메시지 1개", {
      timeout: 8000,
    });
    expect(
      Math.abs((await logMetrics(page)).scrollTop - afterWheel),
    ).toBeLessThanOrEqual(4);
  });
});
