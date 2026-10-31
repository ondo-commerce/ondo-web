/**
 * chat feature의 public API.
 * 이 파일에 없는 것은 feature 밖에서 import 하지 않는다 (ESLint로 강제).
 */
export { ChatView } from "./components/ChatView";
/* 로그아웃이 쓰던 글을 지우게(loop-08b Q2). 로그아웃은 account feature라 `app/`이 둘을 잇는다 */
export { clearChatDrafts } from "./draftStore";
