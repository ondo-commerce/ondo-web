import { AuthLayout } from "@/shared/components/AuthLayout";

/**
 * `(account)` 아래 화면이 서버에서 `/me`를 기다리는 동안. `(shop)/loading.tsx`와
 * 같은 결 — 스피너 대신 회색 막대로 카드 자리를 미리 잡아 도착했을 때 덜 튄다.
 *
 * 없으면 로그인·가입 직후 `router.replace("/approval")`로 넘어오는 사이 이전 폼이
 * 버튼 문구까지 되돌아온 채 그대로 서 있다(`/approval`·`/approval/rejected`는
 * `force-dynamic`). 폭은 wide — 실제로 기다리는 화면이 승인 둘뿐이다. 로그인·가입은
 * 정적이라 여길 거치지 않는다.
 */
export default function Loading() {
  return (
    <AuthLayout width="wide">
      <div
        role="status"
        aria-label="불러오는 중"
        className="flex flex-col gap-3"
      >
        <div className="bg-muted h-6 w-1/3 animate-pulse rounded-control" />
        <div className="bg-muted h-4 w-2/3 animate-pulse rounded-control" />
        <div className="bg-muted h-40 animate-pulse rounded-panel" />
      </div>
    </AuthLayout>
  );
}
