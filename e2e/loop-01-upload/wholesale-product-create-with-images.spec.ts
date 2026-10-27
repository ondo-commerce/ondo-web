import { expect, test } from "@playwright/test";
import {
  addSlot,
  chooseFiles,
  expectDecoded,
  fillPostPanel,
  fillProductPanel,
  jpg,
  login,
  png,
  registered,
  saveButton,
} from "./helpers";

/**
 * S3-9 — 상품 등록 플로우 전체(#251). docs/08 규칙 7의 "등록 플로우" e2e 가 이것이다 —
 * 업로드는 이 안의 한 단계다.
 *
 * 시간 단언은 **상한 하나뿐**이다: 폼이 보인 순간부터 상세에 3장이 보일 때까지 2분. 단계마다
 * "N ms 안에"를 재지 않는다 — 그건 환경을 재는 것이지 기능을 재는 게 아니다.
 */
const DONE = { timeout: 15_000 };
const CREATE_LIMIT_MS = 120_000;

test("S3-9 로그인 → 등록 폼 → 상품 · 함께 게시 · 사진 3장 · 판매가 → 등록 → 상세에 이미지 3장, 2분 이내", async ({
  page,
}) => {
  let dialogs = 0;
  page.on("dialog", (dialog) => {
    dialogs += 1;
    void dialog.dismiss();
  });

  await login(page);
  await page.goto("/products/new");
  await expect(page.getByLabel("품명")).toBeVisible();
  const startedAt = Date.now();

  await fillProductPanel(page);
  await page.getByText("온도 마켓에 함께 게시").click();
  await expect(addSlot(page)).toBeVisible();
  await chooseFiles(page, [
    jpg("front.jpg"),
    png("back.png"),
    jpg("fabric.jpg"),
  ]);
  await expect(registered(page)).toHaveCount(3, DONE);
  await fillPostPanel(page);

  await saveButton(page).click();
  await page.waitForURL(/\/products\?productId=\d+/);
  const images = page.getByRole("img", { name: /^e2e 게시글 이미지 [123]$/ });
  await expect(images).toHaveCount(3);
  for (let i = 0; i < 3; i += 1) await expectDecoded(images.nth(i));
  const elapsedMs = Date.now() - startedAt;

  expect(elapsedMs).toBeLessThan(CREATE_LIMIT_MS);
  // 저장 성공 뒤 이동에 이탈 경고가 끼면 안 된다(S3-13)
  expect(dialogs).toBe(0);
});
