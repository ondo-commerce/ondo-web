/**
 * 주문 화면들의 더미. **API가 붙으면 이 파일만 지운다.**
 *
 * 값은 확정 와이어프레임 `15_retail-hallmark/parts/06~09 · 18~20` 그대로 옮기되
 * **계산이 안 맞는 값은 고쳐서** 넣는다(`01-pm.md` §7 가정 A5). 원본을 그대로
 * 베끼면 화면 두 곳이 서로 다른 금액을 말하게 되고, 그건 QA가 결함으로 잡는다.
 */

/** 도매처별 입금 계좌 */
export interface BankAccount {
  bankName: string;
  accountNo: string;
  holder: string;
}

/**
 * 계좌 이체를 고른 도매처에만 붙는 안내.
 *
 * **전부 더미다.** 계좌는 도매가 등록하는 값인데 도매에 그 화면이 아직 없고,
 * 원본 어디에도 실제 계좌가 없다(§5-9). 예금주는 도매처명으로 둔다 —
 * 실제로는 대표자명일 수 있지만, 없는 이름을 지어내는 것보다 정직하다.
 */
const DEFAULT_BANK: BankAccount = {
  bankName: "국민",
  accountNo: "000000-00-000000",
  holder: "",
};

/**
 * 도매처 하나의 입금 계좌. 등록된 계좌가 없어도 화면이 비지 않게 기본 더미를
 * 돌려주고, 예금주만 그 도매처 이름으로 채운다.
 */
export function bankAccountOf(wholesalerName: string): BankAccount {
  return { ...DEFAULT_BANK, holder: wholesalerName };
}
