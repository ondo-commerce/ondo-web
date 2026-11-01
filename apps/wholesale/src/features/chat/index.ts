/**
 * chat feature의 public API.
 * 이 파일에 없는 것은 feature 밖에서 import 하지 않는다 (ESLint로 강제).
 */
export { ChatView } from "./components/ChatView";
/* 로그아웃이 쓰던 글을 지우게(loop-08b Q2). 로그아웃은 account feature라 `app/`이 둘을 잇는다 */
export { clearChatDrafts } from "./draftStore";
/* 로그아웃이 채팅 캐시(목록, 대화)도 버리게(loop-08b M1). QueryClient는 앱 하나라 안 버리면 다음 계정이 본다 */
export { clearChatCache } from "./api/scope";
