import type { Metadata } from "next";
import { PlaceholderPage } from "@/shared/components/PlaceholderPage";

export const metadata: Metadata = { title: "검색 결과" };

/**
 * 요청마다 서버에서 그린다. 헤더의 통합 검색이 `?q=`를 읽어 자기 값으로 되돌리는데,
 * 이 화면을 정적으로 굳히면 첫 HTML의 검색창이 **늘 빈 칸**이다 — 주소로 직접 들어온
 * 사장은 하이드레이션이 끝날 때까지(느린 망에서 1초 가까이) 자기가 뭘 검색했는지
 * 화면에서 읽을 수 없다. 주소가 곧 상태인 화면이라 정적 생성과 맞바꾼다.
 * (SEO는 잃지 않는다. 크롤러도 완성된 HTML을 그대로 받는다.)
 */
export const dynamic = "force-dynamic";

export default function Page() {
  return <PlaceholderPage title="검색 결과" />;
}
