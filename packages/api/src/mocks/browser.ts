import { setupWorker } from "msw/browser";
import type { RequestHandler } from "msw";
import { retailChatHandlers } from "./retail/chat";
import { retailNotificationHandlers } from "./retail/notification";
import { wholesaleHandlers } from "./wholesale";

/**
 * 브라우저 목 시작. 앱의 `providers.tsx`가 `NEXT_PUBLIC_API_MOCK=1`일 때만
 * **동적 import**로 부른다 — 정적으로 들이면 msw와 스냅샷 JSON이 프로덕션 번들에 실린다.
 *
 * `extra`는 화면이 그때그때 얹는 핸들러(상태가 필요한 목). 앞에 둬서 기본을 덮는다.
 *
 * `bypass`: 목에 없는 요청은 실서버로 보낸다. 경고를 찍지 않는 이유는 Next 자체 요청
 * (`/_next/*`)이 전부 걸려 콘솔이 쓸모없어지기 때문이다.
 *
 * `mockServiceWorker.js`는 `msw init`이 만든 파일이고 앱의 `public/`에 커밋돼 있다.
 */
export async function startMockWorker(
  extra: readonly RequestHandler[] = [],
): Promise<void> {
  const worker = setupWorker(...extra, ...wholesaleHandlers);
  await worker.start({
    onUnhandledRequest: "bypass",
    serviceWorker: { url: "/mockServiceWorker.js" },
  });
}

/**
 * 소매 앱 목 시작(loop-05a). **채팅과 알림(loop-06b) 핸들러만** 올린다 — 소매는 상품, 홈, `/me`를 서버
 * 컴포넌트가 그려서 브라우저 목이 닿지 않고(e2e에선 가짜 API 3199), 채팅과 헤더 종만 브라우저가 직접 부른다.
 * 나머지 브라우저 요청(장바구니 쓰기 등)은 `bypass`로 프록시를 지나간다.
 *
 * 소매는 도매식 MockGate를 쓰지 않는다(서버가 그린 HTML을 가린다). 부르는 쪽(`features/chat`)이
 * 첫 채팅 요청 전에 이 Promise를 기다린다.
 */
export async function startRetailChatWorker(): Promise<void> {
  const worker = setupWorker(
    ...retailNotificationHandlers,
    ...retailChatHandlers,
  );
  await worker.start({
    onUnhandledRequest: "bypass",
    serviceWorker: { url: "/mockServiceWorker.js" },
    quiet: true,
  });
}
