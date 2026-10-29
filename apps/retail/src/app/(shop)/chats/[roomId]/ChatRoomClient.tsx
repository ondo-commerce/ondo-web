"use client";

import { addCartItem } from "@/features/cart";
import { ChatRoomView } from "@/features/chat";

/**
 * 채팅방과 장바구니 담기를 붙이는 자리(loop-05b §4-1 9). `features/chat`은 `features/cart`를 모른다 —
 * feature끼리 참조하지 않고 부모인 `app/`이 끼워 넣는다(`ProductDetailClient.tsx`와 같은 방식).
 *
 * 뮤테이션(`useAddCartItemMutation`)이 아니라 맨 함수(`addCartItem`)를 넘기는 이유: 채팅은 담기 401을
 * `/login` 전체 이동이 아니라 방의 세션 끊김으로 바꿔야 한다(S8-8, D28). cart 뮤테이션을 거치면 공용
 * MutationCache가 원래 401을 먼저 보고 이동시킨다. 채팅이 자기 뮤테이션 안에서 `guardSession`으로 감싼다.
 */
export function ChatRoomClient({
  roomId,
  from,
}: {
  roomId: number;
  from: string | null;
}) {
  return <ChatRoomView roomId={roomId} from={from} addToCart={addCartItem} />;
}
