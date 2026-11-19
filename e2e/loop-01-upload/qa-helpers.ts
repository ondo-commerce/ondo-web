import { test, type Locator, type Page } from "@playwright/test";
import { appendFileSync, mkdirSync } from "node:fs";
import path from "node:path";

/**
 * loop-01-upload QA 전용 헬퍼. 스크린샷은 회차 디렉터리 `runs/loop-01-upload/qa/`에 남긴다 —
 * 다음 회차가 같은 이름으로 다시 찍어 비교한다.
 */
export const QA_DIR = path.resolve(
  __dirname,
  "../../.claude/harness/runs/loop-01-upload/qa",
);
mkdirSync(QA_DIR, { recursive: true });

export function shot(name: string): string {
  return path.join(QA_DIR, `${name}.png`);
}

export interface Rgb {
  r: number;
  g: number;
  b: number;
  a: number;
}

/**
 * 요소의 computed 색을 sRGB로 읽는다. Tailwind v4 는 색을 `oklch(…)`로 내므로 문자열을
 * 파싱하지 않고 canvas 에 칠해 픽셀로 받는다 — 브라우저가 변환을 맡는다.
 */
export async function computedColor(
  el: Locator,
  prop: string,
): Promise<Rgb & { raw: string }> {
  return el.evaluate((node, prop) => {
    const raw = getComputedStyle(node).getPropertyValue(prop);
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("canvas 2d 없음");
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = raw;
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = Array.from(ctx.getImageData(0, 0, 1, 1).data) as [
      number,
      number,
      number,
      number,
    ];
    return { r, g, b, a: a / 255, raw };
  }, prop);
}

function luminance({ r, g, b }: Rgb): number {
  const f = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

/** WCAG 대비. 알파는 무시한다(불투명 글자·선을 잴 때만 쓴다) */
export function contrast(a: Rgb, b: Rgb): number {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100;
}

export const WHITE: Rgb = { r: 255, g: 255, b: 255, a: 1 };

/** 여러 computed 속성을 한 번에 */
export function styles(
  el: Locator,
  props: string[],
): Promise<Record<string, string>> {
  return el.evaluate((node, props) => {
    const cs = getComputedStyle(node);
    return Object.fromEntries(props.map((p) => [p, cs.getPropertyValue(p)]));
  }, props);
}

/** 가로 스크롤이 생겼는지 — 1470px 기준 잘림 확인 */
export function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
}

/**
 * 관찰값 기록. 단언이 아니라 "지금 이렇게 보인다"를 남길 때 — `runs/loop-01-upload/qa/observations.jsonl`
 * 한 줄 + 리포트 annotation. 다음 회차가 같은 이름으로 비교한다.
 */
export function observe(name: string, data: unknown): void {
  const line = JSON.stringify({ at: new Date().toISOString(), name, data });
  appendFileSync(path.join(QA_DIR, "observations.jsonl"), `${line}\n`);
  test.info().annotations.push({ type: name, description: line });
}

/** 하단 저장 버튼 — 함께 게시를 끄면 "상품 등록", 켜면 "상품 & 게시글 등록", 수정은 "저장하기" */
export function anySaveButton(page: Page): Locator {
  return page.getByRole("button", {
    name: /^(상품 등록|상품 & 게시글 등록|저장하기)$/,
  });
}
