import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { ProductDetailClient } from "./ProductDetailClient";
import {
  PRODUCT_PATH,
  toProductDetail,
  type ListingDetailWire,
  type ProductDetail,
} from "@/features/product";
import { isNotFound, serverApi } from "@/shared/api/server";

type PageProps = { params: Promise<{ productId: string }> };

/**
 * 상세 한 장을 서버에서 받는다. `generateMetadata`와 본문이 같은 요청을 두 번
 * 보내지 않게 `cache()`로 묶는다 — 한 렌더 안에서만 산다.
 *
 * **없는 상품이면 null** — 404(`RESOURCE_NOT_FOUND`)만 삼킨다. 나머지(5xx·연결 실패)는
 * 그대로 던져 `(shop)/error.tsx`가 받는다. 주소의 id가 숫자가 아니면 서버가 400을
 * 주므로(dev 실측) 부르지도 않는다 — 스펙의 `listingId`는 int64다.
 */
const getProduct = cache(
  async (productId: string): Promise<ProductDetail | null> => {
    if (!/^\d+$/.test(productId)) return null;

    const api = await serverApi();
    try {
      const wire = await api.fetch<ListingDetailWire>(
        PRODUCT_PATH.detail(Number(productId)),
      );
      return toProductDetail(wire);
    } catch (error) {
      if (isNotFound(error)) return null;
      throw error;
    }
  },
);

/**
 * 탭 제목에 상품명을 넣는다. 사장은 상품 여러 장을 탭으로 벌려 놓고 비교하는데,
 * 전부 `상품 상세`면 어느 탭이 무엇인지 탭 줄에서 구분되지 않는다.
 */
export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const product = await getProduct((await params).productId);

  return { title: product ? product.name : "상품 상세" };
}

export default async function Page({ params }: PageProps) {
  const product = await getProduct((await params).productId);

  /* 없는 상품이면 빈 상세를 그리지 않는다 — 값이 비어 있는 화면은 "품절"처럼
     읽혀서, 사장이 도매처에 전화를 건다. dev는 지금 게시글이 0건이라 어느 id로
     들어와도 여기다 */
  if (!product) notFound();

  return <ProductDetailClient product={product} />;
}
