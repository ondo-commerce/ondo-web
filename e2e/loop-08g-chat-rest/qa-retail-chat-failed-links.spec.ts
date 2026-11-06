import { expect, test } from "@playwright/test";
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
 * loop-08g QA — S5-4 실패 말풍선 두 링크(test-376-retail-chat-hygiene). `pnpm e2e:stub`.
 * 390과 1280에서 `fail {op: send, status: 500}` 말풍선을 찍고, 두 링크의 계산값(높이, 글자, 색, 밑줄, 패딩, 반경)을
 * 재서 기록한다. "모양 같음"은 두 링크의 계산값이 높이 말고는 폭마다 같은지로 본다.
 */

assertStubServers();

const SHOTS =
  "/Users/oh-chang-eun/onDo/.claude/harness/runs/loop-08g-chat-rest/qa";

for (const { width, height, h } of [
  { width: 390, height: 844, h: 44 },
  { width: 1280, height: 800, h: 16 },
]) {
  test(`S5-4 ${width} 실패 말풍선 두 링크 계산값과 화면`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await start(page, "/");
    await failedBubbleAndDraft(page, "못 간 말", "", chatMock);
    const bubble = failedBubbles(page).filter({ hasText: "못 간 말" });
    const retry = retryOf(bubble);
    const remove = removeOf(bubble);
    await retry.scrollIntoViewIfNeeded();

    const style = (el: Element) => {
      const s = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return {
        h: Math.round(r.height),
        w: Math.round(r.width),
        fontSize: s.fontSize,
        color: s.color,
        textDecorationLine: s.textDecorationLine,
        paddingLeft: s.paddingLeft,
        paddingRight: s.paddingRight,
        radius: s.borderTopLeftRadius,
        alignItems: s.alignItems,
        dataAc: el.getAttribute("data-ac"),
      };
    };
    const a = await retry.evaluate(style);
    const b = await remove.evaluate(style);
    test.info().annotations.push({
      type: "measure",
      description: JSON.stringify({ retry: a, remove: b }),
    });
    await bubble.screenshot({ path: `${SHOTS}/failed-links-${width}.png` });
    await page.screenshot({ path: `${SHOTS}/failed-links-page-${width}.png` });

    expect(a.h).toBe(h);
    expect(b.h).toBe(h);
    const { w: _aw, dataAc: _ad, ...shapeA } = a;
    const { w: _bw, dataAc: _bd, ...shapeB } = b;
    expect(shapeB, "두 링크 모양 같음(너비, data-ac 뺀 계산값)").toEqual(
      shapeA,
    );
    /* 가로 문서 넘침 0 */
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - innerWidth,
      ),
    ).toBeLessThanOrEqual(0);

    /* 가려진 대상(반복 패턴 2): 링크 가운데를 누르면 그 링크가 받는다, 링크 바닥이 입력창 위 */
    const composerTop = await page
      .getByRole("textbox", { name: "메시지", exact: true })
      .evaluate((el) => el.getBoundingClientRect().top);
    for (const link of [retry, remove]) {
      const hit = await link.evaluate((el) => {
        const r = el.getBoundingClientRect();
        const at = document.elementFromPoint(
          r.left + r.width / 2,
          r.top + r.height / 2,
        );
        return {
          hit: at !== null && (at === el || el.contains(at)),
          bottom: r.bottom,
        };
      });
      test.info().annotations.push({
        type: "hit",
        description: JSON.stringify({ ...hit, composerTop }),
      });
      expect(hit.hit).toBe(true);
      expect(hit.bottom).toBeLessThanOrEqual(composerTop);
    }
  });
}
