import type { PostStatusKey, Product } from "./types";

/**
 * 상품 하나의 게시 상태를 한 축의 값으로 좁힌다.
 *
 * 게시글이 없는 상품은 상태값 자체가 없어서(`post === null`) `NONE`으로 떨어뜨린다.
 * 목록 배지와 필터가 **같은 기준으로 갈라야** 하므로 `?? "NONE"`을 각자 쓰지 않고
 * 여기 한 곳에 둔다 — 한쪽만 바뀌면 배지는 `미등록`인데 필터에는 안 걸리는 상품이 생긴다.
 */
export function postStatusKey(product: Product): PostStatusKey {
  return product.post?.status ?? "NONE";
}
