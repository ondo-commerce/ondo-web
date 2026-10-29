"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@ondo/api";
import { chatKeys } from "./keys";
import { guardSession } from "./session";
import type { AutoReplySettings } from "../types";

/** 초안 op `autoReplySettings` / `updateAutoReplySettings`(#266). GET, PUT이 같은 경로다 */
const SETTINGS_PATH = "/api/wholesale/chat/auto-reply-settings";

/** `mutations.ts`와 같은 이유(전체 `/login` 이동 대신 채팅 세션 끊김) */
const SESSION_LOSS_INLINE = { sessionLoss: "inline" } as const;

/**
 * 자동 답 설정. `/chats`에 들어올 때마다(목록 패널 마운트) **1회** 받는다(S9-1).
 *
 * 진입 때는 캐시가 있어도 다시 받는다(`refetchOnMount: "always"`). 다른 기기에서 바꾼 값을 옛 캐시로
 * 보여 주면, 스위치를 누를 때 `toggledSettings`가 옛 intents로 서버 값을 덮어쓴다(리뷰 R1).
 * `"always"`는 이 훅을 새로 부르는 컴포넌트가 마운트될 때마다 받는다. 그래서 목록 패널 한 곳에서만 부른다 —
 * 방을 바꿔도 패널은 다시 마운트되지 않아 한 진입에 1회 그대로다.
 * 화면 안에서는 다시 받지 않는다: 설정은 이 화면의 스위치로만 바뀌고 PUT 응답이 곧 새 값이다(캐시에 그대로
 * 넣는다). 그래서 창 포커스, 재연결 재요청은 끄고 `staleTime: Infinity`로 둔다.
 * 실패해도 다시 묻지 않는다(`retry: false`) — 스위치 자리가 비고 대화는 그대로 쓴다.
 */
export function useAutoReplySettingsQuery() {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: chatKeys.autoReplySettings(),
    queryFn: () =>
      guardSession(queryClient, () =>
        apiFetch<AutoReplySettings>(SETTINGS_PATH),
      ),
    staleTime: Infinity,
    refetchOnMount: "always",
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: false,
    meta: SESSION_LOSS_INLINE,
  });
}

/**
 * 설정 바꾸기. 본문은 통째로(`{enabled, intents}`, 계약). 성공하면 응답을 캐시에 넣는다 — 스위치 손잡이는
 * **이때** 움직인다(낙관 반영 없음, 디자인 결정 23). 실패하면 캐시를 건드리지 않으니 원래 값 그대로다.
 * 401은 `guardSession`이 채팅 세션 끊김으로 바꾼다(쓰던 답 글, 주소 그대로, S9-4).
 */
export function useUpdateAutoReplySettingsMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (settings: AutoReplySettings) =>
      guardSession(queryClient, () =>
        apiFetch<AutoReplySettings>(SETTINGS_PATH, {
          method: "PUT",
          body: settings,
        }),
      ),
    onSuccess: (saved) => {
      queryClient.setQueryData(chatKeys.autoReplySettings(), saved);
    },
    meta: SESSION_LOSS_INLINE,
  });
}
