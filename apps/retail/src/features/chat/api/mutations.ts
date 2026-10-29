"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@ondo/api";
import { chatMockReady } from "./mockWorker";
import { CHAT_PATH } from "./queries";
import { guardSession } from "./session";
import type {
  ChatInquiry,
  ChatRoomDetail,
  ChatSendResult,
  CreateChatRoomRequest,
} from "../types";

/**
 * 방 만들기(멱등). 이미 있으면 200, 없으면 201 — 화면은 둘을 똑같이 다룬다(Q3, 확인 창 없음).
 * 목 모드면 worker 준비를 먼저 기다린다(S5-12). `guardSession`을 **거치지 않는다** — 401은 공용 처리
 * (`providers.tsx`)가 `/login`으로 보낸다. 이 단계엔 쓴 글이 없다(01-plan §4-1 2).
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
 * 본문은 `{body, inquiry}`. 자유 문장이면 `inquiry`는 null이고, `재고 문의` 칩과 되묻기 칩만 채운다(loop-05b §4-1 2).
 * 다시 보내기도 보류 말풍선이 들고 있던 같은 `inquiry`를 보낸다 — 키가 같은데 본문이 다르면 서버가 409를 낸다.
 *
 * `guardSession`을 거친다: 소매 공용 MutationCache가 `UNAUTHORIZED` ApiError를 `/login` 전체 이동으로
 * 바꾸는데, 보내기 401에서 그러면 쓰던 글과 실패 말풍선이 사라진다(D28). 끊김 오류로 바꿔 지나가게 한다.
 *
 * `networkMode: "always"`: 기본(online)이면 오프라인일 때 요청이 **멈춰 있다가 온라인이 되면 저절로
 * 나간다.** 자동 재전송은 하지 않는다(S6-6) — 사장이 모르는 사이 말이 나가면 안 된다. 오프라인 판정은
 * 부르는 쪽(`useChatSend`)이 먼저 한다.
 *
 * 결과 처리는 호출마다 `mutateAsync`의 promise로 받는다. 말풍선 여러 개가 동시에 날아갈 수 있는데,
 * `mutate(vars, { onSuccess })`의 콜백은 마지막 호출 것만 불린다.
 */
export function useSendMessageMutation(roomId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      clientMessageId,
      body,
      inquiry,
    }: {
      clientMessageId: string;
      body: string;
      inquiry: ChatInquiry | null;
    }) => {
      await chatMockReady();
      return guardSession(queryClient, () =>
        apiFetch<ChatSendResult>(CHAT_PATH.messages(roomId), {
          method: "POST",
          body: { body, inquiry },
          idempotencyKey: clientMessageId,
        }),
      );
    },
    networkMode: "always",
  });
}
