import { notFound } from "next/navigation";
import { ProductEditView, findProduct } from "@/features/product";

export const metadata = { title: "상품 수정 · 온도 ERP" };

export default async function ProductEditPage({
  params,
}: {
  params: Promise<{ productId: string }>;
}) {
  const { productId } = await params;
  const product = findProduct(productId);

  if (!product) notFound();

  return <ProductEditView product={product} />;
}
