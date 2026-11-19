import type { Page } from "@playwright/test";

/**
 * side-02 QA가 같이 쓰는 것. 공개 스모크(`public/shared.ts`)는 "준비 중"을 다이얼로그,
 * `data-ac`, `dl`, alert/status 안에서만 센다. QA는 **화면에 보이는 글자 전부**를
 * 세고, 글자 노드 전체가 정확히 "준비 중"인 것(주문 상태 배지)만 뺀다. 두 결과를
 * 나란히 적어 스모크가 놓치는 자리를 드러낸다.
 */
export const QA_DIR = ".claude/harness/runs/side-02-demo-ready/qa";

/** brief-qa §2 금칙어 + 기획 §2의 영문 404 */
export const QA_WORDS = [
  "준비 중",
  "Placeholder",
  "예시",
  "서버가 없어요",
  "봄봄상회",
  "서울유통",
  "This page could not be found",
] as const;

/** `단어 | <태그#id> | 글자` 목록. 보이는 글자 노드만, script/style 제외 */
export async function qaHits(page: Page): Promise<string[]> {
  return page.evaluate(
    (words) => {
      const out: string[] = [];
      const walker = document.createTreeWalker(
        document.body,
        NodeFilter.SHOW_TEXT,
      );
      while (walker.nextNode()) {
        const node = walker.currentNode;
        const el = node.parentElement;
        if (!el || ["SCRIPT", "STYLE", "NOSCRIPT"].includes(el.tagName))
          continue;
        if (!el.checkVisibility()) continue;
        const text = (node.textContent ?? "").trim();
        for (const word of words) {
          if (!text.includes(word)) continue;
          /* 상태 배지("준비 중" 한 덩어리)는 진짜 상태명이라 뺀다 */
          if (word === "준비 중" && text === "준비 중") continue;
          const tag = `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""}`;
          out.push(`${word} | <${tag}> | ${text.slice(0, 60)}`);
        }
      }
      return out;
    },
    QA_WORDS as unknown as string[],
  );
}

export function shot(page: Page, name: string) {
  return page.screenshot({ path: `${QA_DIR}/${name}.png`, fullPage: true });
}
