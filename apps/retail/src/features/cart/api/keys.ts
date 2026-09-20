/**
 * 장바구니 feature의 key 팩토리. 문자열 키를 흩뿌리지 않는다.
 *
 * 소매 장바구니에는 **클라이언트 쿼리가 없다** — 목록·뱃지는 Server Component가
 * 받고, 쓰기가 끝나면 `router.refresh()`가 그 둘을 다시 그린다. 그래서 여기 있는
 * 것은 전부 `mutationKey`다. 화면이 `useIsMutating({ mutationKey: cartKeys.all })`로
 * "지금 장바구니를 바꾸는 중인가"를 읽어 `선택 삭제`·`되돌리기`를 잠근다 —
 * 되돌릴 수 없는 실행이 두 번 겹쳐 나가지 않게.
 */
export const cartKeys = {
  all: ["cart"] as const,
  qty: () => [...cartKeys.all, "qty"] as const,
  remove: () => [...cartKeys.all, "remove"] as const,
  add: () => [...cartKeys.all, "add"] as const,
};
