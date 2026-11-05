import { expect, type Locator, type Page } from "@playwright/test";
import { inquiryCard } from "../loop-08-chat-polish/helpers";

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

/* --- 문의 카드 7일 줄(#373 S3) ------------------------------------- */

/** 7일 stats GET(`?from=…&to=…`). 오늘 GET(인자 없음)은 08 `STATS_GET` */
export const WEEK_GET = {
  path: /\/api\/wholesale\/chat\/inquiry-stats\?from=/,
  method: "GET",
} as const;

/** 7일 줄 `<p>`(숫자가 있을 때) */
export function weekLine(page: Page): Locator {
  return inquiryCard(page).locator('p[data-ac~="08f:S3-2"]');
}

/** 7일 줄 실패 한 줄 */
export function weekFailed(page: Page): Locator {
  return inquiryCard(page).locator('p[data-ac~="08f:S3-3"]');
}

/** 7일 줄 막대(로딩) */
export function weekBar(page: Page): Locator {
  return inquiryCard(page).getByRole("status", {
    name: "최근 7일 불러오는 중",
    exact: true,
  });
}

export interface StatsEvent {
  phase: "start" | "end";
  /** 쿼리 문자열(`""` = 오늘 요청) */
  search: string;
  status?: number;
  /** 응답 `data.from`(성공일 때만) */
  from?: string;
}

/**
 * stats 요청의 시작과 끝을 **일어난 순서대로** 적는다(S3-2 "7일 요청 시작이 오늘 응답 끝 뒤", S3-5 오늘 응답 `from`).
 * `page.goto` 전에 부른다. 08 `watchRequests`와 같이 fetch를 감싼다(둘 다 걸려도 서로 모른다).
 * 시각 대신 순서를 쓰는 이유: `page.clock`이 `performance.now`까지 바꾼다
 */
export async function watchStats(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const log: StatsEvent[] = [];
    (window as unknown as { __stats: StatsEvent[] }).__stats = log;
    const original = window.fetch.bind(window);
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const raw =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input.url;
      const url = new URL(raw, location.href);
      if (!url.pathname.endsWith("/api/wholesale/chat/inquiry-stats"))
        return original(input, init);
      log.push({ phase: "start", search: url.search });
      const response = await original(input, init);
      const body = (await response
        .clone()
        .json()
        .catch(() => null)) as { data?: { from?: string } } | null;
      log.push({
        phase: "end",
        search: url.search,
        status: response.status,
        from: body?.data?.from,
      });
      return response;
    };
  });
}

export function statsLog(page: Page): Promise<StatsEvent[]> {
  return page.evaluate(
    () => (window as unknown as { __stats: StatsEvent[] }).__stats,
  );
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
