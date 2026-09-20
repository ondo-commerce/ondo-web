"use client";

import {
  createContext,
  Suspense,
  useContext,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { ErrorBoundary } from "react-error-boundary";
import {
  QueryErrorResetBoundary,
  useQueryErrorResetBoundary,
} from "@tanstack/react-query";
import { Button, cn } from "@ondo/ui";
import { describeError, type ErrorDescription } from "./describeError";

/** `errorFallback`이 받는 것. 기본 표면을 그대로 쓰려면 `QueryErrorView`에 넘기면 된다 */
export interface QueryErrorContext {
  error: unknown;
  described: ErrorDescription;
  /** 이 경계를 리셋하고 다시 받는다. 그룹 안이면 그룹의 실패한 경계 전부가 같이 리셋된다 */
  retry: () => void;
}

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
  /**
   * 실패했을 때 그릴 표면(404 제외 — 그건 `notFound`가 받는다). 없으면 기본 에러 블록.
   *
   * 있어야 하는 자리 둘: **실패해도 자리는 남아야 하는 것**(칩 줄 — 건수를 못 받았다고
   * 필터를 못 눌러선 안 된다, wire-order F4)과 **`Panel`이 경계 안에 있는 것**(포장 대기열처럼
   * 비면 카드를 안 그리는 자리 — 에러 블록이 패널 밖 맨 바닥에 그려진다, wire-order F5·#159).
   * `fallback`은 Suspense용이라 실패에는 안 걸린다 — 그래서 슬롯이 따로 있다.
   */
  errorFallback?: (ctx: QueryErrorContext) => ReactNode;
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
 *
 * `QueryBoundaryGroup` 안에 있으면 리셋을 그룹과 나눈다(아래) — 같은 쿼리를 보는
 * 경계가 여럿일 때 `다시 시도` 한 번으로 전부 복구되게.
 */
export function QueryBoundary({
  children,
  fallback,
  notFound,
  errorFallback,
  className,
}: QueryBoundaryProps) {
  const mounted = useMounted();
  const group = useContext(GroupContext);
  const pending = fallback ?? <QuerySkeleton className={className} />;

  // 서버 렌더에서는 쿼리를 시작하지 않는다. "use client"여도 첫 HTML은 서버가
  // 만드는데, 거기서 useSuspenseQuery가 돌면 apiFetch가 던지고 Next가 조용히
  // 클라이언트 렌더로 넘어간다(콘솔에 Recoverable Error). 도매는 SEO가 없으니
  // 첫 HTML은 스켈레톤이면 충분하다 — 데이터는 브라우저에서 한 번만 받는다.
  if (!mounted) {
    return pending;
  }

  const boundary = (onReset: (() => void) | undefined) => (
    <ErrorBoundary
      onReset={onReset}
      /* 그룹의 재시도 횟수가 바뀌면 실패 중인 경계만 리셋된다(react-error-boundary는
         `didCatch`인 경계에서만 resetKeys를 본다). 멀쩡한 패널은 건드리지 않는다 */
      resetKeys={group ? [group.generation] : undefined}
      fallbackRender={({ error, resetErrorBoundary }) => {
        const described = describeError(error);
        const retry = group ? group.retry : resetErrorBoundary;

        if (described.kind === "notFound") {
          return (
            <div className={cn("py-12 text-center", className)}>
              {notFound ?? (
                <p className="text-muted-foreground text-sm">
                  {described.title}
                </p>
              )}
            </div>
          );
        }
        if (errorFallback) {
          return errorFallback({ error, described, retry });
        }
        return (
          <QueryErrorView
            described={described}
            onRetry={retry}
            className={className}
          />
        );
      }}
    >
      <Suspense fallback={pending}>{children}</Suspense>
    </ErrorBoundary>
  );

  // 그룹 안이면 리셋 컨텍스트를 새로 만들지 않는다 — 안의 useSuspenseQuery가 그룹 것을
  // 봐야 그룹의 reset()으로 `retryOnMount`가 살아나 다시 받는다. 리셋은 그룹이 이미 했다
  if (group) {
    return boundary(undefined);
  }

  return (
    <QueryErrorResetBoundary>
      {({ reset }) => boundary(reset)}
    </QueryErrorResetBoundary>
  );
}

/* ------------------------------------------------------------------------
 * 경계 그룹 — 같은 쿼리를 보는 경계들의 재시도를 하나로
 * ------------------------------------------------------------------------ */

interface BoundaryGroup {
  /** 재시도 횟수. 그룹 안 경계들의 `resetKeys`가 된다 */
  generation: number;
  /** 쿼리 리셋 + 실패 중인 경계 전부 리셋 */
  retry: () => void;
}

const GroupContext = createContext<BoundaryGroup | null>(null);

/**
 * 뷰 하나의 경계들이 **재시도를 나눠 쓰는** 범위. 뷰 컴포넌트가 화면 전체를 한 번 감싼다.
 *
 * 왜 필요한가: 펼친 행과 우측 카드처럼 **같은 queryKey**를 다른 자리에서 보는 경계가 있다.
 * 경계마다 리셋이 따로면 실패했을 때 `다시 시도`가 둘·셋 뜨고, 하나를 눌러 성공해도 나머지는
 * 에러로 남아 한 번 더 눌러야 한다 — 두 번째는 요청도 없이 캐시로 채워지는 헛클릭이다
 * (wire-order F6 · wire-backorder F3 · wire-shipment F4, #197).
 *
 * 경계를 하나로 합치지 않는 이유: 그 둘은 표 안과 우측 패널이라 한 서브트리에 못 넣고,
 * 합치면 "한 패널이 죽어도 다른 패널은 산다"는 `QueryBoundary`의 원칙이 깨진다.
 * 그룹은 **실패한 경계만** 같이 리셋하고 멀쩡한 패널은 그대로 둔다.
 *
 * 다른 키를 보는 경계가 같이 리셋되는 건 감수한다 — 어차피 사장이 누른 건 `다시 시도`다.
 */
export function QueryBoundaryGroup({ children }: { children: ReactNode }) {
  return (
    <QueryErrorResetBoundary>
      <GroupProvider>{children}</GroupProvider>
    </QueryErrorResetBoundary>
  );
}

function GroupProvider({ children }: { children: ReactNode }) {
  const { reset } = useQueryErrorResetBoundary();
  const [generation, setGeneration] = useState(0);
  const value = useMemo<BoundaryGroup>(
    () => ({
      generation,
      retry: () => {
        reset();
        setGeneration((g) => g + 1);
      },
    }),
    [generation, reset],
  );
  return (
    <GroupContext.Provider value={value}>{children}</GroupContext.Provider>
  );
}

/**
 * 경계 밖에서 그룹의 재시도를 부를 때. 칩 건수처럼 경계 없이(`useQueries`) 받는 자리가
 * 같은 키를 보는 표 경계까지 살리려면 이걸 같이 부른다(wire-shipment F4). 그룹 밖이면 null.
 */
export function useQueryBoundaryGroupRetry(): (() => void) | null {
  return useContext(GroupContext)?.retry ?? null;
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

/**
 * 기본 에러 표면. `errorFallback`에서 `Panel`이나 제목으로 감싸 다시 쓸 수 있게 내보낸다 —
 * 표면을 자리마다 새로 그리면 문구·버튼·오류 번호가 화면마다 달라진다.
 */
export function QueryErrorView({
  described,
  onRetry,
  className,
}: {
  described: ErrorDescription;
  onRetry: () => void;
  className?: string;
}) {
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
