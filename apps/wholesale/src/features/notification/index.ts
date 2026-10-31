/**
 * notification feature의 public API.
 * 이 파일에 없는 것은 feature 밖에서 import 하지 않는다 (ESLint로 강제).
 */
export { HeaderInbox } from "./components/HeaderInbox";
/* 로그아웃이 헤더 count와 알림 목록 캐시를 버리게(loop-08b). 로그아웃은 account feature라 `app/`이 잇는다 */
export { clearNotificationCache } from "./api/scope";
