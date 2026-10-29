"use client";

import { onlineManager, useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { chatKeys } from "./api/keys";
import { useSendMessageMutation } from "./api/mutations";
import { isChatSessionLostError } from "./api/session";
import { insertSent, sendFailureOf, upsertPending } from "./derive";
import type { ChatInquiry, ChatThread, PendingMessage } from "./types";

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
      // 오프라인이면 요청을 만들지 않는다. 온라인이 돼도 저절로 보내지 않는다 — 사장이 다시 보내기를 누른다(S6-6)
      if (!onlineManager.isOnline()) {
        setPending((list) =>
          upsertPending(list, {
            ...item,
            status: "failed",
            failure: "offline",
          }),
        );
        return;
      }
      setPending((list) =>
        upsertPending(list, { ...item, status: "sending", failure: null }),
      );
      mutateAsync({
        clientMessageId: item.clientMessageId,
        body: item.body,
        inquiry: item.inquiry,
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
          /* 401은 `guardSession`이 이미 채팅 세션 끊김으로 표시했다 — polling과 입력창이 같이 멈춘다(S6-5).
             말풍선은 `지우기`만 남는다 */
          const failure = isChatSessionLostError(error)
            ? "session"
            : sendFailureOf(error);
          setPending((list) =>
            upsertPending(list, { ...item, status: "failed", failure }),
          );
        },
      );
    },
    [mutateAsync, queryClient, roomId],
  );

  /**
   * 새 말풍선. 키는 여기서 한 번 만들고 다시 보내기까지 그대로 간다. `inquiry`는 칩(`재고 문의`, 되묻기 보기)만
   * 채운다 — 말풍선에 같이 실어 두어 다시 보내기가 같은 `{body, inquiry}`를 보낸다(S8-15)
   */
  const send = useCallback(
    (body: string, inquiry: ChatInquiry | null = null) =>
      deliver({
        clientMessageId: crypto.randomUUID(),
        body,
        inquiry,
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
