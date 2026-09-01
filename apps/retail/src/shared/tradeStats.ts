/**
 * 한 도매처와의 **거래 지표 한 벌.**
 *
 * 진행 중 · 미송 · 미수는 세 화면이 같이 말한다 — 거래처 관리(`/wholesalers`) ·
 * 정산(`/settlements`) · 도매처 홈(`/wholesalers/[id]`). 그런데 값의 원본이
 * `features/settlement`(거래 원장)과 `features/catalog`(도매처 더미)로 갈려 있어서,
 * 같은 세션에서 무드온이 한쪽에서는 `진행 중 1건 · 미송 —`, 다른 쪽에서는
 * `진행 중 3건 · 미송 2`였다(F1). 미송 축도 같은 이유로 어긋났다(#128).
 *
 * **원본은 이제 `features/settlement`의 거래처 더미 + 거래 원장 하나뿐이다.**
 * 도매처 홈은 그 값을 `app/`에서 받아 그린다 — feature끼리 직접 import하지 않으므로
 * (`CLAUDE.md`) 두 feature가 같이 쓰는 **모양**만 여기 둔다.
 */
export interface TradeStats {
  /** 확정 대기 건수 */
  pendingCount: number;
  /** 미송 건수. 장수와 다른 축이다 — 1건에 16장일 수 있다 */
  backorderCount: number;
  /** 미송 대기 장수. 0이면 화면에 `—`가 나간다 */
  backorderSheets: number;
  /** 약속한 입고일을 넘긴 미송이 있는가. 색이 아니라 `지연` 글자로도 구분된다 */
  backorderDelayed: boolean;
  /** 미수 잔액. **음수면 선수금**이다(§3-0 E). 거래 원장에서 파생된다 */
  balance: number;
  /** 마지막 입금일(ISO). 입금 이력이 없으면 null이고 화면에 `—`가 나간다 */
  lastPaidAt: string | null;
}

/**
 * 진행 중 = 확정 대기 + 미송 건수.
 *
 * **저장하지 않고 부를 때마다 더한다.** 합을 따로 적어 두면 확정 대기만 고쳤을 때
 * 합이 안 따라와서, 같은 카드 안에서 `진행 중 3건 · 확정 대기 1 · 미송 2`처럼
 * 자기끼리 안 맞는 문장이 나온다 — 실제로 그렇게 갈라져 있었다(F1).
 */
export function ongoingCount(stats: TradeStats): number {
  return stats.pendingCount + stats.backorderCount;
}
