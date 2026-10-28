/**
 * 채팅 feature의 queryKey 팩토리.
 *
 * 방 목록과 방 머리는 서버가 계산하는 값(`needsReply`, `unreadCount`)을 들고 있어서, 열린 방에
 * 새 메시지가 오거나 내가 보내면 그 둘만 비운다. 메시지(`thread`)는 polling이 이어 붙이는
 * 캐시라 비우지 않는다 — 비우면 처음부터 50개를 다시 받는다.
 */
export const chatKeys = {
  all: ["chat"] as const,
  rooms: () => [...chatKeys.all, "rooms"] as const,
  room: (roomId: number) => [...chatKeys.all, "room", roomId] as const,
  thread: (roomId: number) => [...chatKeys.all, "thread", roomId] as const,
};
