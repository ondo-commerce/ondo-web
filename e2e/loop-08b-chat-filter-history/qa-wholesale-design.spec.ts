import os from "node:os";
import path from "node:path";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { chatRows, enterChats, knob } from "./helpers";

/**
 * loop-08b QA 디자인 audit(brief-qa, 역할 규칙 6). 구현 필터 줄과 와이어프레임 17 `#state-filter-bar`를
 * 같은 브라우저에서 `getComputedStyle`로 재서 칸마다 비교한다. 와이어프레임은 레포 밖(`~/feature-spec`)이라
 * 파일이 없으면 건너뛴다.
 */

const WIRE = path.join(
  os.homedir(),
  "feature-spec/wireframes/17_wholesale-chat/00_index.html",
);
const SHOTS = ".claude/harness/runs/loop-08b-chat-filter-history/qa";

const PROPS = [
  "height",
  "borderRadius",
  "backgroundColor",
  "color",
  "fontSize",
  "fontWeight",
  "paddingLeft",
  "paddingTop",
] as const;

async function styleOf(target: Locator) {
  return target.evaluate(
    (el, props) => {
      const s = getComputedStyle(el);
      /* 앱은 lab(), 와이어프레임은 oklch()로 나온다 — 캔버스에 칠해 sRGB 바이트로 맞춘다 */
      const rgb = (css: string) => {
        const c = document.createElement("canvas");
        c.width = 1;
        c.height = 1;
        const ctx = c.getContext("2d");
        if (ctx === null) return css;
        ctx.fillStyle = css;
        ctx.fillRect(0, 0, 1, 1);
        return Array.from(ctx.getImageData(0, 0, 1, 1).data).join(",");
      };
      return Object.fromEntries(
        props.map((p) => {
          const v = s[p as keyof CSSStyleDeclaration] as string;
          return [p, /color/i.test(p) ? rgb(v) : v];
        }),
      );
    },
    [...PROPS],
  );
}

/** 칸 사이 간격: 검색 상자 아래 → 칩 위, 칩 아래 → 첫 행 위 */
async function gaps(search: Locator, seg: Locator, firstRow: Locator) {
  const a = await search.boundingBox();
  const b = await seg.boundingBox();
  const c = await firstRow.boundingBox();
  if (a === null || b === null || c === null) return null;
  return {
    searchToSeg: Math.round(b.y - (a.y + a.height)),
    segToRow: Math.round(c.y - (b.y + b.height)),
  };
}

async function measureApp(page: Page) {
  const region = page.getByRole("region", { name: "대화 목록", exact: true });
  const searchBox = region
    .getByRole("searchbox", { name: "소매처 이름 검색", exact: true })
    .locator("xpath=..");
  const seg = region.getByRole("radiogroup", {
    name: "대화 필터",
    exact: true,
  });
  const on = seg.getByRole("radio", { name: "전체", exact: true });
  const off = seg.getByRole("radio", { name: "안 읽음", exact: true });
  return {
    search: await styleOf(searchBox),
    seg: await styleOf(seg),
    on: await styleOf(on),
    off: await styleOf(off),
    thumb: (await styleOf(seg.locator("> span[aria-hidden]").first()))
      .backgroundColor,
    gaps: await gaps(searchBox, seg, chatRows(page).first()),
  };
}

async function measureWire(page: Page) {
  const sec = page.locator("#state-filter-bar .row").first();
  const searchBox = sec.locator(".search").first();
  const seg = sec.locator(".seg").first();
  return {
    search: await styleOf(searchBox),
    seg: await styleOf(seg),
    on: await styleOf(seg.locator('[aria-checked="true"]').first()),
    off: await styleOf(seg.locator('[aria-checked="false"]').first()),
    gaps: await gaps(searchBox, seg, sec.locator(".lrow").first()),
  };
}

test("QA-design 필터 줄 토큰 — 구현 = 와이어프레임 #state-filter-bar", async ({
  page,
  browser,
}) => {
  test.skip(!(await import("node:fs")).existsSync(WIRE), "와이어프레임 없음");
  await enterChats(page, { seed: "rooms-70" });
  await expect(chatRows(page)).toHaveCount(30);
  const app = await measureApp(page);

  const wirePage = await browser.newPage({
    viewport: { width: 1470, height: 900 },
  });
  await wirePage.goto(`file://${WIRE}`);
  const wire = await measureWire(wirePage);
  await wirePage.close();

  test
    .info()
    .annotations.push(
      { type: "app", description: JSON.stringify(app) },
      { type: "wire", description: JSON.stringify(wire) },
    );
  /* 비교에서 빼는 칸 둘. ① 검색 상자 `color`: 와이어프레임은 안내 글 span 색(muted)이 상자에 걸려 있고 앱은 입력
     글자색이 걸려 있다 — 같은 것을 재지 않는다. ② 눌린 칩 배경: 앱은 칩 뒤 흰 조각(`Segmented` thumb, bg-card)이
     따로 있어 칩 자체는 투명하다 — 조각을 따로 잰다(`thumb`) */
  const { color: _appSearchColor, ...appSearch } = app.search;
  const { color: _wireSearchColor, ...wireSearch } = wire.search;
  const { backgroundColor: _appOnBg, ...appOn } = app.on;
  const { backgroundColor: wireOnBg, ...wireOn } = wire.on;
  expect.soft(appSearch).toEqual(wireSearch);
  expect.soft(app.seg).toEqual(wire.seg);
  expect.soft(appOn).toEqual(wireOn);
  expect.soft(app.thumb).toBe(wireOnBg);
  expect.soft(app.off).toEqual(wire.off);
  /* 칩 → 첫 행은 앱이 2px 더 길다(18 vs 16). 목록 ul의 기존 안쪽 여백(포커스 링 자리)이라 이번 diff 밖 — 기록만 */
  expect.soft(app.gaps?.searchToSeg).toBe(wire.gaps?.searchToSeg);
});

test("QA-design 상태 스크린샷 — 바꾸는 중, 조건 0, 실패 (1280)", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await enterChats(page, { seed: "rooms-70" });
  await expect(chatRows(page)).toHaveCount(30);
  const region = page.getByRole("region", { name: "대화 목록", exact: true });
  const chip = (name: string) =>
    region
      .getByRole("radiogroup", { name: "대화 필터", exact: true })
      .getByRole("radio", { name, exact: true });

  await page.screenshot({ path: `${SHOTS}/qa-1280-filter-bar.png` });

  await knob(page, "delay", { op: "rooms", ms: 3000 });
  await chip("안 읽음").click();
  const busy = region.getByText("찾는 중", { exact: true });
  await expect(busy).toBeVisible();
  const contrast = await busy.evaluate((el) => {
    const s = getComputedStyle(el);
    return { color: s.color, fontSize: s.fontSize };
  });
  test.info().annotations.push({
    type: "찾는 중",
    description: JSON.stringify(contrast),
  });
  await region.screenshot({ path: `${SHOTS}/qa-1280-busy.png` });
  await expect(busy).toHaveCount(0, { timeout: 10_000 });

  await region
    .getByRole("searchbox", { name: "소매처 이름 검색", exact: true })
    .fill("없는상회");
  await expect(
    region.getByText("조건에 맞는 대화가 없어요", { exact: true }),
  ).toBeVisible();
  await region.screenshot({ path: `${SHOTS}/qa-1280-nomatch.png` });

  await knob(page, "fail", { op: "rooms", status: 500 });
  await chip("답 필요").click();
  await expect(region.getByRole("alert")).toBeVisible();
  await region.screenshot({ path: `${SHOTS}/qa-1280-error.png` });
});
