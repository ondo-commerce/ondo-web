import { expect, type Locator, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * loop-01-upload 공통. 로그인은 mock 모드라 아무 이메일이나 통과한다 — 스냅샷 example이
 * `approvalStatus: "APPROVED"`라 `/products`로 떨어진다. 세션은 `sessionStorage`라
 * 테스트(= 새 컨텍스트)마다 다시 로그인한다.
 */

/** 진짜 바이트 픽스처. 목이 매직 넘버로 판정하므로 내용이 jpg·png 여야 한다 */
export const JPG = readFileSync(path.join(__dirname, "../fixtures/a.jpg"));
export const PNG = readFileSync(path.join(__dirname, "../fixtures/b.png"));
/** 픽스처의 실제 크기. S2-12 가 등록 칸이 A 인지 B 인지를 이걸로 가른다 */
export const JPG_WIDTH = 16;
export const PNG_WIDTH = 24;

export interface FilePayload {
  name: string;
  mimeType: string;
  buffer: Buffer;
}

/** 같은 jpg 바이트에 이름만 다르게 — 파일명이 목의 손잡이(`slow5s`·`fail500`…)다 */
export function jpg(name: string): FilePayload {
  return { name, mimeType: "image/jpeg", buffer: JPG };
}

export function png(name: string): FilePayload {
  return { name, mimeType: "image/png", buffer: PNG };
}

export async function login(page: Page): Promise<void> {
  await page.goto("/login");
  await expect(page.getByText("도매 사장님 로그인")).toBeVisible();
  await page.getByLabel("이메일").fill("e2e@ondo.test");
  await page.getByLabel("비밀번호").fill("ondo1234!");
  await page.getByRole("button", { name: "로그인" }).click();
  /* 로그인 도착지는 `/dashboard`다(#276). 각 spec이 그다음에 자기 화면으로 간다 */
  await page.waitForURL(/\/dashboard/);
}

/** `/products/new` 에서 `함께 게시` 를 켜 게시글 패널(격자)을 연다 */
export async function openCreateWithPost(page: Page): Promise<void> {
  await page.goto("/products/new");
  await page.getByText("온도 마켓에 함께 게시").click();
  await expect(addSlot(page)).toBeVisible();
}

export function addSlot(page: Page): Locator {
  return page.getByRole("button", { name: /^이미지 추가/ });
}

/** 이미지 격자. `data-state` 는 radix 컴포넌트에도 붙어 있어 칸은 이 안에서만 센다 */
export function grid(page: Page): Locator {
  return page.locator('[data-ac="S2-8"]');
}

/** 격자 안 모든 칸(등록 · 대기 · 진행 · 보류 · 실패). `+` 는 빠진다 */
export function cells(page: Page): Locator {
  return grid(page).locator("> [data-state]");
}

/** 등록 칸(`images[]`에 들어간 것). 업로드 칸은 `data-state` 가 다르다 */
export function registered(page: Page): Locator {
  return slotsIn(page, "registered");
}

/**
 * 등록 칸의 집기 손잡이. 칸 이름("이미지 N, 대표")과 잠김(aria-disabled)은 여기에만 있다 —
 * 바깥 칸은 자리만 받는다(#254 F5, side-01 F1)
 */
export function handleOf(cell: Locator): Locator {
  return cell.locator('[aria-roledescription="sortable"]');
}

export function slotsIn(page: Page, state: string): Locator {
  return grid(page).locator(`> [data-state="${state}"]`);
}

export function saveButton(page: Page): Locator {
  return page.getByRole("button", { name: /상품 & 게시글 등록|저장하기/ });
}

/**
 * `+` 를 눌러 OS 파일 선택을 열고 파일을 넣는다. `setInputFiles` 로 숨은 input 에 직접
 * 넣지 않는 이유: `+` 가 정말 선택기를 여는지(S2-1)가 AC 다.
 */
export async function chooseFiles(
  page: Page,
  files: FilePayload[],
): Promise<void> {
  const [chooser] = await Promise.all([
    page.waitForEvent("filechooser"),
    addSlot(page).click(),
  ]);
  await chooser.setFiles(files);
}

/** 목이 센 `POST /listing-images` 횟수 — 서비스 워커가 삼킨 요청은 Playwright 가 못 본다 */
export function uploadRequestCount(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      (window as unknown as { __listingImageRequests?: number })
        .__listingImageRequests ?? 0,
  );
}

/** 마지막 `POST/PATCH /products` 본문. 목이 `window` 에 남긴다 */
export function lastProductRequest(page: Page): Promise<unknown> {
  return page.evaluate(
    () =>
      (window as unknown as { __lastProductRequest?: unknown })
        .__lastProductRequest,
  );
}

/** `img` 가 실제로 그려졌는지. `naturalWidth > 0` 이 "미리보기가 아이콘으로 안 떨어졌다"의 증거다 */
export async function expectDecoded(img: Locator, width?: number) {
  const poll = expect.poll(
    () => img.evaluate((e) => (e as HTMLImageElement).naturalWidth),
    { timeout: 10_000 },
  );
  if (width === undefined) await poll.toBeGreaterThan(0);
  else await poll.toBe(width);
}

/** 저장 버튼 옆 한 줄("사진 올리는 중…" / "실패한 사진 N장은 …"). ErpGuard 의 sr-only status 와 섞이지 않게 */
export function uploadNote(page: Page): Locator {
  return page.locator('p[role="status"][data-ac]');
}

/**
 * 등록에 필요한 최소 상품 폼. 품명 · 카테고리 리프 · 색상 1 + 사이즈 1 · 게시글 이름 · 판매가.
 * 게시글 이미지는 호출부가 올린다. 좌(상품)·우(게시글) 패널을 따로 채울 수 있게 둘로 나눴다 —
 * S3-9 가 "상품 → 함께 게시 → 사진 → 판매가" 순서를 그대로 밟는다.
 */
export async function fillProductForm(page: Page): Promise<void> {
  await fillProductPanel(page);
  await fillPostPanel(page);
}

/** 좌측 상품 패널. 카테고리·색상·사이즈는 시드 값(여성 > 상의 > 티셔츠, 블랙 M) */
export async function fillProductPanel(page: Page): Promise<void> {
  await page.getByLabel("품명", { exact: true }).fill("e2e 업로드 상품");

  await page.getByRole("combobox", { name: "카테고리 대분류" }).click();
  await page.getByRole("option", { name: "여성" }).click();
  await page.getByRole("combobox", { name: "카테고리 중분류" }).click();
  await page.getByRole("option", { name: "상의" }).click();
  await page.getByRole("combobox", { name: "카테고리 소분류" }).click();
  await page.getByRole("option", { name: "티셔츠" }).click();

  await page.getByRole("button", { name: "색상 선택" }).click();
  await page.getByRole("button", { name: "블랙" }).click();
  await page.getByRole("button", { name: /^확인/ }).click();
  await page.getByRole("checkbox", { name: "블랙 M" }).click();
}

/** 우측 게시글 패널(`함께 게시` 뒤). 게시글 이름 + 블랙 M 판매가 */
export async function fillPostPanel(page: Page): Promise<void> {
  await page.getByLabel("게시글 이름").fill("e2e 게시글");
  await page.getByRole("textbox", { name: "블랙 M 판매가" }).fill("12000");
}

/** 저장을 누르고 상세로 이동할 때까지. 돌아오는 건 목이 받은 요청 본문 */
export async function submitCreate(page: Page): Promise<{
  listing: { images: string[] };
}> {
  await saveButton(page).click();
  await page.waitForURL(/\/products\?productId=\d+/);
  return (await lastProductRequest(page)) as { listing: { images: string[] } };
}

/* ------------------------------------------------------------------------
 * S3 (#251) — 수정 화면 · 취소 모달 · 상세
 * ------------------------------------------------------------------------ */

/** 시드의 수정 화면. 게시글 패널이 그려질 때까지 기다린다 */
export async function openEdit(page: Page, productId: number): Promise<void> {
  await page.goto(`/products/${productId}/edit`);
  await expect(
    page.getByRole("heading", { name: "게시글 수정" }),
  ).toBeVisible();
}

/** 수정 화면의 상태 토글(`Segmented` = radix ToggleGroup single → `radio`) */
export function statusRadio(
  page: Page,
  label: "판매중" | "시즌 종료",
): Locator {
  return page.getByRole("radio", { name: label });
}

/** 하단 바의 `취소`. 모달 안 버튼·색상 팝오버와 섞이지 않게 `data-ac` 로 짚는다 */
export function cancelButton(page: Page): Locator {
  return page.locator('button[data-ac~="S3-12"]');
}

/** 취소 확인 모달(D22) */
export function leaveDialog(page: Page): Locator {
  return page.getByRole("dialog", {
    name: "작성 중인 내용이 사라져요. 나갈까요?",
  });
}

/** 하단 바의 `_form` 한 줄(서버 장애 등 칸에 못 붙인 실패) */
export function formAlert(page: Page): Locator {
  return page.locator('p[role="alert"]');
}

/** 필드 아래 오류 줄. id 는 `errorId(field)` 규칙 그대로 */
export function fieldError(page: Page, field: string): Locator {
  return page.locator(`#product-${field.replace(".", "-")}-error`);
}

/** 목록 우측 상세의 `게시글 이미지` 칸들. `ImageSlot` 은 role 이 없어 구조로 센다 */
export function detailImageSlots(page: Page): Locator {
  return page
    .locator("section", {
      has: page.getByRole("heading", { name: "게시글 이미지" }),
    })
    .locator("> div > div");
}

/** 마지막 PATCH 본문. `listing` 은 생략될 수 있다(무변경) */
export function lastUpdateRequest(page: Page): Promise<{
  listing?: { images: string[] };
}> {
  return lastProductRequest(page) as Promise<{
    listing?: { images: string[] };
  }>;
}

/**
 * `×` 를 드래그 문턱(8px) **안**에서 누른다 — 누른 채 3px 움직였다가 뗀다. 손떨림에도 클릭이
 * 먹어야 한다는 S3-1 의 조건이라 `click()` 대신 마우스를 직접 움직인다.
 */
export async function pressWithinDragThreshold(button: Locator): Promise<void> {
  const box = await button.boundingBox();
  if (!box) throw new Error("버튼이 보이지 않는다");
  const page = button.page();
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 3, y + 3);
  await page.mouse.up();
}
