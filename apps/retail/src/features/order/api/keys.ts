/**
 * 주문 feature의 key 팩토리. 문자열 키를 흩뿌리지 않는다.
 *
 * 소매 주문에는 **클라이언트 쿼리가 없다** — 주문서·내역·상세·완료는 Server
 * Component가 `serverApi()`로 받고, 쓰기가 끝나면 `router.refresh()`·`router.replace()`가
 * 다시 그린다. 그래서 여기 있는 것은 전부 `mutationKey`다. 화면이
 * `useIsMutating({ mutationKey })`로 "지금 보내는 중인가"를 읽어 되돌릴 수 없는
 * 버튼(`주문 접수하기` · `취소 확정`)을 잠근다 — 연타로 두 번 나가지 않게.
 */
export const orderKeys = {
  all: ["order"] as const,
  place: () => [...orderKeys.all, "place"] as const,
  cancel: () => [...orderKeys.all, "cancel"] as const,
};
