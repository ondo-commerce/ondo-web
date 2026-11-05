import { expect, type Page } from "@playwright/test";

export {
  cardLines,
  count,
  inquiryCard,
  knob,
  requests,
  settled,
  startAt,
  STATS_GET,
  waitCount,
} from "../loop-08-chat-polish/helpers";

/**
 * loop-08f-chat-rest 계약(#371) 도매 e2e. 기본 설정 wholesale 프로젝트(3100, MSW).
 *
 * 목은 페이지 안(MSW)이라 `page.goto`마다 시드로 돌아간다. 그래서 손잡이와 입금은 **로그인 화면에서** 걸고,
 * 로그인 뒤에는 클라이언트 이동만 한다(08 helpers `startAt` 머리 주석과 같은 이유).
 */

/** 서울 10/29(목) 11:59:30 — 영업일은 아직 10/28. `stats-v1` 시드의 10/28 영업일 = F1~F12 */
export const T_1159 = new Date("2026-10-29T11:59:30+09:00");
/** 정산 시험 시각(S1-3과 같다). 입금 paidAt 10/28이 미래가 아니다 */
export const T_1420 = new Date("2026-10-29T14:20:00+09:00");

export const ALLOCATIONS_POST = {
  path: /\/api\/wholesale\/allocations$/,
  method: "POST",
} as const;

/** 브라우저 안 목에 배분 없는 입금 하나. 화면 경로가 아니라 fetch로(기획 S1-6) */
export async function depositViaFetch(
  page: Page,
  input: { amount: number; paidAt: string; key: string },
): Promise<void> {
  const status = await page.evaluate(async ({ amount, paidAt, key }) => {
    const res = await fetch("/api/wholesale/payments", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": key },
      body: JSON.stringify({
        retailerId: 1,
        amount,
        paidAt,
        paidBy: "RETAILER",
        method: "BANK_TRANSFER",
        allocations: [],
      }),
    });
    return res.status;
  }, input);
  expect(status, "입금 POST /payments").toBe(201);
}

/** 화면 오류(잡히지 않은 예외, console.error)를 모은다. 시작 전에 건다 */
export function collectPageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`console: ${m.text()}`);
  });
  return errors;
}
