"use client";

import { useMutation } from "@tanstack/react-query";
import { apiFetch } from "@ondo/api";
import { chatMockReady } from "./mockWorker";
import { CHAT_PATH } from "./queries";
import type {
  ChatRoomDetail,
  ChatSendResult,
  CreateChatRoomRequest,
} from "../types";

/**
 * 방 만들기(멱등). 이미 있으면 200, 없으면 201 — 화면은 둘을 똑같이 다룬다(Q3, 확인 창 없음).
 * 목 모드면 worker 준비를 먼저 기다린다(S5-12). 401은 공용 처리(`providers.tsx`)가 `/login`으로 보낸다 —
 * 이 단계엔 쓴 글이 없다(01-plan §4-1 2).
 */
export function useCreateRoomMutation() {
  return useMutation({
    mutationFn: async (body: CreateChatRoomRequest) => {
      await chatMockReady();
      return apiFetch<ChatRoomDetail>(CHAT_PATH.rooms, {
        method: "POST",
        body,
      });
    },
  });
}

/**
 * 보내기. `clientMessageId`가 곧 `Idempotency-Key`다 — 다시 보내기는 같은 키라 서버가 한 번만 만든다.
 * 본문은 `{body, inquiry: null}` — 상품 문맥은 방 만들 때 `listingId`로만 간다(05b 분류기 몫, §3 out 3).
 *
 * 결과 처리는 호출마다 `mutateAsync`의 promise로 받는다. 말풍선 여러 개가 동시에 날아갈 수 있는데,
 * `mutate(vars, { onSuccess })`의 콜백은 마지막 호출 것만 불린다.
 */
export function useSendMessageMutation(roomId: number) {
  return useMutation({
    mutationFn: async ({
      clientMessageId,
      body,
    }: {
      clientMessageId: string;
      body: string;
    }) => {
      await chatMockReady();
      return apiFetch<ChatSendResult>(CHAT_PATH.messages(roomId), {
        method: "POST",
        body: { body, inquiry: null },
        idempotencyKey: clientMessageId,
      });
    },
  });
}
