/**
 * 목록 feature의 queryKey 팩토리. 문자열 키를 흩뿌리지 않는다.
 *
 * 홈·도매처 홈·검색은 Server Component가 받으므로 클라이언트 쿼리가 없다.
 * 여기 있는 것은 **찜 목록**뿐이다 — 찜 집합이 브라우저 세션에만 있어 서버가
 * 무엇을 받아야 하는지 모르고, 그래서 그 화면만 브라우저가 상세를 하나씩 부른다.
 */
export const catalogKeys = {
  all: ["catalog"] as const,
  listing: (listingId: number) =>
    [...catalogKeys.all, "listing", listingId] as const,
};
