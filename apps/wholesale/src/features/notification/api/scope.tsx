"use client";

import type { QueryClient } from "@tanstack/react-query";
import { createContext, useContext, useMemo, type ReactNode } from "react";
import {
  NOTIFICATION_KEY_ROOT,
  notificationKeysFor,
  type NotificationKeys,
} from "./keys";
import { HEADER_COUNTS_KEY } from "@/shared/api/headerCountsKey";

/** 헤더가 보는 계정의 키. `HeaderInbox`가 연다 */
const NotificationKeysContext = createContext<NotificationKeys | null>(null);

export function NotificationAccountScope({
  account,
  children,
}: {
  /** 로그인 이메일(소문자). 판정 전이면 빈 문자열 */
  account: string;
  children: ReactNode;
}) {
  const keys = useMemo(() => notificationKeysFor(account), [account]);
  return (
    <NotificationKeysContext value={keys}>{children}</NotificationKeysContext>
  );
}

export function useNotificationKeys(): NotificationKeys {
  const keys = useContext(NotificationKeysContext);
  if (keys === null)
    throw new Error("알림 훅은 NotificationAccountScope 안에서만 쓴다");
  return keys;
}

/**
 * 로그아웃 때 헤더 count와 알림 목록 캐시를 전부(계정 무관) 버린다. 날아가는 요청은 취소해 응답을 버린다.
 * 부르는 곳은 `app/SignOutCleanup.tsx`다(feature끼리 import 금지)
 */
export function clearNotificationCache(queryClient: QueryClient): void {
  for (const queryKey of [HEADER_COUNTS_KEY, NOTIFICATION_KEY_ROOT]) {
    void queryClient.cancelQueries({ queryKey });
    queryClient.removeQueries({ queryKey });
  }
}
