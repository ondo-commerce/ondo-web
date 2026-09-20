"use client";

import { useState } from "react";
import {
  MutationCache,
  QueryCache,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import { isApiError } from "@ondo/api";
import { RETAIL_ERROR_CODE } from "@/shared/api/errorCodes";

/**
 * 브라우저에서 세션이 끊긴 걸 알아채는 유일한 지점. 서버 쪽은
 * `shared/api/server.ts`의 `requireSession`이 같은 일을 한다.
 *
 * 전체 새로고침으로 보내는 이유는 남아 있는 캐시·상태를 한 번에 버리기 위해서다.
 */
function handleSessionLoss(error: unknown): void {
  if (!isApiError(error) || error.code !== RETAIL_ERROR_CODE.UNAUTHORIZED) {
    return;
  }
  if (window.location.pathname === "/login") {
    return;
  }
  window.location.assign("/login");
}

/**
 * 소매는 목록·상세를 서버 컴포넌트가 그린다(ADR-0003). Query는 **그 다음 상호작용**
 * — 장바구니 담기, 로그인, 주문 취소 — 이 쓴다. 그래서 도매보다 얇다.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        queryCache: new QueryCache({ onError: handleSessionLoss }),
        mutationCache: new MutationCache({ onError: handleSessionLoss }),
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            retry: (failureCount, error) => {
              // 4xx는 다시 보내도 같은 답이 온다
              if (
                isApiError(error) &&
                error.status >= 400 &&
                error.status < 500
              ) {
                return false;
              }
              return failureCount < 2;
            },
          },
          mutations: { retry: false },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
