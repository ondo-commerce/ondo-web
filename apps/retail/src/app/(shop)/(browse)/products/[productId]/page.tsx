import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProductDetailView, findProductDetail } from "@/features/product";

type PageProps = { params: Promise<{ productId: string }> };

/**
 * 탭 제목에 상품명을 넣는다. 사장은 상품 여러 장을 탭으로 벌려 놓고 비교하는데,
 * 전부 `상품 상세`면 어느 탭이 무엇인지 탭 줄에서 구분되지 않는다.
 */
export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const product = findProductDetail((await params).productId);

  return { title: product ? product.name : "상품 상세" };
}

export default async function Page({ params }: PageProps) {
  const product = findProductDetail((await params).productId);

  /* 없는 상품이면 빈 상세를 그리지 않는다 — 값이 비어 있는 화면은 "품절"처럼
     읽혀서, 사장이 도매처에 전화를 건다 */
  if (!product) notFound();

  return <ProductDetailView product={product} />;
}
