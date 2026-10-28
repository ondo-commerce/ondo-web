"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { chatKeys } from "./api/keys";
import { useSendMessageMutation } from "./api/mutations";
import { insertSent, sendFailureOf, upsertPending } from "./derive";
import type { ChatThread, PendingMessage } from "./types";

/**
 * 방 하나의 보내기. 보류 말풍선 목록과 보내기, 다시 보내기, 지우기를 준다. 도매 `useChatSend`와 짝이다.
 *
 * 보류 말풍선은 이 훅의 state다 — 서버에 아직 없는 것이라 쿼리 캐시에 섞지 않는다. 서버 메시지와
 * 합치는 건 그리는 쪽이 `visiblePending`으로 한다(응답 유실 뒤 polling이 먼저 가져온 경우, S6-4).
 */
export function useChatSend(roomId: number) {
  const queryClient = useQueryClient();
  const { mutateAsync } = useSendMessageMutation(roomId);
  const [pending, setPending] = useState<PendingMessage[]>([]);

  const deliver = useCallback(
    (item: PendingMessage) => {
      setPending((list) =>
        upsertPending(list, { ...item, status: "sending", failure: null }),
      );
      mutateAsync({
        clientMessageId: item.clientMessageId,
        body: item.body,
      }).then(
        (result) => {
          queryClient.setQueryData<ChatThread>(
            chatKeys.thread(roomId),
            (thread) =>
              thread === undefined
                ? thread
                : insertSent(thread, [
                    result.message,
                    ...result.generatedMessages,
                  ]),
          );
          setPending((list) =>
            list.filter((p) => p.clientMessageId !== item.clientMessageId),
          );
        },
        (error: unknown) => {
          setPending((list) =>
            upsertPending(list, {
              ...item,
              status: "failed",
              failure: sendFailureOf(error),
            }),
          );
        },
      );
    },
    [mutateAsync, queryClient, roomId],
  );

  /** 새 말풍선. 키는 여기서 한 번 만들고 다시 보내기까지 그대로 간다 */
  const send = useCallback(
    (body: string) =>
      deliver({
        clientMessageId: crypto.randomUUID(),
        body,
        status: "sending",
        failure: null,
      }),
    [deliver],
  );

  /** 서버엔 없던 것이라 화면에서만 뺀다 */
  const remove = useCallback(
    (clientMessageId: string) =>
      setPending((list) =>
        list.filter((p) => p.clientMessageId !== clientMessageId),
      ),
    [],
  );

  return { pending, send, retry: deliver, remove };
}
