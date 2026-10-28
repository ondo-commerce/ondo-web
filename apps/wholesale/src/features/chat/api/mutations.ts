"use client";

import { useMutation } from "@tanstack/react-query";
import { apiFetch } from "@ondo/api";
import { CHAT_PATH } from "./queries";
import type { ChatReadResult } from "../types";

/**
 * `meta.sessionLoss: "inline"` — 401이어도 전역 핸들러가 `/login`으로 보내지 않는다
 * (`app/sessionLoss.ts`, #252). 채팅은 입력창이 늘 떠 있어서 전체 이동이 곧 쓰던 글을 버리는 것이다.
 * feature는 `app/`을 import할 수 없어 값을 다시 적는다 — 바꾸면 거기도 같이 바꾼다.
 */
const SESSION_LOSS_INLINE = { sessionLoss: "inline" } as const;

/**
 * 읽음. 서버가 `max(기존, 요청)`으로 저장하고 미확인 수를 같이 돌려준다 — 화면은 그 값을 그대로 쓴다.
 * 실패해도 아무것도 띄우지 않는다. 다음에 새 메시지를 그리면 더 큰 값으로 다시 보낸다.
 */
export function useMarkReadMutation(onRead: (result: ChatReadResult) => void) {
  return useMutation({
    mutationFn: ({
      roomId,
      lastReadSequence,
    }: {
      roomId: number;
      lastReadSequence: number;
    }) =>
      apiFetch<ChatReadResult>(CHAT_PATH.read(roomId), {
        method: "POST",
        body: { lastReadSequence },
      }),
    meta: SESSION_LOSS_INLINE,
    onSuccess: onRead,
  });
}
