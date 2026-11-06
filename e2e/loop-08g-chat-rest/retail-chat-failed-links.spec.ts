import { expect, test, type Locator } from "@playwright/test";
import {
  assertStubServers,
  chatMock,
  start,
} from "../loop-08e-chat-rest/helpers";
import {
  failedBubbleAndDraft,
  failedBubbles,
  removeOf,
  retryOf,
} from "../loop-08e-chat-rest/pending-helpers";

/**
 * #376 2번 08e Q4(08f 기획 Q6 ①, AC S5-4). 실패 말풍선의 `다시 보내기`, `지우기`가 ≤40rem에서 손가락 높이 44,
 * 글자는 12px 그대로, 실패 문구와 두 링크가 서로 안 겹친다. 1280은 예전 그대로(높이 16).
 * `pnpm e2e:stub`. 실패 말풍선은 08e 도우미(방 1, `fail {op: send, status: 500}`)로 만든다.
 */

assertStubServers();

interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

async function rectOf(target: Locator): Promise<Rect> {
  const b = await target.boundingBox();
  if (b === null) throw new Error("보이지 않는다");
  return { left: b.x, top: b.y, right: b.x + b.width, bottom: b.y + b.height };
}

/** 실패 문구(알림 줄의 첫 글자 노드) 영역. 링크와 같은 줄 안에서 글자끼리 겹치는지 본다 */
function failureTextRect(bubble: Locator): Promise<Rect> {
  return bubble.getByRole("alert").evaluate((alert) => {
    const node = Array.from(alert.childNodes).find(
      (n) => n.nodeType === Node.TEXT_NODE && (n.textContent ?? "").trim(),
    );
    if (node === undefined) throw new Error("실패 문구 글자 노드가 없다");
    const range = document.createRange();
    range.selectNodeContents(node);
    const r = range.getBoundingClientRect();
    return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
  });
}

/** 두 사각형이 겹치는 넓이(px²). 맞닿기만 하면 0 */
function overlapArea(a: Rect, b: Rect): number {
  const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
  const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
  return w > 0 && h > 0 ? w * h : 0;
}

function fontSize(target: Locator): Promise<string> {
  return target.evaluate((el) => getComputedStyle(el).fontSize);
}

for (const { width, height, minHeight, maxHeight } of [
  { width: 390, height: 844, minHeight: 44, maxHeight: Infinity },
  { width: 1280, height: 800, minHeight: 16, maxHeight: 16 },
]) {
  test.describe(`S5-4 ${width}`, () => {
    test.use({ viewport: { width, height } });

    test(`실패 말풍선 두 링크 높이 ${width === 390 ? "≥ 44" : "16 그대로"}, 글자 12px, 문구와 링크 겹침 0`, async ({
      page,
    }) => {
      await start(page, "/");
      await failedBubbleAndDraft(page, "못 간 말", "", chatMock);
      const bubble = failedBubbles(page).filter({ hasText: "못 간 말" });
      const retry = retryOf(bubble);
      const remove = removeOf(bubble);
      await retry.scrollIntoViewIfNeeded();

      const r = await rectOf(retry);
      const d = await rectOf(remove);
      const text = await failureTextRect(bubble);
      test.info().annotations.push({
        type: "measure",
        description: JSON.stringify({ retry: r, remove: d, text }),
      });

      for (const [name, box] of [
        ["다시 보내기", r],
        ["지우기", d],
      ] as const) {
        const h = box.bottom - box.top;
        expect(h, `${name} 높이`).toBeGreaterThanOrEqual(minHeight);
        expect(h, `${name} 높이`).toBeLessThanOrEqual(maxHeight);
        expect(box.right, `${name} 오른쪽 끝이 화면 안`).toBeLessThanOrEqual(
          width,
        );
      }
      expect(await fontSize(retry)).toBe("12px");
      expect(await fontSize(remove)).toBe("12px");
      expect(overlapArea(r, d), "두 링크").toBe(0);
      expect(overlapArea(text, r), "문구와 다시 보내기").toBe(0);
      expect(overlapArea(text, d), "문구와 지우기").toBe(0);
    });
  });
}
