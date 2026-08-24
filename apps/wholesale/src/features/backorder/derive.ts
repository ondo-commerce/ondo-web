import type { BackorderLine } from "./types";

/*
 * 미송 탭의 파생값은 전부 여기 있다. 컴포넌트 JSX 안에서 계산하지 않는다 —
 * 같은 숫자가 좌측 목록 · 카운터 바 · 배분 표 · 우측 요약 **네 곳**에서 읽히는데,
 * 흩어 놓으면 한 곳만 고쳐도 화면끼리 숫자가 갈린다. 사장이 화면을 안 믿게 되는 지점이다.
 */

/** 총 미송 수량 `T` = Σ 미송 수량. SKU에 필드로 들고 있지 않고 항상 행에서 다시 센다 */
export function totalBackorderQty(lines: readonly BackorderLine[]): number {
  return lines.reduce((sum, line) => sum + line.qty, 0);
}
