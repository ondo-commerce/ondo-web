import type { Page } from "@playwright/test";
import { AUTH_FILE, PUBLIC_ACCOUNT, requirePassword } from "./shared";

/**
 * 앱마다 **한 번만** 로그인해서 세션을 파일(`e2e/.auth/`, gitignore)에 둔다. 로그인
 * 점검 spec은 그 세션을 재사용한다 — 화면마다 로그인하면 공개 계정에 POST가 18번
 * 나가고, dev 세션은 같은 계정의 새 로그인에 풀린다(03-review F15).
 *
 * setup project(`auth-*`)가 부른다. 여기서 실패하면 그 앱의 로그인 점검은 돌지
 * 않는다(project `dependencies`). 비밀번호가 없으면 skip이 아니라 실패다(F14).
 */
export async function signInAndSave(
  page: Page,
  app: "wholesale" | "retail",
): Promise<void> {
  const password = requirePassword();
  await page.goto("/login");
  await page.getByLabel("이메일").fill(PUBLIC_ACCOUNT[app]);
  const passwordField = page.getByLabel("비밀번호");
  await passwordField.fill(password);
  await page.getByRole("button", { name: "로그인" }).click();
  /* dev API가 느리면 30초 뒤 500이다(기획 §1) — 그보다 넉넉히 기다린다.
     `expect`로 기다리지 않는다: 실패한 `expect`는 그 순간의 접근성 스냅샷을
     `error-context.md`에 남기고, 거기에 비밀번호 칸 **값이 평문으로** 실린다
     (2026-10-28 실측). 칸을 비운 뒤 평범한 Error로 실패시킨다 */
  const left = await page
    .waitForURL((url) => !url.pathname.startsWith("/login"), {
      timeout: 45_000,
    })
    .then(() => true)
    .catch(() => false);
  if (!left) {
    await passwordField.fill("").catch(() => undefined);
    throw new Error(
      `${app} 공개 계정 로그인 실패 — 45초 안에 /login을 벗어나지 못했다(dev API 상태 확인, BE #280)`,
    );
  }
  await page.context().storageState({ path: AUTH_FILE[app] });
}
