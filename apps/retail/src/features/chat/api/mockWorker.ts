/**
 * 소매 채팅 목 worker 준비(01-plan §5-2 8, Codex plan r1 1).
 *
 * 소매는 도매식 MockGate를 쓰지 않는다 — 셸과 상품 상세는 서버가 그린 HTML이라 worker가 뜰 때까지
 * 가리면 첫 화면이 빈다. 대신 **채팅 요청만** 이 Promise를 먼저 기다린다. 입구 버튼과 방 블록이 같은
 * Promise 하나를 나눠 쓴다(모듈 안에서 한 번만 시작한다). 기다리는 동안 버튼은 `여는 중`이다.
 *
 * 안 기다리면: 새 브라우저로 상품 상세에 바로 들어와 `문의하기`를 누를 때 worker가 아직 없어 POST가
 * 목이 아니라 프록시(→ 실서버, e2e에선 가짜 API)로 샌다(S5-12).
 *
 * `NEXT_PUBLIC_*`은 빌드 때 문자열로 박혀 목이 꺼진 번들에서는 import 가지가 사라진다(도매 providers와 같다).
 *
 * **번들에서 빠지는 조건**(리뷰 F1): 값이 빌드 때 상수로 박혀야 한다. 미설정이면 Next가 치환하지 않아
 * `process.env.…`가 런타임 비교로 남고, 그러면 아래 import와 msw, 양쪽 앱 핸들러가 production 청크에
 * 실린다. 그래서 `next.config.ts`가 미설정을 `"0"`으로 못 박고, 여기선 비교를 함수 안 첫 줄에 둬
 * 상수 `"0" !== "1"` → 뒤가 죽은 코드가 되게 한다.
 */
let ready: Promise<void> | null = null;

export function chatMockReady(): Promise<void> {
  if (process.env.NEXT_PUBLIC_API_MOCK !== "1") return Promise.resolve();
  /* 실패하면 기억을 비운다(리뷰 F2) — 거절된 Promise를 남기면 worker 파일 다운로드가 한 번 실패한 뒤로
     `문의하기`를 다시 눌러도 영영 즉시 실패한다. 오류는 그대로 부른 쪽에 넘긴다 */
  ready ??= import("@ondo/api/mocks/browser")
    .then((mocks) => mocks.startRetailChatWorker())
    .catch((error: unknown) => {
      ready = null;
      throw error;
    });
  return ready;
}
