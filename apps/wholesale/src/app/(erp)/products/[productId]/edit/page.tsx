import { notFound } from "next/navigation";
import { ProductEditView } from "@/features/product";

export const metadata = { title: "상품 수정 · 온도 ERP" };

export default async function ProductEditPage({
  params,
}: {
  params: Promise<{ productId: string }>;
}) {
  const { productId } = await params;
  const id = Number(productId);

  // 스펙의 productId는 int64다. 숫자가 아닌 주소는 서버에 물을 것도 없이 없는 페이지다
  if (!Number.isInteger(id) || id <= 0) notFound();

  return <ProductEditView productId={id} />;
}
