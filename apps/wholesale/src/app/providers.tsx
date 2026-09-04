"use client";

import { useEffect, useState } from "react";
import {
  MutationCache,
  QueryCache,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import { isApiError } from "@ondo/api";
import { WHOLESALE_ERROR_CODE } from "@/shared/api/errorCodes";

/**
 * 세션이 끊긴 걸 알아채는 유일한 지점.
 *
 * `apiFetch`가 아니라 여기서 처리한다 — 래퍼가 화면 이동까지 하면 테스트도 재사용도
 * 어려워진다. 래퍼는 던지고, 무엇을 할지는 앱이 정한다.
 *
 * 전체 새로고침으로 보내는 이유는 남아 있는 캐시·상태를 한 번에 버리기 위해서다.
 */
function handleSessionLoss(error: unknown): void {
  if (
    !isApiError(error) ||
    error.code !== WHOLESALE_ERROR_CODE.UNAUTHENTICATED
  ) {
    return;
  }
  if (window.location.pathname === "/login") {
    return;
  }
  window.location.assign("/login");
}

/**
 * `NEXT_PUBLIC_API_MOCK=1`이면 MSW worker가 뜬 **뒤에** 화면을 그린다.
 *
 * 순서가 전부다. worker보다 첫 쿼리가 먼저 나가면 그 요청은 목이 아니라 실서버로
 * 새어 나가고, 화면은 절반은 목 절반은 실서버를 본다. 그래서 준비 전엔 아무것도 안 그린다.
 *
 * 동적 import인 이유: msw와 스냅샷 JSON이 프로덕션 번들에 실리면 안 된다.
 * `NEXT_PUBLIC_*`은 빌드 때 문자열로 박히므로 스위치가 꺼진 번들에서 이 가지는 사라진다.
 * 실서버 연동 뒤에도 지우지 않는다(ADR-0002) — BE가 아플 때 화면 작업이 멈추지 않게.
 */
const MOCK_ENABLED = process.env.NEXT_PUBLIC_API_MOCK === "1";

function MockGate({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(!MOCK_ENABLED);

  useEffect(() => {
    if (!MOCK_ENABLED) return;
    let cancelled = false;
    void import("@ondo/api/mocks/browser")
      .then((mocks) => mocks.startMockWorker())
      .then(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return ready ? children : null;
}

export function Providers({ children }: { children: React.ReactNode }) {
  // 렌더마다 새 클라이언트를 만들면 캐시가 매번 비워진다. 한 번만 만든다.
  const [queryClient] = useState(
    () =>
      new QueryClient({
        queryCache: new QueryCache({ onError: handleSessionLoss }),
        mutationCache: new MutationCache({ onError: handleSessionLoss }),
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            // 어드민은 탭을 계속 열어 두고 쓴다. 창을 옮길 때마다 전부 다시 부르면 시끄럽다
            refetchOnWindowFocus: false,
            retry: (failureCount, error) => {
              // 4xx는 다시 보내도 같은 답이 온다. 401·403·404를 세 번 부를 이유가 없다
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
          mutations: {
            // 재시도가 필요한 뮤테이션은 멱등키를 쥔 호출부가 직접 정한다
            retry: false,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <MockGate>{children}</MockGate>
    </QueryClientProvider>
  );
}
