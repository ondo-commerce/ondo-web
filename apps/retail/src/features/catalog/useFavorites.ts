"use client";

import { useState } from "react";
import type { CatalogProduct } from "./types";

/**
 * 찜 상태. **서버가 없어서 화면이 들고 있다** — API가 붙으면 이 훅만 갈아 끼운다.
 *
 * 카드가 각자 들고 있지 않은 이유: 도매처 홈은 같은 상품이 `신상`과 `전체 상품`
 * 양쪽에 나온다. 카드마다 상태를 두면 한쪽 하트만 켜진다.
 *
 * 찜을 꺼도 **목록에서 카드를 빼지 않는다**(게이트 Q7). 즉시 제거는 되돌릴 수
 * 없고, 잘못 눌렀을 때 무엇이 사라졌는지조차 남지 않는다. 화면을 떠났다 오면
 * 그때 초기값에서 다시 만들어지므로 그 시점에 빠진다.
 */
export function useFavorites(products: readonly CatalogProduct[]) {
  const [favorites, setFavorites] = useState<ReadonlySet<string>>(
    () => new Set(products.filter((p) => p.favorited).map((p) => p.id)),
  );

  const toggleFavorite = (productId: string) =>
    setFavorites((prev) => {
      const next = new Set(prev);
      if (!next.delete(productId)) next.add(productId);
      return next;
    });

  return { favorites, toggleFavorite };
}
