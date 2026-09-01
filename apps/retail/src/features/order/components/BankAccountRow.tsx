"use client";

import { Button } from "@ondo/ui";
import { Copy } from "lucide-react";
import { useState } from "react";
import { CHECKOUT_TEXT } from "../constants";
import { formatWon } from "../derive";
import { bankAccountOf } from "../fixtures";

/**
 * 계좌 이체를 고른 도매처에만 붙는 입금 계좌 줄(`.bank`).
 *
 * **`현금`으로 바꾸면 이 줄이 사라진다**(RT-36) — 현금으로 낼 도매처에 계좌가
 * 남아 있으면 사장이 그리로 돈을 보낸다.
 *
 * `복사`는 **눌린 결과가 보여야 한다.** 앞 회차에서 onClick도 href도 없는 버튼이
 * 결함으로 잡혔고, 클립보드는 권한·보안 컨텍스트에 따라 조용히 실패하는 API라
 * 성공·실패 둘 다 그 자리에서 말한다.
 */
export function BankAccountRow({
  wholesalerName,
  amount,
}: {
  wholesalerName: string;
  /** 이 도매처에 보낼 금액. 상자 머리 금액과 **같은 파생 함수**에서 온다 */
  amount: number;
}) {
  const account = bankAccountOf(wholesalerName);
  const accountText = `${account.bankName} ${account.accountNo}`;
  const [notice, setNotice] = useState<string | null>(null);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(account.accountNo);
      setNotice(CHECKOUT_TEXT.copied);
    } catch {
      /* 클립보드가 막힌 브라우저에서도 버튼이 조용히 아무 일도 안 하지 않는다.
         사장이 계좌를 손으로 옮겨 적을 수 있게 이유를 남긴다 */
      setNotice(CHECKOUT_TEXT.copyFailed);
    }
  };

  return (
    <div className="border-border mt-2.5 rounded-control border px-3.5 py-2.5">
      <div className="text-body flex flex-wrap items-center gap-x-2.5 gap-y-1">
        <span className="text-muted-foreground">{CHECKOUT_TEXT.bankLabel}</span>
        <span className="font-medium tabular-nums">{accountText}</span>
        <span className="text-muted-foreground">예금주 {account.holder}</span>

        <span className="ml-auto flex items-center gap-3 phone:ml-0 phone:w-full phone:justify-between">
          <span className="font-medium tabular-nums">{formatWon(amount)}</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleCopy}
            aria-label={`${wholesalerName} 입금 계좌번호 복사`}
          >
            <Copy aria-hidden className="size-3.5" />
            {CHECKOUT_TEXT.copy}
          </Button>
        </span>
      </div>

      {/* 결과가 버튼 옆 그 자리에서 뜬다. role=status라 낭독기도 듣는다 */}
      <p
        role="status"
        className="text-secondary-foreground text-body mt-1 empty:hidden"
      >
        {notice ?? ""}
      </p>
    </div>
  );
}
