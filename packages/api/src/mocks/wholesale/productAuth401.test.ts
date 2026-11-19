import { setupServer } from "msw/node";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { WholesaleSchema } from "../../wholesale";
import { productHandlers, resetProductMock } from "./product";

/**
 * 저장 401 손잡이 `[auth401]`(#404, 기획 §5-3). POST/PATCH는 품명, 시즌 종료/재개는 저장된 게시글
 * 제목을 본다. 같은 키의 첫 요청만 401이고 두 번째부터 통과해야 e2e가 "다른 탭 재로그인 뒤 저장 성공"을
 * 볼 수 있다. 시드 1001 = 게시글 2001(ON_SALE), 1006 = 게시글 2006(SEASON_ENDED).
 */

const ORIGIN = "http://mock.test";
const API = `${ORIGIN}/api/wholesale`;
const HOOK = "[auth401]";

type Detail = WholesaleSchema<"ProductDetailResponse">;
type Listing = WholesaleSchema<"ListingResponse">;
type ErrorBody = { code: string; message: string };

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

/** 앱이 보내는 PATCH와 같은 모양. 품명과 게시글 제목만 바꿔 끼운다 */
function patchBody(
  d: Detail,
  name: string,
  title: string,
): WholesaleSchema<"ProductUpdateRequest"> {
  const options = d.colorOptions ?? [];
  return {
    name,
    categoryId: 1,
    colorOptions: options.map((o) => ({
      colorId: o.color.id,
      sizes: (o.variants ?? []).map((v) => v.size),
    })),
    listing: {
      title,
      description: d.listing.description,
      images: (d.listing.images ?? []).map((i) => i.url),
      isSinglePieceAllowed: d.listing.isSinglePieceAllowed,
      variantPrices: options.flatMap((o) =>
        (o.variants ?? []).map((v) => ({
          variantId: v.id,
          salePrice: v.salePrice,
          orderLimit: v.orderLimit,
        })),
      ),
    },
  } as WholesaleSchema<"ProductUpdateRequest">;
}

/** 게시글 제목에 손잡이를 저장해 둔다. 품명은 깨끗해서 PATCH 자체는 200이다 */
async function storeHookedTitle(productId: number) {
  const d = await detail(productId);
  const res = await call(
    "PATCH",
    `${API}/products/${productId}`,
    patchBody(d, d.name, `${d.listing.title} ${HOOK}`),
  );
  return res.status;
}

function expect401(res: { status: number; body: unknown }) {
  expect(res.status).toBe(401);
  expect(res.body).toMatchObject({
    code: "UNAUTHENTICATED",
    message: "로그인이 필요합니다.",
  } satisfies ErrorBody);
}

describe("저장 401 손잡이 [auth401]", () => {
  it("POST 품명에 손잡이가 있으면 첫 요청만 401, 같은 품명 두 번째는 201", async () => {
    const body = {
      name: `니트 ${HOOK}`,
      categoryId: 1,
      colorOptions: [{ colorId: 17, sizes: ["S"] }],
    } as WholesaleSchema<"ProductCreateRequest">;

    expect401(await call("POST", `${API}/products`, body));
    const second = await call<{ data: Detail }>(
      "POST",
      `${API}/products`,
      body,
    );
    expect(second.status).toBe(201);
    expect(second.body.data.name).toBe(`니트 ${HOOK}`);
  });

  it("PATCH 품명에 손잡이가 있으면 첫 요청만 401, 두 번째는 200", async () => {
    const d = await detail(1001);
    const body = patchBody(d, `${d.name} ${HOOK}`, d.listing.title);

    expect401(await call("PATCH", `${API}/products/1001`, body));
    // 401은 아무것도 저장하지 않는다
    expect((await detail(1001)).name).toBe(d.name);
    const second = await call<{ data: Detail }>(
      "PATCH",
      `${API}/products/1001`,
      body,
    );
    expect(second.status).toBe(200);
    expect(second.body.data.name).toBe(`${d.name} ${HOOK}`);
  });

  it("게시글 제목에 손잡이가 저장된 ON_SALE 게시글의 시즌 종료는 첫 요청만 401, 두 번째는 200", async () => {
    expect(await storeHookedTitle(1001)).toBe(200);
    const url = `${API}/listings/2001/season-end`;

    expect401(await call("POST", url));
    expect((await detail(1001)).listing.status).toBe("ON_SALE");
    const second = await call<{ data: Listing }>("POST", url);
    expect(second.status).toBe(200);
    expect(second.body.data.status).toBe("SEASON_ENDED");
  });

  it("게시글 제목에 손잡이가 저장된 SEASON_ENDED 게시글의 재개는 첫 요청만 401, 두 번째는 200이고 ON_SALE", async () => {
    expect((await detail(1006)).listing.status).toBe("SEASON_ENDED");
    expect(await storeHookedTitle(1006)).toBe(200);
    const url = `${API}/listings/2006/reopen`;

    expect401(await call("POST", url));
    expect((await detail(1006)).listing.status).toBe("SEASON_ENDED");
    const second = await call<{ data: Listing }>("POST", url);
    expect(second.status).toBe(200);
    expect(second.body.data.status).toBe("ON_SALE");
    expect((await detail(1006)).listing.status).toBe("ON_SALE");
  });

  it("품명이 깨끗하면 게시글 제목에 손잡이가 있어도 PATCH는 200", async () => {
    const d = await detail(1001);
    const title = `${d.listing.title} ${HOOK}`;
    const res = await call<{ data: Detail }>(
      "PATCH",
      `${API}/products/1001`,
      patchBody(d, d.name, title),
    );
    expect(res.status).toBe(200);
    expect(res.body.data.listing.title).toBe(title);
  });
});
