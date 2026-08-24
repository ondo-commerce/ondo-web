"use client";

import { FormField, Input, Panel, Segmented } from "@ondo/ui";
import { useId, useState } from "react";
import { METHOD_LABEL, PAYER_LABEL } from "../constants";
import { parseNumberInput } from "../derive";
import type { PayerType, PaymentMethod, TradeRelation } from "../types";
import { formatNumber } from "@/shared/lib/format";

/**
 * 우측 패널 — 통장에 찍힌 입금 한 건을 그대로 옮겨 적는 자리.
 *
 * 제목 아래에 **대상 거래처를 적는다.** Figma에는 없지만(01-pm.md §5 Q6),
 * 좌측에서 펼친 거래처가 곧 이 패널의 대상이라 화면에 그 이름이 없으면
 * 엉뚱한 거래처에 입금을 붙여도 알아챌 방법이 없다.
 *
 * 폼 상태는 이 컴포넌트 안에만 있다. 거래처를 바꾸면 호출부가 key로 새로 만들어
 * 입력값이 통째로 초기화된다 — A거래처에 적던 금액이 B거래처 화면에 남으면 안 된다.
 */
export function DepositFormPanel({ relation }: { relation: TradeRelation }) {
  /* 입력칸은 문자열로 들고 있는다 — 빈칸과 0을 구분해야 해서 숫자로 바로 못 바꾼다 */
  const [amountRaw, setAmountRaw] = useState("");
  const [receivedAt, setReceivedAt] = useState("");
  const [payerType, setPayerType] = useState<PayerType>("retailer");
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [memo, setMemo] = useState("");

  const amountId = useId();
  const receivedAtId = useId();
  const memoId = useId();

  const amount = parseNumberInput(amountRaw);

  return (
    <Panel className="flex-1">
      <Panel.Title sub={`${relation.retailerName} · ${relation.retailerCode}`}>
        입금 등록
      </Panel.Title>

      <Panel.Body>
        {/* 2열 그리드. 세로 간격은 FormField가 이미 갖고 있어 가로만 준다 */}
        <div className="grid grid-cols-2 gap-x-4">
          <FormField label="입금액" htmlFor={amountId}>
            <Input
              id={amountId}
              numeric
              inputMode="numeric"
              placeholder="0"
              /* 화면에는 콤마가 붙은 값이 보이고 상태에는 숫자만 남는다 */
              value={amount === null ? "" : formatNumber(amount)}
              onChange={(e) => setAmountRaw(e.target.value)}
            />
          </FormField>

          <FormField label="입금 일시" htmlFor={receivedAtId}>
            {/* Figma가 텍스트 한 줄이라 날짜 피커·형식 검증을 두지 않는다 */}
            <Input
              id={receivedAtId}
              placeholder="2025-08-14 15:30"
              value={receivedAt}
              onChange={(e) => setReceivedAt(e.target.value)}
            />
          </FormField>

          <FormField label="결제 주체">
            <Segmented
              className="w-full"
              value={payerType}
              onValueChange={(value) => setPayerType(value as PayerType)}
              aria-label="결제 주체"
            >
              <Segmented.Item value="retailer">
                {PAYER_LABEL.retailer}
              </Segmented.Item>
              <Segmented.Item value="purchasingAgent">
                {PAYER_LABEL.purchasingAgent}
              </Segmented.Item>
            </Segmented>
          </FormField>

          <FormField label="입금 방식">
            <Segmented
              className="w-full"
              value={method}
              onValueChange={(value) => setMethod(value as PaymentMethod)}
              aria-label="입금 방식"
            >
              <Segmented.Item value="cash">{METHOD_LABEL.cash}</Segmented.Item>
              <Segmented.Item value="bankTransfer">
                {METHOD_LABEL.bankTransfer}
              </Segmented.Item>
            </Segmented>
          </FormField>

          <FormField label="메모" htmlFor={memoId}>
            <Input
              id={memoId}
              placeholder="8월 정산금 납부"
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
            />
          </FormField>
        </div>

        {/* 아래가 주문별 배분 섹션 자리다 — 05번 이슈 */}
        <hr className="border-border mt-1 mb-6" />
      </Panel.Body>
    </Panel>
  );
}
