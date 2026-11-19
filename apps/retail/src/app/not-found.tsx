/* 어느 라우트에도 안 맞는 주소(`/no-such-page`)는 Next가 이 파일을 그린다. 없으면 영문 기본
   `404 This page could not be found.`가 떴다(#451). 말은 `(shop)` 안내와 같다.
   셸(헤더) 없이 뜬다 — 셸 레이아웃이 로그인 가드라, 거기로 보내면 주소를 잘못 친 사람이
   로그인부터 하게 된다 */
export { default } from "./(shop)/not-found";
