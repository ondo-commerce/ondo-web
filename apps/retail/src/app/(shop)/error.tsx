"use client";

import { Button } from "@ondo/ui";

/**
 * `(shop)` 아래 서버 컴포넌트가 던진 것을 받는 마지막 자리.
 *
 * **코드별로 갈라 그리지 않는다.** 프로덕션에서 서버 컴포넌트의 에러는 Next가
 * `message`·필드를 지우고 `digest`만 남겨 보낸다 — `ApiError.code`가 여기까지
 * 오지 않는다. 그래서 갈라야 하는 것(401 → `/login`, 404 → `notFound()`)은
 * 레이아웃·페이지가 던지기 전에 처리하고, 여기 오는 건 "서버가 아프다" 하나다.
 *
 * `reset`은 이 세그먼트를 다시 렌더한다 — 서버 fetch가 다시 나간다.
 */
export default function ShopError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div
      role="alert"
      className="mx-auto flex w-full max-w-6xl flex-col items-center gap-3 px-4 py-16 text-center"
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
      {/* 문의할 때 서버 로그와 맞춰 볼 값. 사장이 읽을 글은 아니라 가장 작게 */}
      {error.digest ? (
        <p className="text-muted-foreground text-xs">
          오류 번호 {error.digest}
        </p>
      ) : null}
    </div>
  );
}
