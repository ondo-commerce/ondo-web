/** 수량·금액 표시. 서버가 내려준 숫자를 보여주기만 한다 — 여기서 계산하지 않는다 */
export function formatNumber(value: number): string {
  return value.toLocaleString("ko-KR");
}

/** 마진율. 양수는 +를 붙여 상승임을 드러낸다 */
export function formatRate(value: number): string {
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;
}
