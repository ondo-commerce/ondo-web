import type { QueryClient } from "@tanstack/react-query";
import type { RoomListFilter } from "../types";

/** 계정과 상관없는 채팅 캐시 전부. 로그아웃 정리만 쓴다 */
export const CHAT_KEY_ROOT = ["chat"] as const;

/**
 * 채팅 feature의 queryKey 팩토리.
 *
 * 방 목록과 방 머리는 서버가 계산하는 값(`needsReply`, `unreadCount`)을 들고 있어서, 열린 방에
 * 새 메시지가 오거나 내가 보내면 그 둘만 비운다. 메시지(`thread`)는 polling이 이어 붙이는
 * 캐시라 비우지 않는다 — 비우면 처음부터 50개를 다시 받는다.
 *
 * **키 둘째 칸이 계정이다**(loop-08b M1). QueryClient는 앱 수명 내내 하나라 로그아웃하고 다른 계정으로
 * 들어와도 남아 있다. 계정이 키에 없으면 B가 A의 목록과 대화를 30초(staleTime) 동안 그대로 본다.
 * 로그아웃 때 지우기도 하지만(`clearChatCache`) 지운 뒤 늦게 도착한 응답이 A 키에 들어가도 B는 못 읽는다.
 */
export function chatKeysFor(account: string) {
  const all = [...CHAT_KEY_ROOT, account] as const;
  const keys = {
    all,
    /** 목록 전부(조건 무관). 무효화는 이걸로 — 조건마다 따로 비우지 않는다 */
    rooms: () => [...all, "rooms"] as const,
    /** 조건 하나의 목록(loop-08b S4). 조건이 키에 있어 늦게 온 이전 검색 결과가 지금 화면을 덮지 않는다(S4-7) */
    roomList: (filter: RoomListFilter, q: string | null) =>
      [...keys.rooms(), filter, q] as const,
    room: (roomId: number) => [...all, "room", roomId] as const,
    thread: (roomId: number) => [...all, "thread", roomId] as const,
    /** 자동 답 설정(도매처 하나에 한 벌, `settings.ts`). 메시지 polling과 상관없다 */
    autoReplySettings: () => [...all, "auto-reply-settings"] as const,
    /** 요청이 아니라 "세션이 끊겼다" 표시 한 칸(`session.ts`) */
    session: () => [...all, "session"] as const,
  };
  return keys;
}

export type ChatKeys = ReturnType<typeof chatKeysFor>;

/** 채팅 요청 도우미들이 같이 받는 것. 캐시 하나와 그 계정의 키 */
export interface ChatCache {
  queryClient: QueryClient;
  keys: ChatKeys;
}
