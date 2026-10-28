"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@ondo/api";
import { CHAT_PATH } from "./queries";
import { guardSession } from "./session";
import type { ChatReadResult } from "../types";

/**
 * `meta.sessionLoss: "inline"` — 401이어도 전역 핸들러가 `/login`으로 보내지 않는다
 * (`app/sessionLoss.ts`, #252). 채팅은 입력창이 늘 떠 있어서 전체 이동이 곧 쓰던 글을 버리는 것이다.
 * feature는 `app/`을 import할 수 없어 값을 다시 적는다 — 바꾸면 거기도 같이 바꾼다.
 * 401 자체는 `guardSession`이 채팅 세션 끊김으로 바꿔 던지므로 이 표시는 이중 안전장치다.
 */
const SESSION_LOSS_INLINE = { sessionLoss: "inline" } as const;

/**
 * 읽음. 서버가 `max(기존, 요청)`으로 저장하고 미확인 수를 같이 돌려준다 — 화면은 그 값을 그대로 쓴다.
 * 실패해도 아무것도 띄우지 않는다. 언제 다시 보낼지는 부르는 쪽이 정한다(리뷰 F2) — 그래서
 * 호출마다 결과를 받는 `mutateAsync`를 쓴다.
 */
export function useMarkReadMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      roomId,
      lastReadSequence,
    }: {
      roomId: number;
      lastReadSequence: number;
    }) =>
      guardSession(queryClient, () =>
        apiFetch<ChatReadResult>(CHAT_PATH.read(roomId), {
          method: "POST",
          body: { lastReadSequence },
        }),
      ),
    meta: SESSION_LOSS_INLINE,
  });
}
