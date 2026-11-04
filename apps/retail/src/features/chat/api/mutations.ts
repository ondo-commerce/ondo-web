"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@ondo/api";
import { mockReady as chatMockReady } from "@/shared/api/mockReady";
import { CHAT_PATH } from "./queries";
import { chatScreenEpoch, dropStaleSession, guardSession } from "./session";
import type {
  ChatInquiry,
  ChatReadResult,
  ChatRoomDetail,
  ChatSendResult,
  CreateChatRoomRequest,
} from "../types";

/**
 * 방 만들기(멱등). 이미 있으면 200, 없으면 201 — 화면은 둘을 똑같이 다룬다(Q3, 확인 창 없음).
 * 목 모드면 worker 준비를 먼저 기다린다(S5-12). `guardSession`을 **거치지 않는다** — 401은 공용 처리
 * (`providers.tsx`)가 `/login`으로 보낸다. 이 단계엔 쓴 글이 없다(01-plan §4-1 2).
 *
 * 세대 검사는 한다(리뷰 R7, `dropStaleSession`). 누른 뒤 로그아웃, 다른 계정 로그인이 끼면 그 응답은 401이든 성공이든
 * 버린다 — 다음 계정을 `/login`으로 튕기거나 앞 계정 방으로 옮기지 않게. 부르는 쪽(`InquiryEntry`)은 버린 응답에 아무것도
 * 안 한다. 같은 소매처 재로그인을 넘긴 401만 입구 문구를 띄운다(loop-08e Q6)
 */
export function useCreateRoomMutation() {
  return useMutation({
    mutationFn: (body: CreateChatRoomRequest) =>
      dropStaleSession(async () => {
        await chatMockReady();
        return apiFetch<ChatRoomDetail>(CHAT_PATH.rooms, {
          method: "POST",
          body,
        });
      }),
  });
}

/**
 * 읽음(loop-06 S2-5). 서버가 `max(기존, 요청)`으로 저장하고 남은 수를 같이 돌려준다. 언제 다시 보낼지는
 * 부르는 쪽(`ChatRoomView`)이 정한다 — 그래서 호출마다 결과를 받는 `mutateAsync`를 쓴다(도매와 같다).
 *
 * `guardSession`을 거친다(S2-7): 읽음 401에 공용 처리가 `/login`으로 보내면 쓰던 글이 사라진다. 끊김으로 바꾸면
 * 방이 05a 끊김 상태(주소, 쓰던 글 그대로, 보내기 잠김)가 된다.
 */
export function useMarkReadMutation(roomId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (lastReadSequence: number) => {
      await chatMockReady();
      return guardSession(
        queryClient,
        () =>
          apiFetch<ChatReadResult>(CHAT_PATH.read(roomId), {
            method: "POST",
            body: { lastReadSequence },
          }),
        chatScreenEpoch(),
        roomId,
      );
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
 *
 * 방 번호는 변수로 받는다(loop-08e §4-2 7) — 부르는 곳이 방 화면이 아니라 셸 outbox(`ChatShellProvider`)라 방을
 * 옮겨 다녀도 같은 뮤테이션이 보낸 방으로 보낸다(도매 `useSendMessageMutation`과 같다).
 */
export function useSendMessageMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      roomId,
      clientMessageId,
      body,
      inquiry,
    }: {
      roomId: number;
      clientMessageId: string;
      body: string;
      inquiry: ChatInquiry | null;
    }) => {
      await chatMockReady();
      /* 방 번호를 넘긴다 — 보내자마자 떠나 늦은 401을 받으면 그 방을 다음 재진입 확인 대상으로 적는다(메타 M2) */
      return guardSession(
        queryClient,
        () =>
          apiFetch<ChatSendResult>(CHAT_PATH.messages(roomId), {
            method: "POST",
            body: { body, inquiry },
            idempotencyKey: clientMessageId,
          }),
        chatScreenEpoch(),
        roomId,
      );
    },
    networkMode: "always",
  });
}
