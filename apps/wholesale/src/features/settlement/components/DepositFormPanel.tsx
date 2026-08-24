"use client";

import { Button, FormField, Input, Panel, Segmented } from "@ondo/ui";
import { useId, useState } from "react";
import { AllocationTable } from "./AllocationTable";
import { METHOD_LABEL, PAYER_LABEL } from "../constants";
import {
  allocationTargets,
  allocationTotal,
  autoAllocate,
  clampAllocation,
  orderReceivable,
  parseNumberInput,
} from "../derive";
import type {
  AllocationEntry,
  DepositDraft,
  DepositMode,
  PayerType,
  PaymentMethod,
  SettlementOrder,
  TradeRelation,
} from "../types";
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
export function DepositFormPanel({
  relation,
  orders,
  onSubmit,
}: {
  relation: TradeRelation;
  /** 이 거래처의 주문 전량. 배분 표는 그중 미수가 남은 것만 고른다 */
  orders: readonly SettlementOrder[];
  /** 실행은 서버가 없어 호출부의 로컬 상태로 반영된다 */
  onSubmit: (
    mode: DepositMode,
    draft: DepositDraft,
    allocations: AllocationEntry[],
  ) => void;
}) {
  /* 입력칸은 문자열로 들고 있는다 — 빈칸과 0을 구분해야 해서 숫자로 바로 못 바꾼다 */
  const [amountRaw, setAmountRaw] = useState("");
  const [receivedAt, setReceivedAt] = useState("");
  const [payerType, setPayerType] = useState<PayerType>("retailer");
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [memo, setMemo] = useState("");
  /**
   * 사람이 직접 고친 배분액만 담는다. 손대지 않은 행은 자동 배분값을 그대로 쓴다 —
   * 전부 상태로 들고 있으면 입금액이 바뀔 때 어느 값이 자동이고 어느 값이 사람 것인지
   * 구분할 수 없다.
   */
  const [editedAllocations, setEditedAllocations] = useState<
    Record<string, number>
  >({});

  const amountId = useId();
  const receivedAtId = useId();
  const memoId = useId();

  const amount = parseNumberInput(amountRaw);

  const targets = allocationTargets(orders);
  const auto = autoAllocate(targets, amount ?? 0);
  const allocations = Object.fromEntries(
    targets.map((order) => [
      order.id,
      editedAllocations[order.id] ?? auto[order.id] ?? 0,
    ]),
  );
  const total = allocationTotal(allocations);

  /** 입금액이 바뀌면 자동 배분을 다시 계산해야 하므로 사람이 고친 값도 함께 지운다 */
  const changeAmount = (raw: string) => {
    setAmountRaw(raw);
    setEditedAllocations({});
  };

  /** 입금액을 안 적었거나 0이면 기록할 사실이 없다 — 두 버튼 모두 잠근다 */
  const canSubmit = amount !== null && amount > 0;
  /** 배분이 입금액과 딱 맞을 때만 정산까지 간다. 미달·초과는 `입금만 진행`으로 남긴다 */
  const canSettle = canSubmit && total === amount;

  const submit = (mode: DepositMode) => {
    if (!canSubmit) return;
    onSubmit(
      mode,
      { amount, receivedAt, payerType, method, memo },
      Object.entries(allocations).map(([orderId, value]) => ({
        orderId,
        amount: value,
      })),
    );
  };

  const changeAllocation = (orderId: string, raw: string) => {
    const order = targets.find((o) => o.id === orderId);
    if (!order) return;
    const parsed = parseNumberInput(raw) ?? 0;
    setEditedAllocations((prev) => ({
      ...prev,
      [orderId]: clampAllocation(parsed, orderReceivable(order)),
    }));
  };

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
              /* placeholder를 두지 않는다 — 흐린 `0`이 적어 둔 0과 헷갈린다 */
              /* 화면에는 콤마가 붙은 값이 보이고 상태에는 숫자만 남는다 */
              value={amount === null ? "" : formatNumber(amount)}
              onChange={(e) => changeAmount(e.target.value)}
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
              {/* 우측 패널이 512px이라 칸 폭이 Figma(264px)보다 좁다.
                  좌우 여백을 줄여 `사입삼촌 대납`이 두 줄로 접히지 않게 한다 */}
              <Segmented.Item
                value="retailer"
                className="px-2 whitespace-nowrap"
              >
                {PAYER_LABEL.retailer}
              </Segmented.Item>
              <Segmented.Item
                value="purchasingAgent"
                className="px-2 whitespace-nowrap"
              >
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
              <Segmented.Item value="cash" className="px-2 whitespace-nowrap">
                {METHOD_LABEL.cash}
              </Segmented.Item>
              <Segmented.Item
                value="bankTransfer"
                className="px-2 whitespace-nowrap"
              >
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

        <hr className="border-border mt-1 mb-6" />

        <Panel.Section title="주문별 배분" className="mt-0">
          <AllocationTable
            targets={targets}
            values={allocations}
            disabled={amount === null}
            onChange={changeAllocation}
          />

          {/* 요약 줄. 합계가 입금액을 넘으면 숫자가 경고 색이 된다 —
              미달은 허용한다(그때는 `입금 및 정산`만 막힌다) */}
          {targets.length > 0 ? (
            <div className="mt-3 flex items-baseline justify-end gap-3 text-sm">
              <span className="text-muted-foreground">입금액</span>
              <span className="text-primary font-medium tabular-nums">
                {formatNumber(amount ?? 0)}
              </span>
              <span className="text-border-strong">|</span>
              <span className="text-muted-foreground">배분 합계</span>
              <span
                className={`text-base font-medium tabular-nums ${
                  amount !== null && total > amount ? "text-destructive" : ""
                }`}
              >
                {formatNumber(total)}
              </span>
            </div>
          ) : null}
        </Panel.Section>
      </Panel.Body>

      {/* 두 버튼은 같은 폭이다. 어느 쪽이 기본인지는 채움/테두리로만 말한다 */}
      <div className="mt-4 flex shrink-0 gap-3">
        <Button
          variant="line"
          className="flex-1"
          disabled={!canSubmit}
          onClick={() => submit("paymentOnly")}
        >
          입금만 진행
        </Button>
        <Button
          className="flex-1"
          disabled={!canSettle}
          onClick={() => submit("settle")}
        >
          입금 및 정산
        </Button>
      </div>
    </Panel>
  );
}
