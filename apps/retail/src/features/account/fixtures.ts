import type { AccountProfile, Application } from "./types";

/*
 * **설정 화면(`SettingsView`·`store.ts`)만 읽는 더미.**
 *
 * 로그인·가입·승인 대기·거절은 전부 실서버(`/auth/*`)로 붙어 여기서 아무것도
 * 안 읽는다. 설정이 남은 이유: 스냅샷(`packages/api/openapi/retail.json`)에 설정
 * 화면이 쓸 path가 없다 — 대표자명·연락처·사업자번호는 `/me`가 일부러 빼고
 * 내리고(스펙 설명), 고치는 API도 없다. 그 path가 생기는 회차에 이 파일을 지운다.
 */

/**
 * 설정 화면이 보는 계정 한 건. 대표자명·연락처는 자리표시자다 — 실제 형식의
 * 개인정보를 소스에 적지 않는다.
 */
export const SETTINGS_ACCOUNT: AccountProfile = {
  email: "store@example.com",
  storeName: "봄봄상회",
  ownerName: "김봄",
  phone: "010-0000-0000",
  status: "APPROVED",
};

/**
 * 설정의 `사업자 정보` 패널과 동의 내역 일시가 읽는 신청 1건.
 *
 * ⚠️ 사업자등록번호는 **자리표시자**다. 실제 형식의 번호를 더미로 넣으면 그대로
 *    캡처·문서에 실려 나간다.
 */
export const APPLICATION: Application = {
  storeName: SETTINGS_ACCOUNT.storeName,
  bizNo: "000-00-00000",
  appliedAt: "2026.07.17 10:20",
};
