/**
 * 소매 목의 "나"와 상대 도매처. 채팅 목(`./chat.ts`)과 알림 목(`./notification.ts`)이 같이 쓴다.
 *
 * 따로 뺀 이유: 채팅 목의 헤더 count 핸들러가 알림 저장소를 읽는다. 알림 목이 도매처 이름을 채팅 목에서
 * 가져오면 두 파일이 서로 import 해서, 알림 목이 로드될 때 시드를 만들다 아직 초기화 안 된 상수를 만난다.
 */

/** 세션 없는 목의 "나"(봄봄상회). 주문, 미송 목과 같은 id */
export const RETAIL_ME_RETAILER_ID = 1;

/**
 * 대화할 수 있는 도매처. 이름은 소매 e2e 가짜 API(`e2e/side-02/retail/stub-api.ts`)의 상품과 맞춘다.
 * 103은 30자 상호다 — 방 머리 말줄임(S5-15)을 이 방 하나로 본다. 이 표에 없는 id는 404(없는 도매처).
 */
export const RETAIL_WHOLESALERS: Readonly<Record<number, string>> = {
  101: "무드온",
  102: "라온",
  103: "코튼클럽 동대문 신평화패션타운 삼층 본점 직영 도매상회",
};
