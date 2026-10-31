"use client";

import { onlineManager } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { useSendMessageMutation } from "./api/mutations";
import { chatEpoch, useChatCache } from "./api/scope";
import { markSessionLost } from "./api/session";
import {
  insertSent,
  pendingOfRoom,
  sendFailureOf,
  upsertPending,
  withRoomPending,
} from "./derive";
import type { ChatThread, PendingByRoom, PendingMessage } from "./types";

/**
 * 채팅 화면 전체의 보내기(S4, loop-08b S3). 보류 말풍선(보내는 중, 실패)을 **방별로** 들고 있다.
 *
 * `ChatView`가 부른다 — 방 패널이 아니라. 방 패널은 `key={roomId}`라 방을 옮기면 다시 마운트되는데, 보류
 * 말풍선이 그 안에 있으면 실패한 말풍선이 같이 사라져 무엇을 다시 보내야 하는지 모른다(state-loss, §0 1).
 * 화면 수명 동안만 산다 — 업무 화면을 다녀오거나 새로고침하면 사라진다(Q7 ①, 알려진 한계).
 *
 * 보류 말풍선은 서버에 아직 없는 것이라 쿼리 캐시에 섞지 않는다. 서버 메시지와 합치는 건 그리는 쪽이
 * `visiblePending`으로 한다(응답 유실 뒤 polling이 먼저 가져온 경우, S4-6).
 *
 * 다른 방을 보는 사이 끝난 보내기는 **자기 방**에만 간다 — 결과 처리가 보낸 순간의 roomId를 쥐고 있다(S3-12).
 */
export function useChatOutbox() {
  const chat = useChatCache();
  const { mutateAsync } = useSendMessageMutation();
  const [byRoom, setByRoom] = useState<PendingByRoom>({});

  const update = useCallback(
    (
      roomId: number,
      change: (list: readonly PendingMessage[]) => PendingMessage[],
    ) => setByRoom((all) => withRoomPending(all, roomId, change)),
    [],
  );

  const deliver = useCallback(
    (roomId: number, item: PendingMessage) => {
      // 오프라인이면 요청을 만들지 않는다. 온라인이 돼도 저절로 보내지 않는다 — 사장이 다시 보내기를 누른다
      if (!onlineManager.isOnline()) {
        update(roomId, (list) =>
          upsertPending(list, {
            ...item,
            status: "failed",
            failure: "offline",
          }),
        );
        return;
      }
      update(roomId, (list) =>
        upsertPending(list, { ...item, status: "sending", failure: null }),
      );
      /* 보낸 순간의 계정 키와 로그아웃 세대(loop-08b M1). 응답 전에 로그아웃하고 다른 계정으로 들어왔으면
         결과를 버린다 — 지운 캐시에 A의 말풍선을 다시 넣거나 B의 화면에 끊김 표시를 남기지 않게 */
      const { queryClient, keys } = chat;
      const epoch = chatEpoch();
      mutateAsync({
        roomId,
        clientMessageId: item.clientMessageId,
        body: item.body,
      }).then(
        (result) => {
          if (chatEpoch() !== epoch) return;
          queryClient.setQueryData<ChatThread>(keys.thread(roomId), (thread) =>
            thread === undefined
              ? thread
              : insertSent(thread, [
                  result.message,
                  ...result.generatedMessages,
                ]),
          );
          update(roomId, (list) =>
            list.filter((p) => p.clientMessageId !== item.clientMessageId),
          );
          // 답 필요, 미리보기, 순서가 바뀐다
          void queryClient.invalidateQueries({ queryKey: keys.rooms() });
          void queryClient.invalidateQueries({
            queryKey: keys.room(roomId),
          });
        },
        (error: unknown) => {
          if (chatEpoch() !== epoch) return;
          const failure = sendFailureOf(error);
          // 401 — 채팅 세션 끊김 하나로(`api/session.ts`). polling 전부와 입력창이 같이 멈춘다
          if (failure === "session") markSessionLost(chat);
          update(roomId, (list) =>
            upsertPending(list, { ...item, status: "failed", failure }),
          );
        },
      );
    },
    [chat, mutateAsync, update],
  );

  /** 새 말풍선. 키는 여기서 한 번 만들고 다시 보내기까지 그대로 간다(S3-11) */
  const send = useCallback(
    (roomId: number, body: string) =>
      deliver(roomId, {
        clientMessageId: crypto.randomUUID(),
        body,
        status: "sending",
        failure: null,
      }),
    [deliver],
  );

  /** 서버엔 없던 것이라 화면에서만 뺀다 */
  const remove = useCallback(
    (roomId: number, clientMessageId: string) =>
      update(roomId, (list) =>
        list.filter((p) => p.clientMessageId !== clientMessageId),
      ),
    [update],
  );

  const pendingOf = useCallback(
    (roomId: number) => pendingOfRoom(byRoom, roomId),
    [byRoom],
  );

  return { pendingOf, send, retry: deliver, remove };
}

export type ChatOutbox = ReturnType<typeof useChatOutbox>;
