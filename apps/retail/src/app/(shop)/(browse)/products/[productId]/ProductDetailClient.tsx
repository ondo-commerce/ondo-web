"use client";

import { useAddCartItemMutation } from "@/features/cart";
import { ProductDetailView, type ProductDetail } from "@/features/product";

/**
 * 상세 화면과 장바구니 뮤테이션을 붙이는 자리.
 *
 * `features/product`가 `features/cart`를 직접 import 하지 않는다 — feature끼리
 * 참조하지 않고 **부모인 `app/`이 끼워 넣는다**(`docs/02-folder-structure.md`
 * 원칙 3). 스펙이 한 요청에 조합 하나라(`AddCartItemRequest`) 조합 수만큼
 * `POST /cart-items`를 보낸다. 성공하면 뮤테이션의 `onSuccess`가
 * `router.refresh()`로 헤더 뱃지를 다시 그린다.
 *
 * 하나라도 실패하면 전체가 reject되지만 이미 나간 요청은 취소되지 않는다 —
 * 그래서 상세 화면은 실패 시 "담김" 지문을 굳히지 않고 다시 누를 수 있게 둔다.
 */
export function ProductDetailClient({ product }: { product: ProductDetail }) {
  const { mutateAsync } = useAddCartItemMutation();

  return (
    <ProductDetailView
      product={product}
      onAddToCart={(items) =>
        Promise.all(items.map((item) => mutateAsync(item)))
      }
    />
  );
}
