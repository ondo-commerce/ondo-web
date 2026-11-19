import { expect, test } from "@playwright/test";
import {
  addSlot,
  chooseFiles,
  expectDecoded,
  fieldError,
  fillProductForm,
  formAlert,
  grid,
  JPG_WIDTH,
  jpg,
  login,
  openCreateWithPost,
  png,
  PNG_WIDTH,
  registered,
  saveButton,
  slotsIn,
} from "./helpers";
import { observe, shot } from "./qa-helpers";

/**
 * Codex 코드 리뷰 F1~F3(`runs/loop-01-upload/findings.jsonl`)의 회귀 테스트.
 *
 * QA 가 `test.fail()`로 재현해 둔 것을 G3 수정(#251)에서 표시를 떼 승격했다.
 * 단언은 **기획안이 말한 동작**이다 — 다시 깨지면 같은 결함이 돌아온 것이다.
 */
const DONE = { timeout: 15_000 };

test.beforeEach(async ({ page }) => {
  await login(page);
});

test("F1 — 실패한 A 를 재시도하면 뒤의 B 가 보류된다(기획안 §4-4: 실패 슬롯은 건너뛰고 재시도 성공분은 그때의 끝에)", async ({
  page,
}) => {
  await openCreateWithPost(page);
  // A: 첫 요청은 즉시 500(fail500once), 재시도는 5초(slow5s). B: 보통 600ms
  await chooseFiles(page, [png("slow5s-fail500once-A.png"), jpg("B.jpg")]);
  const failed = slotsIn(page, "failed");
  await expect(failed).toHaveCount(1);
  await page.getByRole("button", { name: "이미지 1 다시 시도" }).click();
  await expect(slotsIn(page, "uploading")).toHaveCount(1);

  // 기획안: B 는 A(실패→재시도 중)에 막히지 않고 끝나는 즉시 등록된다
  await expect(registered(page)).toHaveCount(1, { timeout: 3_000 });
  await expectDecoded(registered(page).first().locator("img"), JPG_WIDTH);
  await expect(slotsIn(page, "held")).toHaveCount(0);

  // A 가 끝나면 끝에 붙는다 → [B, A]
  await expect(registered(page)).toHaveCount(2, DONE);
  await expectDecoded(registered(page).nth(0).locator("img"), JPG_WIDTH);
  await expectDecoded(registered(page).nth(1).locator("img"), PNG_WIDTH);
});

test("F2 — multipart 가 아닌 본문(application/json)은 계약의 400 VALIDATION_FAILED(field=file) 이어야 한다", async ({
  page,
}) => {
  const reply = await page.evaluate(async () => {
    const res = await fetch("/api/wholesale/listing-images", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ file: "x" }),
    });
    return {
      status: res.status,
      body: await res.json().catch(() => null),
    };
  });
  observe("F2-observed", reply);
  expect(reply.status).toBe(400);
  expect(reply.body?.code).toBe("VALIDATION_FAILED");
  expect(reply.body?.errors?.[0]?.field).toBe("file");
});

test("F3 — 실패 칸 9개로 꽉 찬 채 0장 저장: + 가 없어도 포커스가 격자로 간다", async ({
  page,
}) => {
  await openCreateWithPost(page);
  await fillProductForm(page);
  await chooseFiles(
    page,
    Array.from({ length: 9 }, (_, i) => jpg(`x-fail500-${i}.jpg`)),
  );
  await expect(slotsIn(page, "failed")).toHaveCount(9, DONE);
  await expect(addSlot(page)).toHaveCount(0);
  await saveButton(page).click();
  await expect(fieldError(page, "listing.images")).toBeVisible();
  const active = await page.evaluate(() => {
    const el = document.activeElement;
    return el ? `${el.tagName}#${el.id}.${el.className}`.slice(0, 120) : null;
  });
  const insideGrid = await page.evaluate(() => {
    const el = document.activeElement;
    return !!el && !!el.closest('[data-ac="S2-8"]');
  });
  const alert = formAlert(page);
  const alertText =
    (await alert.count()) > 0 ? await alert.first().textContent() : null;
  observe("F3-observed", { active, insideGrid, formAlert: alertText });
  await page.screenshot({ path: shot("f3-nine-failed-save") });
  // 기획안 S3-7: 포커스가 격자(+)로 간다. 칸이 가득 차면 격자 자신이 받는다(F3)
  expect(insideGrid).toBe(true);
  await expect(grid(page)).toBeFocused();
  await expect(grid(page)).toHaveAttribute(
    "aria-describedby",
    "product-listing-images-error",
  );
  // 격자가 받았으니 하단 바 `_form` 대체 줄은 안 뜬다
  expect(alertText).toBeNull();
});
