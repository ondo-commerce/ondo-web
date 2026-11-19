"use client";

import { onlineManager, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import { chatKeys } from "./api/keys";
import { useSendMessageMutation } from "./api/mutations";
import {
  chatAccountEpoch,
  isChatLeaving,
  sendOutcomeOf,
  subscribeChatLeaving,
  useChatLeaving,
} from "./api/session";
import {
  insertSent,
  pendingOfRoom,
  upsertPending,
  withRoomPending,
} from "./derive";
import type {
  ChatInquiry,
  ChatThread,
  PendingByRoom,
  PendingMessage,
} from "./types";

/**
 * `(shop)` 셸 수명의 보내기(loop-08e §4-2 7 8, Q5 ①). 보류 말풍선(보내는 중, 실패)을 **방별로** 든다. 도매
 * `useChatOutbox` 복제 — 차이는 보내기 인자에 `inquiry`를 그대로 싣는 것(소매는 `{body, inquiry}`를 같은 키로 다시 보낸다).
 *
 * 방 화면 state였을 때는 방을 떠나면 실패 말풍선이 같이 사라져 무엇을 다시 보내야 하는지 몰랐다. 셸(`ChatShellProvider`)이
 * 들면 방 왕복, 상품과 장바구니 다녀오기, 담기 뒤 `router.refresh()`(셸 서버 컴포넌트만 다시 그림)에도 남는다. 셸이
 * 내려가는 전체 이동(새로고침, 401 공용 처리, 다른 탭 정리)에서는 잃는다(받아들인 손실, S2-9 S2-10).
 *
 * 결과는 보낸 순간 쥔 방에만 간다. 보낸 순간의 계정 세대를 쥐고 끝났을 때 바뀌었으면 성공이든 실패든 버린다 — 다음
 * 소매처 화면에 앞 소매처 말풍선이 생기지 않게(§5-4 "보내기 결과" 행). 같은 계정 갱신과 화면 세대 갈래는
 * `guardSession`이 오류 종류로 가르고 `sendOutcomeOf`가 말풍선 갈래로 바꾼다.
 *
 * 로그아웃을 누른 순간(나가는 중) 보류 말풍선을 비우고 보내기, 다시 보내기를 받지 않는다(S2-15 ①).
 */
export function useChatOutbox() {
  const queryClient = useQueryClient();
  const { mutateAsync } = useSendMessageMutation();
  const [byRoom, setByRoom] = useState<PendingByRoom>({});
  const leaving = useChatLeaving();

  /* 누른 순간 비운다. 렌더도 아래 `pendingOf`가 바로 빈 목록을 준다 — 이 effect를 기다리는 한 프레임도 안 보이게 */
  useEffect(
    () =>
      subscribeChatLeaving(() => {
        if (isChatLeaving()) setByRoom({});
      }),
    [],
  );

  const update = useCallback(
    (
      roomId: number,
      change: (list: readonly PendingMessage[]) => PendingMessage[],
    ) => setByRoom((all) => withRoomPending(all, roomId, change)),
    [],
  );

  const deliver = useCallback(
    (roomId: number, item: PendingMessage) => {
      if (isChatLeaving()) return;
      // 오프라인이면 요청을 만들지 않는다. 온라인이 돼도 저절로 보내지 않는다 — 사장이 다시 보내기를 누른다(S6-6)
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
      const account = chatAccountEpoch();
      mutateAsync({
        roomId,
        clientMessageId: item.clientMessageId,
        body: item.body,
        inquiry: item.inquiry,
      }).then(
        (result) => {
          if (chatAccountEpoch() !== account) return;
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
          update(roomId, (list) =>
            list.filter((p) => p.clientMessageId !== item.clientMessageId),
          );
        },
        (error: unknown) => {
          /* 401은 `guardSession`이 이미 그 방 화면의 끊김으로 표시했다(떠난 화면이면 안 했다). 여기는 말풍선 갈래만 */
          const failure = sendOutcomeOf(error, chatAccountEpoch() !== account);
          if (failure === "drop") return;
          update(roomId, (list) =>
            upsertPending(list, { ...item, status: "failed", failure }),
          );
        },
      );
    },
    [mutateAsync, queryClient, update],
  );

  /**
   * 새 말풍선. 키는 여기서 한 번 만들고 다시 보내기까지 그대로 간다. `inquiry`는 칩(`재고 문의`, 되묻기 보기)만
   * 채운다 — 말풍선에 같이 실어 두어 다시 보내기가 같은 `{body, inquiry}`를 보낸다(S8-15, S2-3 ②)
   */
  const send = useCallback(
    (roomId: number, body: string, inquiry: ChatInquiry | null = null) =>
      deliver(roomId, {
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
    (roomId: number, clientMessageId: string) =>
      update(roomId, (list) =>
        list.filter((p) => p.clientMessageId !== clientMessageId),
      ),
    [update],
  );

  const shown = leaving ? NO_ROOMS : byRoom;
  return useMemo(
    () => ({
      pendingOf: (roomId: number) => pendingOfRoom(shown, roomId),
      send,
      retry: deliver,
      remove,
    }),
    [shown, send, deliver, remove],
  );
}

const NO_ROOMS: PendingByRoom = {};

export type ChatOutbox = ReturnType<typeof useChatOutbox>;
