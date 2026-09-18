import { BANK_MISSING } from "../constants";
import type { BankAccount } from "../types";
import { CopyTextButton } from "./CopyButton";

/**
 * 입금 계좌 안내 한 줄(확정 와이어프레임 `_base.css` `.bank`).
 *
 * 도매처를 바꾸면 **예금주도 같이 바뀐다** — 계좌만 바뀌고 예금주가 남으면 남의
 * 이름으로 송금하게 된다. 그래서 계좌를 도매처와 한 덩어리로 들고 다닌다.
 *
 * 복사되는 문자열에 은행명을 같이 넣는다. 번호만 복사하면 사장이 은행 앱에서
 * 어느 은행인지 다시 찾아야 한다.
 *
 * **계좌가 없으면(`null`) 줄 자체는 남기고 `계좌 미등록`을 세운다.** 줄을 통째로
 * 빼면 "아직 안 그려진 것"으로 읽히고, 없다는 사실이 글자로 있어야 사장이 도매처에
 * 계좌를 물어본다. 복사 버튼은 복사할 것이 없으니 안 그린다.
 */
export function BankAccountRow({ bank }: { bank: BankAccount | null }) {
  if (bank === null) {
    return (
      <div className="border-border flex flex-wrap items-center gap-2.5 rounded-control border px-3.5 py-2.5">
        <span className="text-muted-foreground text-body">입금 계좌</span>
        <span className="text-muted-foreground text-sm">{BANK_MISSING}</span>
      </div>
    );
  }

  const account = `${bank.bankName} ${bank.accountNo}`;

  return (
    <div className="border-border flex flex-wrap items-center gap-2.5 rounded-control border px-3.5 py-2.5">
      <span className="text-muted-foreground text-body">입금 계좌</span>
      <span className="text-sm font-medium tabular-nums">{account}</span>
      <span className="text-muted-foreground text-body">
        예금주 {bank.holder}
      </span>
      <span className="ml-auto">
        <CopyTextButton
          text={account}
          label={`${bank.holder} 입금 계좌 복사`}
        />
      </span>
    </div>
  );
}
