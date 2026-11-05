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

/**
 * 이 시험만의 미송 범위 키(08f M2). 공유 표를 쓰면 이 파일의 reset과 eta가 다른 worker의 06b 리허설(공유 표에 eta)을
 * 덮고, 거꾸로도 덮인다. 반복과 재시도가 다른 worker에서 같이 돌아도 겹치지 않게 둘 다 붙인다
 */
function scope(): string {
  const info = test.info();
  return `${info.testId}-${info.repeatEachIndex}-${info.retry}`;
}

async function rowsAs(request: APIRequestContext, retailer: string) {
  const res = await request.get(
    `${STUB_ORIGIN}/api/retail/backorders?page=0&size=100`,
    {
      headers: {
        cookie: `stub_retailer=${retailer}; stub_backorders=${scope()}`,
      },
    },
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
  request.post(
    `${STUB_ORIGIN}/__stub/backorders/eta?backorders=${encodeURIComponent(scope())}`,
    { data: { variantId, expectedInboundDate: date } },
  );

const resetScope = (request: APIRequestContext) =>
  request.post(
    `${STUB_ORIGIN}/__stub/reset?backorders=${encodeURIComponent(scope())}`,
  );

test.beforeEach(async ({ request }) => {
  expect((await resetScope(request)).status()).toBe(200);
});

test.afterAll(() => {
  expect(seoulPlus(0), "서울 자정을 넘겼다 — 다시 돌린다").toBe(R0);
});

/* loop-08f §4-1 9가 시드에 라온(102) 801 한 줄을 더했다. 무드온 넷은 그대로이고 801은 주문이 제일 늦어 맨 뒤다 */
test("S1-8 bombom 무드온 4행(9001 9002 9006 9003) + 라온 801, 9003 R+7, 원래 수량. miso 0행", async ({
  request,
}) => {
  const page = await rowsAs(request, "bombom");
  expect(page.data.map((r) => r.backorderId)).toEqual([
    9001, 9002, 9006, 9003, 801,
  ]);
  const moodon = page.data.slice(0, 4);
  expect(moodon.every((r) => r.wholesaler.id === 101)).toBe(true);
  expect(moodon.every((r) => r.wholesaler.name === "무드온")).toBe(true);
  expect(page.data[4]?.wholesaler).toEqual({ id: 102, name: "라온" });
  expect(moodon.map((r) => r.qty)).toEqual([4, 1, 4, 2]);
  expect(moodon.map((r) => r.expectedInboundDate)).toEqual([
    seoulPlus(-3),
    null,
    seoulPlus(-3),
    seoulPlus(7),
  ]);
  expect(page.meta).toMatchObject({
    page: 0,
    totalElements: 5,
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

  /* 범위 reset이 그 범위 표를 시드로 되돌린다. (08f M2 전에는 공유 표의 `reset?cart=`를 여기서 확인했다 — 공유 표를
     건드리면 다른 worker의 06b eta를 덮어서 뺐다. 공유 reset의 되돌림은 06b 리허설이 직접 기댄다) */
  expect((await resetScope(request)).status()).toBe(200);
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
    { name: "stub_backorders", value: scope(), url: "http://localhost:3101" },
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

test("08f M2 범위 격리: 다른 범위의 empty reset과 eta가 이 범위 표를 안 바꾼다. 만든 적 없는 범위는 400", async ({
  request,
}) => {
  const other = `${scope()}-other`;
  const knob = (path: string) =>
    `${STUB_ORIGIN}/__stub/${path}?backorders=${encodeURIComponent(other)}`;
  expect(
    (
      await request.post(knob("reset"), { data: { backorders: "seed" } })
    ).status(),
  ).toBe(200);
  expect(
    (
      await request.post(knob("backorders/eta"), {
        data: { variantId: 3019, expectedInboundDate: seoulPlus(10) },
      })
    ).status(),
  ).toBe(200);
  expect(
    (
      await request.post(knob("reset"), { data: { backorders: "empty" } })
    ).status(),
  ).toBe(200);
  const mine = await rowsAs(request, "bombom");
  expect(mine.meta.totalElements).toBe(5);
  expect(
    mine.data.find((r) => r.backorderId === 9003)?.expectedInboundDate,
  ).toBe(seoulPlus(7));

  const missing = await request.get(`${STUB_ORIGIN}/api/retail/backorders`, {
    headers: { cookie: `stub_retailer=bombom; stub_backorders=${other}-x` },
  });
  expect(missing.status()).toBe(400);
});
