"use client";

import { Button } from "@ondo/ui";
import { AuthLayout } from "@/shared/components/AuthLayout";

/**
 * `(account)` 아래 서버 컴포넌트(승인 두 화면의 `/me`)가 던진 것을 받는 자리.
 *
 * 401은 여기 오지 않는다 — `requireSession`이 던지기 전에 `/login`으로 보낸다.
 * 여기 오는 건 "서버가 아프다" 하나다. 프로덕션에선 Next가 `message`를 지우고
 * `digest`만 남기므로 코드별로 갈라 그리지 않는다(`(shop)/error.tsx`와 같은 이유).
 *
 * `reset`은 이 세그먼트를 다시 렌더한다 — `/me`가 다시 나간다.
 */
export default function AccountError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <AuthLayout>
      <div
        role="alert"
        className="flex flex-col items-center gap-3 text-center"
      >
        <div>
          <p className="text-sm font-medium">지금 화면을 불러올 수 없어요</p>
          <p className="text-muted-foreground mt-1 text-xs">
            잠시 뒤 다시 시도해 주세요. 계속되면 운영자에게 알려 주세요.
          </p>
        </div>
        <Button type="button" variant="line" size="sm" onClick={reset}>
          다시 시도
        </Button>
        {error.digest ? (
          <p className="text-muted-foreground text-xs">
            오류 번호 {error.digest}
          </p>
        ) : null}
      </div>
    </AuthLayout>
  );
}
