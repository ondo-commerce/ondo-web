import { test as setup } from "@playwright/test";
import { signInAndSave } from "./auth";
import { gatePublicSmoke } from "./shared";

gatePublicSmoke();

setup("소매 공개 계정 로그인", async ({ page }) => {
  await signInAndSave(page, "retail");
});
