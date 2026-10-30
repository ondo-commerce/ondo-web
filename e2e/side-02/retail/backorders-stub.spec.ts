import { expect, test, type APIRequestContext } from "@playwright/test";
import { STUB_ORIGIN } from "./stub-api";

/**
 * #304 S1-8 — 가짜 API(3199)의 미송 대기 현황 경로와 손잡이. 위치가 `e2e/loop-06b-retail-notify/`가 아니라
 * 여기인 이유: `playwright.stub.config.ts` testMatch 에 그 폴더가 없고, 이번 stage 훅이 설정 파일 쓰기를 막는다.
 * stub 과 같은 폴더라 testMatch `side-02/retail/` 가 그대로 받는다. 장면 2의 9~11단계(알림 → `/backorders`)가
 * 이 위에 선다. 기준일 R = 지금 서울 날짜(stub, Next 서버와 같은 실제 시계, 기획 §5-4 6).
 *
 * 봄봄 시드: 9001(레드/L 4장, R−3), 9002(데님 소라/M 1장, 미정), 9006(레드/L 4장, R−3), 9003(린넨 베이지/L 2장, R+7).
 */

const DAY_MS = 86_400_000;
const SEOUL_OFFSET_MS = 9 * 3_600_000;

/** 서울 날짜 R+n `YYYY-MM-DD` */
function seoulPlus(days: number): string {
  return new Date(Date.now() + SEOUL_OFFSET_MS + days * DAY_MS)
    .toISOString()
    .slice(0, 10);
}

/** 시작 때의 R. 끝에 다시 재서 다르면(자정 넘김) 실패시킨다 */
const R0 = seoulPlus(0);

interface Row {
  backorderId: number;
  qty: number;
  expectedInboundDate: string | null;
  wholesaler: { id: number; name: string };
}

async function rowsAs(request: APIRequestContext, retailer: string) {
  const res = await request.get(
    `${STUB_ORIGIN}/api/retail/backorders?page=0&size=100`,
    { headers: { cookie: `stub_retailer=${retailer}` } },
  );
  expect(res.status()).toBe(200);
  return (await res.json()) as {
    data: Row[];
    meta: { page: number; totalElements: number; hasNext: boolean };
  };
}

const eta = (
  request: APIRequestContext,
  variantId: number,
  date: string | null,
) =>
  request.post(`${STUB_ORIGIN}/__stub/backorders/eta`, {
    data: { variantId, expectedInboundDate: date },
  });

test.beforeEach(async ({ request }) => {
  const reset = await request.post(`${STUB_ORIGIN}/__stub/reset`);
  expect(reset.status()).toBe(200);
});

test.afterAll(() => {
  expect(seoulPlus(0), "서울 자정을 넘겼다 — 다시 돌린다").toBe(R0);
});

test("S1-8 bombom 4행(9001 9002 9006 9003, 무드온 101), 9003 R+7, 원래 수량. miso 0행", async ({
  request,
}) => {
  const page = await rowsAs(request, "bombom");
  expect(page.data.map((r) => r.backorderId)).toEqual([9001, 9002, 9006, 9003]);
  expect(page.data.every((r) => r.wholesaler.id === 101)).toBe(true);
  expect(page.data.every((r) => r.wholesaler.name === "무드온")).toBe(true);
  expect(page.data.map((r) => r.qty)).toEqual([4, 1, 4, 2]);
  expect(page.data.map((r) => r.expectedInboundDate)).toEqual([
    seoulPlus(-3),
    null,
    seoulPlus(-3),
    seoulPlus(7),
  ]);
  expect(page.meta).toMatchObject({
    page: 0,
    totalElements: 4,
    hasNext: false,
  });
  // 응답에 SKU id 를 싣지 않는다(스펙 BackorderResponse 에 칸이 없다)
  expect(Object.keys(page.data[0] ?? {})).not.toContain("variantId");

  const miso = await rowsAs(request, "miso");
  expect(miso.data).toEqual([]);
  expect(miso.meta.totalElements).toBe(0);
});

test("S1-8 eta 손잡이 뒤 그 SKU 줄만 날짜가 바뀌고, reset 뒤 R+7 로 돌아온다. 없는 SKU 와 형식 오류 400", async ({
  request,
}) => {
  expect((await eta(request, 3019, seoulPlus(10))).status()).toBe(200);
  const after = await rowsAs(request, "bombom");
  const byId = new Map(after.data.map((r) => [r.backorderId, r]));
  expect(byId.get(9003)?.expectedInboundDate).toBe(seoulPlus(10));
  expect(byId.get(9001)?.expectedInboundDate).toBe(seoulPlus(-3));

  // 3003 은 9001, 9006 두 줄이 같이 바뀐다(입고일은 SKU 단위)
  await eta(request, 3003, null);
  const cleared = await rowsAs(request, "bombom");
  expect(
    cleared.data
      .filter((r) => r.backorderId === 9001 || r.backorderId === 9006)
      .map((r) => r.expectedInboundDate),
  ).toEqual([null, null]);

  expect((await eta(request, 9999, seoulPlus(1))).status()).toBe(400);
  expect((await eta(request, 3019, "11/8")).status()).toBe(400);

  // 장바구니 키를 단 reset(다른 spec 이 쓰는 모양)도 미송 표를 되돌린다
  await request.post(`${STUB_ORIGIN}/__stub/reset?cart=s1-8`);
  const back = await rowsAs(request, "bombom");
  expect(
    back.data.find((r) => r.backorderId === 9003)?.expectedInboundDate,
  ).toBe(seoulPlus(7));
  expect(
    back.data.find((r) => r.backorderId === 9001)?.expectedInboundDate,
  ).toBe(seoulPlus(-3));
});

test("S1-8 소매 /backorders 화면이 stub 로 그려진다: 4줄, 무드온 칩, eta 뒤 린넨 줄 새 날짜", async ({
  page,
  context,
  request,
}) => {
  await context.addCookies([
    { name: "stub_retailer", value: "bombom", url: "http://localhost:3101" },
  ]);
  await page.goto("/backorders?wholesaler=101");
  const table = page.locator("table").first();
  const rows = table.locator("tbody tr");
  await expect(rows).toHaveCount(4);
  const linen = rows.filter({ hasText: "린넨 셋업 자켓" });
  await expect(linen).toContainText("무드온");
  await expect(linen).toContainText(seoulPlus(7).replaceAll("-", "."));

  await eta(request, 3019, seoulPlus(10));
  await page.reload();
  await expect(linen).toContainText(seoulPlus(10).replaceAll("-", "."));
  await expect(linen).not.toContainText(seoulPlus(7).replaceAll("-", "."));
});
