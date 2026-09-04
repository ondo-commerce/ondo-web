/**
 * `(shop)` 아래 화면이 서버에서 데이터를 기다리는 동안. 셸(헤더·카테고리 바)은
 * 레이아웃이 이미 그렸고 본문 자리만 이걸로 채운다.
 *
 * 스피너 대신 회색 막대인 이유: 어디가 채워질지 모양을 미리 보여 주면 도착했을 때
 * 화면이 덜 튄다. `role="status"`라 낭독기에 "불러오는 중"이 한 번 읽힌다.
 */
export default function Loading() {
  return (
    <div
      role="status"
      aria-label="불러오는 중"
      className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-4 py-8"
    >
      <div className="bg-muted h-6 w-1/3 animate-pulse rounded-control" />
      <div className="bg-muted h-4 w-2/3 animate-pulse rounded-control" />
      <div className="bg-muted h-40 animate-pulse rounded-panel" />
    </div>
  );
}
