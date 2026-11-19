import { setupServer } from "msw/node";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { WholesaleSchema } from "../../wholesale";
import { productHandlers, resetProductMock } from "./product";

/**
 * 상품 수정 PATCH의 판매가(09-N1). 수정 화면은 기존 SKU를 `variantId`로만 보낸다 — 목이 색, 사이즈로만
 * 찾던 때는 판매가가 버려져 다시 열면 옛 값이었다. 등록, 새로 켠 사이즈가 쓰는 `(colorId, size)` 길은 그대로다.
 * 시드 1001 = 레드(17) S/M/L 3001~3003 + 네이비(11) S/M 3004~3005, 판매가 12500(레드 L만 13500).
 */

const ORIGIN = "http://mock.test";
const API = `${ORIGIN}/api/wholesale`;

type Detail = WholesaleSchema<"ProductDetailResponse">;
type Price = WholesaleSchema<"VariantPriceRequest">;

const server = setupServer(...productHandlers);
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterAll(() => server.close());
beforeEach(() => resetProductMock());

async function call<T>(method: string, url: string, json?: unknown) {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: json === undefined ? undefined : JSON.stringify(json),
  });
  return { status: res.status, body: (await res.json()) as T };
}

async function detail(id: number): Promise<Detail> {
  return (await call<{ data: Detail }>("GET", `${API}/products/${id}`)).body
    .data;
}

/** 상세의 가격표 행 순서 그대로 `[variantId, 판매가]` */
function rows(d: Detail): [number, number][] {
  return (d.colorOptions ?? []).flatMap((o) =>
    (o.variants ?? []).map((v): [number, number] => [v.id, v.salePrice]),
  );
}

/** 앱(`toListingRequest`)과 같은 모양. 기존 SKU마다 `toPrice`가 판매가 행 하나를 만든다 */
function patchBody(
  d: Detail,
  toPrice: (variantId: number, colorId: number, size: string) => Price,
): WholesaleSchema<"ProductUpdateRequest"> {
  const options = d.colorOptions ?? [];
  return {
    name: d.name,
    categoryId: 1,
    colorOptions: options.map((o) => ({
      colorId: o.color.id,
      sizes: (o.variants ?? []).map((v) => v.size),
    })),
    listing: {
      title: d.listing.title,
      description: d.listing.description,
      images: (d.listing.images ?? []).map((i) => i.url),
      isSinglePieceAllowed: d.listing.isSinglePieceAllowed,
      variantPrices: options.flatMap((o) =>
        (o.variants ?? []).map((v) => toPrice(v.id, o.color.id, v.size)),
      ),
    },
  } as WholesaleSchema<"ProductUpdateRequest">;
}

describe("상품 수정 PATCH 판매가", () => {
  it("variantId로 온 판매가가 상세에 남고 행 순서는 그대로", async () => {
    const before = await detail(1001);
    const res = await call<{ data: Detail }>(
      "PATCH",
      `${API}/products/1001`,
      patchBody(before, (variantId) => ({
        variantId,
        salePrice: variantId === 3001 ? 15500 : 12500,
        orderLimit: 0,
      })),
    );
    expect(res.status).toBe(200);

    const after = await detail(1001);
    expect(rows(after).map(([id]) => id)).toEqual(
      rows(before).map(([id]) => id),
    );
    expect(rows(after)).toContainEqual([3001, 15500]);
    expect(rows(after)).toContainEqual([3003, 12500]);
  });

  it("variantId 저장을 두 번 해도 행 순서는 그대로", async () => {
    const before = await detail(1001);
    for (const price of [15500, 16500]) {
      const current = await detail(1001);
      await call(
        "PATCH",
        `${API}/products/1001`,
        patchBody(current, (variantId) => ({
          variantId,
          salePrice: price,
          orderLimit: 0,
        })),
      );
    }
    const after = await detail(1001);
    expect(rows(after)).toEqual(rows(before).map(([id]) => [id, 16500]));
  });

  it("(colorId, size)로 온 판매가 길도 그대로 반영", async () => {
    const before = await detail(1001);
    await call(
      "PATCH",
      `${API}/products/1001`,
      patchBody(before, (_variantId, colorId, size) => ({
        colorId,
        size: size as Price["size"],
        salePrice: 14000,
        orderLimit: 3,
      })),
    );
    const after = await detail(1001);
    expect(rows(after)).toEqual(rows(before).map(([id]) => [id, 14000]));
    expect(
      (after.colorOptions ?? []).flatMap((o) =>
        (o.variants ?? []).map((v) => v.orderLimit),
      ),
    ).toEqual([3, 3, 3, 3, 3]);
  });
});
