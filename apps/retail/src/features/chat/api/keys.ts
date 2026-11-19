/**
 * 채팅 feature의 queryKey 팩토리. 방 머리(`room`)와 메시지(`thread`)는 방마다 하나.
 * 메시지는 polling이 이어 붙이는 캐시라 비우지 않는다 — 비우면 처음부터 50개를 다시 받는다.
 */
export const chatKeys = {
  all: ["chat"] as const,
  /** `/chats` 첫 장(loop-06 S2-4) */
  rooms: () => [...chatKeys.all, "rooms"] as const,
  room: (roomId: number) => [...chatKeys.all, "room", roomId] as const,
  thread: (roomId: number) => [...chatKeys.all, "thread", roomId] as const,
  /** 요청이 아니라 "세션이 끊겼다" 표시 한 칸(`session.ts`) */
  session: () => [...chatKeys.all, "session"] as const,
  /**
   * 헤더 채팅 배지(`headerCounts.ts`). `chatKeys.all` 아래에 두지 않는다 — 방 화면이 채팅 캐시를 통째로
   * 비우거나 다시 부를 때 헤더까지 휩쓸리면 401로 멈춘 count가 다시 돌 수 있다
   */
  headerCounts: () => ["header-counts"] as const,
};
