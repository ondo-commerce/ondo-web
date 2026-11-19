/**
 * chat feature의 public API.
 * 이 파일에 없는 것은 feature 밖에서 import 하지 않는다 (ESLint로 강제).
 */
/* 세션이 바뀔 때 채팅 캐시 비우기(loop-08c S7). 로그아웃, 로그인은 account가 알고 잇는 건 `app/`이 한다 */
export {
  beginChatSignOut,
  clearChatCache,
  endChatSignOut,
  refreshChatSession,
} from "./api/session";
/* 쓰던 글 정리(loop-08e S2-1). 로그아웃 갈래와 로그인 성공 갈래를 `app/SessionChangeCleanup.tsx`가 잇는다 */
export { clearChatDrafts, keepChatDraftsOf } from "./draftStore";
/* 셸 수명 채팅 칸(소매처 id, #362 보류 말풍선). `app/(shop)/layout.tsx`가 `children`을 감싼다 */
export { ChatShellProvider } from "./ChatShellProvider";
export { ChatNavButton } from "./components/ChatNavButton";
export { ChatRoomListView } from "./components/ChatRoomListView";
export { ChatRoomView } from "./components/ChatRoomView";
export {
  InquiryButton,
  InquiryEntry,
  InquiryError,
} from "./components/InquiryEntry";
export { parseRoomId } from "./derive";
