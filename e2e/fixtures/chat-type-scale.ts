import type { Page } from "@playwright/test";

/** 화면 글자 크기를 숫자로 박지 않고 지금 토큰 값에서 읽는다. 단계를 바꿔도 시험이 따라온다. */
export function chatTypeScale(page: Page) {
  return page
    .locator("main")
    .first()
    .evaluate((region) => {
      const probe = document.createElement("span");
      region.append(probe);
      function size(role: string) {
        probe.style.fontSize = `var(--text-${role})`;
        return getComputedStyle(probe).fontSize;
      }
      const scale = {
        small: size("xs"),
        muted: size("body"),
        body: size("sm"),
      };
      probe.remove();
      return scale;
    });
}
