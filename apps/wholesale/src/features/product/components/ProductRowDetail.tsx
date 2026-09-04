"use client";

import { ProductColorSizeList } from "./ProductColorSizeList";
import { ProductSkuTable } from "./ProductSkuTable";
import { useProductDetailQuery } from "../api/queries";
import { QueryBoundary } from "@/shared/api/QueryBoundary";

/**
 * 펼친 행의 내용. 목록 응답에는 색상·SKU가 **개수만** 있어서 펼치는 순간 상세를 부른다
 * (스펙: "아코디언 펼침 / 상세 패널 / 수정 초기값이 전부 이 응답"). 우측 상세 패널과
 * 같은 queryKey라 한 번만 받는다.
 *
 * 경계를 행 안에 둔다 — 한 행의 상세가 실패했다고 목록 전체가 죽으면 안 된다.
 */
export function ProductRowDetail({ productId }: { productId: number }) {
  return (
    <QueryBoundary>
      <ProductRowDetailBody productId={productId} />
    </QueryBoundary>
  );
}

function ProductRowDetailBody({ productId }: { productId: number }) {
  const { data: product } = useProductDetailQuery(productId);

  /* 게시글 등록 여부에 따라 펼친 내용이 완전히 다르다 */
  return product.post ? (
    <ProductSkuTable product={product} />
  ) : (
    <ProductColorSizeList product={product} />
  );
}
