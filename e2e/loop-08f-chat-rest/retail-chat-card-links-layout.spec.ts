import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  askBackorder,
  askReceivable,
  assertStubServers,
  backorderLink,
  log,
  openRoomById,
  pickBackorder,
  receivableCard,
  settlementLinkIn,
  start,
} from "./retail-helpers";

/**
 * #374 S4-7 — 링크 셋(미송 되묻기, 미송 카드, 미수 정산)을 390×844, 1280×800, 1470×900에서 잰다(기획 §4-1 8).
 * 각 링크는 그 말풍선이 방 맨 아래(바닥 상태)일 때 잰다 — 되묻기 → 고름 → 카드 → 미수 질문 순서라 새 말풍선이
 * 올 때마다 바로 앞 것이 바닥이다. 바닥 따라가기가 끝날 때까지는 `expect.poll`로 기다린다(고정 지연 없음).
 *
 * 1470 정산 링크는 loop-07 QA-R7(`qa-retail-receivable.spec.ts:314`)과 같은 값이어야 한다: 높이 28, 줄바꿈 없음,
 * 밑줄 없음(#303 6, #365 5).
 */

assertStubServers();

interface LinkMeasure {
  bottom: number;
  composerTop: number;
  /** 중심점의 맨 위 요소가 그 링크(또는 그 안) */
  centerHit: boolean;
  height: number;
  /** 글자 줄 수(텍스트 범위의 줄 top 개수) */
  lines: number;
  linkOverflow: boolean;
  logOverflow: boolean;
  docOverflow: boolean;
  decoration: string;
}

function measure(link: Locator): Promise<LinkMeasure> {
  return link.evaluate((a) => {
    const rect = a.getBoundingClientRect();
    const composer = document.querySelector('[data-ac="S5-9"]');
    const logEl = document.querySelector('[role="log"][aria-label="대화"]');
    const hit = document.elementFromPoint(
      rect.left + rect.width / 2,
      rect.top + rect.height / 2,
    );
    const range = document.createRange();
    range.selectNodeContents(a);
    const tops = new Set(
      [...range.getClientRects()].map((r) => Math.round(r.top)),
    );
    return {
      bottom: rect.bottom,
      composerTop: composer?.getBoundingClientRect().top ?? -1,
      centerHit: hit !== null && (hit === a || a.contains(hit)),
      height: rect.height,
      lines: tops.size,
      linkOverflow: a.scrollWidth > a.clientWidth,
      logOverflow:
        logEl === null ? true : logEl.scrollWidth > logEl.clientWidth,
      docOverflow:
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth,
      decoration: getComputedStyle(a).textDecorationLine,
    };
  });
}

/** 바닥 따라가기가 끝나 링크가 입력창 위에 보일 때까지 기다린 뒤 잰 값 */
async function measureAtBottom(
  page: Page,
  link: Locator,
  name: string,
): Promise<LinkMeasure> {
  await expect(link).toBeVisible();
  await expect
    .poll(
      async () => {
        const m = await measure(link);
        return m.bottom <= m.composerTop && m.centerHit;
      },
      { message: `${name}: 입력창 위, 중심점 통과` },
    )
    .toBe(true);
  const m = await measure(link);
  /* 바닥 상태 확인: 그 링크가 log 맨 아래 가까이(입력창 top과 log 하단 여백 안) */
  const logBox = await log(page).boundingBox();
  if (logBox === null) throw new Error("log 자리 없음");
  expect(m.bottom, `${name}: log 안`).toBeLessThanOrEqual(
    logBox.y + logBox.height,
  );
  return m;
}

for (const viewport of [
  { width: 390, height: 844 },
  { width: 1280, height: 800 },
  { width: 1470, height: 900 },
] as const)
  test(`S4-7 ${viewport.width}×${viewport.height} 링크 셋: 입력창 위, 중심점 통과, 높이 ${viewport.width === 390 ? "≥ 44" : "28"}, 한 줄, 링크/log/문서 가로 넘침 0`, async ({
    page,
  }) => {
    const phone = viewport.width === 390;
    await page.setViewportSize(viewport);
    await start(page, "/");
    await openRoomById(page, 1);

    const clarify = await askBackorder(page);
    const clarifyLink = await measureAtBottom(
      page,
      backorderLink(clarify),
      "미송 되묻기 링크",
    );
    const reply = await pickBackorder(page, clarify, 9003);
    const cardLink = await measureAtBottom(
      page,
      backorderLink(reply),
      "미송 카드 링크",
    );
    const bubble = await askReceivable(page);
    const settleLink = await measureAtBottom(
      page,
      settlementLinkIn(receivableCard(bubble)),
      "미수 정산 링크",
    );

    const all = {
      "미송 되묻기 링크": clarifyLink,
      "미송 카드 링크": cardLink,
      "미수 정산 링크": settleLink,
    };
    test.info().annotations.push({
      type: "measure",
      description: JSON.stringify(all),
    });
    for (const [name, m] of Object.entries(all)) {
      expect(m.bottom, `${name} bottom ≤ 입력창 top`).toBeLessThanOrEqual(
        m.composerTop,
      );
      expect(m.centerHit, `${name} 중심점`).toBe(true);
      if (phone) expect(m.height, `${name} 높이`).toBeGreaterThanOrEqual(44);
      else expect(m.height, `${name} 높이`).toBe(28);
      expect(m.lines, `${name} 한 줄`).toBe(1);
      expect(m.linkOverflow, `${name} 링크 가로 넘침`).toBe(false);
      expect(m.logOverflow, `${name} 대화 log 가로 넘침`).toBe(false);
      expect(m.docOverflow, `${name} 문서 가로 넘침`).toBe(false);
      expect(m.decoration, `${name} 밑줄`).toBe("none");
    }
    /* loop-07 QA-R7 값과 같음(1470 28 / 390 44, 줄바꿈 없음, 밑줄 없음) */
    if (viewport.width === 1470) expect(settleLink.height).toBe(28);
    if (phone) expect(settleLink.height).toBe(44);
  });
