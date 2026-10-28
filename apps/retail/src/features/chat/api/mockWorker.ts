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
 */
const MOCK_ENABLED = process.env.NEXT_PUBLIC_API_MOCK === "1";

let ready: Promise<void> | null = null;

export function chatMockReady(): Promise<void> {
  if (!MOCK_ENABLED) return Promise.resolve();
  ready ??= import("@ondo/api/mocks/browser").then((mocks) =>
    mocks.startRetailChatWorker(),
  );
  return ready;
}
