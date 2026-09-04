"use client";

import { Suspense, useSyncExternalStore, type ReactNode } from "react";
import { ErrorBoundary } from "react-error-boundary";
import { QueryErrorResetBoundary } from "@tanstack/react-query";
import { Button, cn } from "@ondo/ui";
import { describeError } from "./describeError";

export interface QueryBoundaryProps {
  children: ReactNode;
  /** 기다리는 동안. 없으면 패널 크기의 회색 막대 세 줄 */
  fallback?: ReactNode;
  /**
   * `RESOURCE_NOT_FOUND`일 때. 없으면 기본 빈 상태 한 줄.
   *
   * 404는 실패가 아니라 "없다"는 답이다 — 목록에서 에러 패널을 띄우면 사장은
   * 서버가 고장 났다고 읽는다.
   */
  notFound?: ReactNode;
  className?: string;
}

/**
 * 서버 데이터를 그리는 자리를 감싸는 **유일한** 경계. `Suspense` + `ErrorBoundary`
 * + 쿼리 리셋을 한 번에 한다.
 *
 * 도매는 `Panel` 단위로 감싼다 — 화면 하나가 통째로 기다리거나 죽지 않고,
 * 실패한 패널만 그 자리에서 실패한다. 화면 전체를 감싸는 자리는 route의
 * `error.tsx`가 따로 맡는다.
 *
 * 안에서는 `useSuspenseQuery`만 쓴다. `useQuery`의 `isPending`·`isError`를
 * 화면에서 갈라 쓰기 시작하면 경계가 있는 의미가 없다.
 *
 * `UNAUTHENTICATED`는 여기 오지 않는다 — `providers.tsx`가 캐시 단계에서 잡아
 * `/login`으로 보낸다.
 */
export function QueryBoundary({
  children,
  fallback,
  notFound,
  className,
}: QueryBoundaryProps) {
  const mounted = useMounted();
  const pending = fallback ?? <QuerySkeleton className={className} />;

  // 서버 렌더에서는 쿼리를 시작하지 않는다. "use client"여도 첫 HTML은 서버가
  // 만드는데, 거기서 useSuspenseQuery가 돌면 apiFetch가 던지고 Next가 조용히
  // 클라이언트 렌더로 넘어간다(콘솔에 Recoverable Error). 도매는 SEO가 없으니
  // 첫 HTML은 스켈레톤이면 충분하다 — 데이터는 브라우저에서 한 번만 받는다.
  if (!mounted) {
    return pending;
  }

  return (
    <QueryErrorResetBoundary>
      {({ reset }) => (
        <ErrorBoundary
          onReset={reset}
          fallbackRender={({ error, resetErrorBoundary }) => (
            <QueryErrorFallback
              error={error}
              notFound={notFound}
              className={className}
              onRetry={resetErrorBoundary}
            />
          )}
        >
          <Suspense fallback={pending}>{children}</Suspense>
        </ErrorBoundary>
      )}
    </QueryErrorResetBoundary>
  );
}

/**
 * 하이드레이션이 끝났는가. 서버 스냅샷은 항상 false라 첫 클라이언트 렌더가
 * 서버 HTML과 같고(불일치 경고 없음), 그다음 렌더부터 true다.
 */
function useMounted(): boolean {
  return useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false,
  );
}

/**
 * 기본 대기 표시. 표·목록의 첫 줄들이 올 자리에 회색 막대를 둔다.
 *
 * 스피너를 쓰지 않는 이유: 어디가 채워질지 모양을 미리 보여 주면 도착했을 때
 * 화면이 덜 튄다. `role="status"`라 낭독기에 "불러오는 중"이 한 번 읽힌다.
 */
export function QuerySkeleton({ className }: { className?: string }) {
  return (
    <div
      role="status"
      aria-label="불러오는 중"
      className={cn("flex flex-col gap-3 py-2", className)}
    >
      <div className="bg-muted h-4 w-2/5 animate-pulse rounded-control" />
      <div className="bg-muted h-4 w-4/5 animate-pulse rounded-control" />
      <div className="bg-muted h-4 w-3/5 animate-pulse rounded-control" />
    </div>
  );
}

interface QueryErrorFallbackProps {
  error: unknown;
  notFound: ReactNode | undefined;
  className: string | undefined;
  onRetry: () => void;
}

function QueryErrorFallback({
  error,
  notFound,
  className,
  onRetry,
}: QueryErrorFallbackProps) {
  const described = describeError(error);

  if (described.kind === "notFound") {
    return (
      <div className={cn("py-12 text-center", className)}>
        {notFound ?? (
          <p className="text-muted-foreground text-sm">{described.title}</p>
        )}
      </div>
    );
  }

  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-center gap-3 py-12 text-center",
        className,
      )}
    >
      <div>
        <p className="text-sm font-medium">{described.title}</p>
        {described.detail ? (
          <p className="text-muted-foreground mt-1 text-xs">
            {described.detail}
          </p>
        ) : null}
      </div>
      {described.retryable ? (
        <Button type="button" variant="line" size="sm" onClick={onRetry}>
          다시 시도
        </Button>
      ) : null}
      {/* 문의할 때 서버 로그와 맞춰 볼 값. 사장이 읽을 글은 아니라 가장 작게 */}
      {described.traceId ? (
        <p className="text-muted-foreground text-xs">
          오류 번호 {described.traceId}
        </p>
      ) : null}
    </div>
  );
}
