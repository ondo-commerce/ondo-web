"use client";

import { onlineManager, useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { chatKeys } from "./api/keys";
import { useSendMessageMutation } from "./api/mutations";
import { markSessionLost } from "./api/session";
import { insertSent, sendFailureOf, upsertPending } from "./derive";
import type { ChatThread, PendingMessage } from "./types";

/**
 * 방 하나의 보내기(S4). 보류 말풍선 목록과 보내기, 다시 보내기, 지우기를 준다.
 *
 * 보류 말풍선은 이 훅의 state다 — 서버에 아직 없는 것이라 쿼리 캐시에 섞지 않는다. 서버 메시지와
 * 합치는 건 그리는 쪽이 `visiblePending`으로 한다(응답 유실 뒤 polling이 먼저 가져온 경우, S4-6).
 *
 * 방을 옮기면 사라진다(부르는 쪽이 `key={roomId}`로 다시 마운트). 방별 입력 기억과 같이 loop-08.
 */
export function useChatSend(roomId: number) {
  const queryClient = useQueryClient();
  const { mutateAsync } = useSendMessageMutation(roomId);
  const [pending, setPending] = useState<PendingMessage[]>([]);

  const deliver = useCallback(
    (item: PendingMessage) => {
      // 오프라인이면 요청을 만들지 않는다. 온라인이 돼도 저절로 보내지 않는다 — 사장이 다시 보내기를 누른다
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
      const threadKey = chatKeys.thread(roomId);
      mutateAsync({
        clientMessageId: item.clientMessageId,
        body: item.body,
      }).then(
        (result) => {
          queryClient.setQueryData<ChatThread>(threadKey, (thread) =>
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
          // 답 필요, 미리보기, 순서가 바뀐다
          void queryClient.invalidateQueries({ queryKey: chatKeys.rooms() });
          void queryClient.invalidateQueries({
            queryKey: chatKeys.room(roomId),
          });
        },
        (error: unknown) => {
          const failure = sendFailureOf(error);
          // 401 — 채팅 세션 끊김 하나로(`api/session.ts`). polling 전부와 입력창이 같이 멈춘다
          if (failure === "session") markSessionLost(queryClient);
          setPending((list) =>
            upsertPending(list, { ...item, status: "failed", failure }),
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
