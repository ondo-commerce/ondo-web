import { expect, test, type Page } from "@playwright/test";

/**
 * production 공개 스모크가 같이 쓰는 것. side-02 S3(#278).
 *
 * `PUBLIC_SMOKE=1`이 없으면 spec 전체를 건너뛴다 — 네트워크와 production 상태에
 * 매달린 테스트라 실수로 돌면 안 된다.
 */
export function gatePublicSmoke(): void {
  test.skip(
    process.env.PUBLIC_SMOKE !== "1",
    "production 스모크는 PUBLIC_SMOKE=1 일 때만 돈다(pnpm e2e:public)",
  );
}

/**
 * 로그인 뒤 단언을 건너뛰는 이유. 2026-10-28 실측: `api-dev.ddmondo.co.kr`에서 DB를
 * 타는 요청(로그인 포함)이 30초 뒤 500이다(기획 §1, BE 요청 B1 · #280). production도
 * 그 서버를 본다. 서버가 살아나고 공개 계정 비밀번호(`PUBLIC_PW`)를 넣으면 돈다.
 */
export const LOGIN_BLOCKED_REASON =
  "dev API 로그인 500(BE #280, B1). 복구 뒤 PUBLIC_PW·PUBLIC_W_EMAIL·PUBLIC_R_EMAIL을 넣고 돌린다";

export function loginEnabled(): boolean {
  return process.env.PUBLIC_LOGIN === "1" && Boolean(process.env.PUBLIC_PW);
}

/**
 * 화면 **어디에 있어도** 안 되는 말. 더미 상호(`봄봄상회` 하드코딩, 계좌 스텁의
 * `서울유통`), 자리표시, 영문 404, 사실이 아닌 세션 안내.
 */
export const FORBIDDEN_ANYWHERE = [
  "Placeholder",
  "TODO",
  "예시 값",
  "서버가 없어요",
  "봄봄상회",
  "서울유통",
  "This page could not be found",
] as const;

/**
 * "준비 중"은 **문맥으로만** 본다. 주문·출고 상태 라벨(`WAITING_SHIPMENT`,
 * `PREPARING` = "준비 중")은 BE 상태의 진짜 이름이라 화면 전체에서 세면 정상인 주문
 * 목록이 걸린다(02-dev #277 §6). 더미였던 자리는 전부 다이얼로그(비밀번호 찾기,
 * 문의하기), 요약 카드(`dl`, 도매처 홈의 "거래 정보 준비 중"), 알림 배너, `data-ac`
 * 표시 자리라 그 안에서만 센다. 표의 상태 배지는 이 범위 밖이다.
 */
export const PENDING_WORD = "준비 중";
const PENDING_CONTEXT =
  '[role="dialog"], [data-ac], dl, [role="alert"], [role="status"]';

/** 위반을 문자열 목록으로 돌려준다 — 실패 메시지에 무엇이 어디서 걸렸는지 남기려고 */
export async function forbiddenHits(page: Page): Promise<string[]> {
  const hits: string[] = [];
  const body = (await page.locator("body").innerText()) ?? "";
  for (const word of FORBIDDEN_ANYWHERE) {
    if (body.includes(word)) hits.push(`${page.url()} | ${word}`);
  }
  const contexts = await page.locator(PENDING_CONTEXT).allInnerTexts();
  for (const text of contexts) {
    if (text.includes(PENDING_WORD)) {
      hits.push(`${page.url()} | ${PENDING_WORD} | ${text.slice(0, 60)}`);
    }
  }
  return hits;
}

export async function expectNoForbidden(page: Page): Promise<void> {
  expect(await forbiddenHits(page)).toEqual([]);
}

/** 막다른 길이던 다이얼로그를 열어 본문까지 센다 */
export async function openDialog(page: Page, trigger: string): Promise<void> {
  await page.getByRole("button", { name: trigger }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
}
