"use client";

import { Button, FormField, Input, Notice, Panel, Segmented } from "@ondo/ui";
import { useId, useState } from "react";
import { AllocationTable } from "./AllocationTable";
import { useCreatePaymentMutation } from "../api/mutations";
import { DEPOSIT_FIELDS, METHOD_LABEL, PAYER_LABEL } from "../constants";
import {
  allocationGapText,
  allocationIssues,
  allocationTargets,
  allocationTotal,
  depositErrorText,
  formatAmountInput,
  formatInputDateTime,
  noticeText,
  parseNumberInput,
  parsePaidAt,
  resolveAllocations,
  retailerLabel,
  toAmountDigits,
  toPaymentRequest,
} from "../derive";
import type {
  DepositDraft,
  DepositMode,
  OrderRowView,
  PayerType,
  PaymentCreated,
  PaymentMethod,
  RetailerView,
  SettlementNotice,
} from "../types";
import { toFieldErrors, type FormErrors } from "@/shared/api/fieldErrors";
import { NumericInput } from "@/shared/components/NumericInput";
import { formatNumber } from "@/shared/lib/format";
import {
  exceedsNumericMax,
  NUMERIC_INPUT_MAX_TEXT,
} from "@/shared/lib/numericInput";

type DepositField = (typeof DEPOSIT_FIELDS)[number];

/**
 * 우측 패널 — 통장에 찍힌 입금 한 건을 그대로 옮겨 적는 자리(`POST /payments`).
 *
 * 제목 아래에 **대상 거래처를 적는다.** Figma에는 없지만(01-pm.md §5 Q6),
 * 좌측에서 펼친 거래처가 곧 이 패널의 대상이라 화면에 그 이름이 없으면
 * 엉뚱한 거래처에 입금을 붙여도 알아챌 방법이 없다.
 *
 * 폼 상태(`draft`)는 **부모가 소매처별로 든다** — 행을 접었다 펴도, 다른 소매처를 봤다 와도 적던 값이 남는다(⑥).
 * 입력이 바뀔 때마다 부모가 `Idempotency-Key`를 새로 만든다. 같은 입력의 재전송은 같은 키다.
 *
 * 배분 표의 주문은 **좌측 펼침 본문이 받은 것**을 그대로 쓴다(`orders`). 이 패널이 같은 쿼리를 따로 들면
 * 경계가 둘이 된다(wire-order F6). 못 받았으면(`null`) 배분은 잠그고 `입금만 진행`만 열어 둔다.
 */
export function DepositFormPanel({
  retailer,
  orders,
  draft,
  onDraftChange,
  inList,
  stale,
  notice,
  onRefresh,
  onDone,
}: {
  retailer: RetailerView;
  /** 이 거래처의 확정 주문. 좌측 펼침 본문이 넘긴다. 아직 못 받았으면 null */
  orders: readonly OrderRowView[] | null;
  draft: DepositDraft;
  /** 부모가 병합하고 키를 새로 만든다. `keepKey`면 키를 유지한다(제출 시각 굳히기) */
  onDraftChange: (
    patch: Partial<DepositDraft>,
    options?: { keepKey?: boolean },
  ) => void;
  /** 이 거래처가 지금 좌측 목록 조건(검색) 안에 있는가. 없어도 패널은 남고 그 사실을 말한다(⑨) */
  inList: boolean;
  /** 직전 입금 뒤 재조회가 실패한 상태. 옛 숫자로 한 번 더 입금하지 않게 잠근다(⑦) */
  stale: boolean;
  /** 직전 입금 결과. 패널이 열려 있으면 여기, 아니면 빈 자리에서 보인다 */
  notice: SettlementNotice | null;
  onRefresh: () => void;
  onDone: (created: PaymentCreated, refreshed: boolean) => void;
}) {
  /* 보내기 전에 화면이 잡은 오류(입금 일시 형식). 서버 오류와 같은 모양으로 칸에 붙인다 */
  const [localErrors, setLocalErrors] = useState<FormErrors<DepositField>>({});
  const create = useCreatePaymentMutation({ onDone });

  const amountId = useId();
  const receivedAtId = useId();
  const memoId = useId();

  const amount = parseNumberInput(draft.amountRaw);
  /* 상한을 넘긴 입금액. 칸은 빨갛게, 라벨 아래 한 줄, 두 버튼 다 잠근다(#199) */
  const amountOverMax = exceedsNumericMax(draft.amountRaw);
  const targets = allocationTargets(orders ?? []);
  const allocations = resolveAllocations(
    targets,
    draft.editedAllocations,
    amount,
  );
  const total = allocationTotal(allocations);
  /* 상한(미수·남은 입금액)을 넘긴 행마다 이유 한 줄. 값을 자르지 않고 말한다(#207 F4) */
  const issues = allocationIssues(targets, allocations, amount);
  const hasIssue = Object.keys(issues).length > 0;
  const gapText = allocationGapText(amount, total);
  /* 합계가 입금액을 넘긴 상태. 요약 숫자와 아래 한 줄을 빨갛게 — 미달은 허용이라 회색이다 */
  const overAllocated = amount !== null && total > amount;

  /* 서버 오류: `VALIDATION_FAILED`는 칸으로, 정책·상태 오류(400 코드·409·404·5xx)는 버튼 위 한 줄 */
  const serverErrors = create.error
    ? toFieldErrors(create.error, DEPOSIT_FIELDS)
    : null;
  const errors: FormErrors<DepositField> = { ...serverErrors, ...localErrors };
  const formError =
    create.error && !serverErrors
      ? depositErrorText(create.error)
      : (errors._form ?? errors.retailerId ?? errors.allocations ?? null);

  /** 입력이 바뀌면 직전 거절 문구는 할 일을 다 했다 */
  const change = (patch: Partial<DepositDraft>) => {
    setLocalErrors({});
    if (create.error) create.reset();
    onDraftChange(patch);
  };

  /**
   * 입금액이 바뀌어도 사람이 고친 행은 **지우지 않는다**(#207 F5). 자동 행만 남은 입금액으로 다시 계산되고,
   * 새 입금액 안에 못 드는 손댄 행은 칸이 빨개지며 얼마까지인지 말한다 — 조용히 37,500으로 되돌리면
   * 한 글자 수정에 맞춰 둔 배분이 통째로 날아간다.
   */
  const changeAmount = (raw: string) => {
    change({ amountRaw: toAmountDigits(raw) });
  };

  /** 친 값을 그대로 든다. 상한은 자르지 않고 `issues`가 행 아래에서 말한다(#207 F4) */
  const changeAllocation = (orderId: number, raw: string) => {
    if (!targets.some((o) => o.id === orderId)) return;
    change({
      editedAllocations: {
        ...draft.editedAllocations,
        [orderId]: parseNumberInput(raw) ?? 0,
      },
    });
  };

  const busy = create.isPending;
  /** 입금액을 안 적었거나 0이면 기록할 사실이 없다 — 두 버튼 모두 잠근다. 옛 숫자(`stale`)로도 안 보낸다 */
  const canSubmit =
    amount !== null && amount > 0 && !amountOverMax && !busy && !stale;
  /** 배분이 상한 안이고 입금액과 딱 맞을 때만 정산까지 간다. 미달·초과는 `입금만 진행`으로 남긴다 */
  const canSettle =
    canSubmit &&
    orders !== null &&
    targets.length > 0 &&
    !hasIssue &&
    total === amount;

  const submit = (mode: DepositMode) => {
    if (amount === null || !canSubmit) return;
    // 실행 시각은 렌더가 아니라 버튼을 누른 이 순간에만 읽는다
    const now = new Date();
    const paidAt = parsePaidAt(draft.receivedAt, now);
    if (paidAt === null) {
      setLocalErrors({
        paidAt: "입금 일시는 2025-08-14 15:30 형식으로 적어 주세요",
      });
      return;
    }
    // 빈칸이었으면 지금 시각을 칸에 굳힌다 — 재전송 때 시각이 바뀌면 같은 키에 다른 본문이 된다.
    // 굳힌 문자열과 위 `paidAt`은 같은 분(分) 단위 값이다(`parsePaidAt`이 빈칸을 같은 형식으로 거친다, #207 F2)
    if (draft.receivedAt.trim() === "") {
      onDraftChange(
        { receivedAt: formatInputDateTime(now) },
        { keepKey: true },
      );
    }
    create.mutate({
      body: toPaymentRequest(
        retailer.id,
        draft,
        amount,
        paidAt,
        mode,
        allocations,
      ),
      idempotencyKey: draft.idempotencyKey,
    });
  };

  return (
    <Panel className="flex-1">
      <Panel.Title sub={retailerLabel(retailer.name, retailer.code)}>
        입금 등록
      </Panel.Title>

      <Panel.Body>
        {/* 검색으로 목록에서 빠진 거래처. 패널을 지우지 않고 알린다 — 지우면 검색 중엔 입금을 못 한다(#198 판정) */}
        {!inList ? (
          <Notice className="mb-4">
            현재 목록 조건에 없는 거래처예요. 입금은 이 거래처에 붙어요.
          </Notice>
        ) : null}

        {/* 2열 그리드. 세로 간격은 FormField가 이미 갖고 있어 가로만 준다 */}
        <div className="grid grid-cols-2 gap-x-4">
          <FormField
            label="입금액"
            htmlFor={amountId}
            hint={
              errors.amount ??
              (amountOverMax ? NUMERIC_INPUT_MAX_TEXT : undefined)
            }
          >
            <NumericInput
              id={amountId}
              aria-invalid={errors.amount !== undefined || amountOverMax}
              /* placeholder를 두지 않는다 — 흐린 `0`이 적어 둔 0과 헷갈린다 */
              /* 화면에는 콤마가 붙은 값이 보이고 상태에는 숫자만 남는다 */
              value={formatAmountInput(draft.amountRaw)}
              onChange={(e) => changeAmount(e.target.value)}
              disabled={busy}
            />
          </FormField>

          <FormField
            label="입금 일시"
            htmlFor={receivedAtId}
            hint={errors.paidAt}
          >
            {/* Figma가 텍스트 한 줄이라 날짜 피커를 두지 않는다. 빈칸이면 버튼을 누른 시각 */}
            <Input
              id={receivedAtId}
              placeholder="2025-08-14 15:30"
              aria-invalid={errors.paidAt !== undefined}
              value={draft.receivedAt}
              onChange={(e) => change({ receivedAt: e.target.value })}
              disabled={busy}
            />
          </FormField>

          <FormField label="결제 주체" hint={errors.paidBy}>
            <Segmented
              className="w-full"
              value={draft.payerType}
              onValueChange={(value) =>
                change({ payerType: value as PayerType })
              }
              aria-label="결제 주체"
            >
              {/* 우측 패널이 512px이라 칸 폭이 Figma(264px)보다 좁다.
                  좌우 여백을 줄여 `사입삼촌 대납`이 두 줄로 접히지 않게 한다 */}
              <Segmented.Item
                value="RETAILER"
                className="px-2 whitespace-nowrap"
              >
                {PAYER_LABEL.RETAILER}
              </Segmented.Item>
              <Segmented.Item value="AGENT" className="px-2 whitespace-nowrap">
                {PAYER_LABEL.AGENT}
              </Segmented.Item>
            </Segmented>
          </FormField>

          <FormField label="입금 방식" hint={errors.method}>
            <Segmented
              className="w-full"
              value={draft.method}
              onValueChange={(value) =>
                change({ method: value as PaymentMethod })
              }
              aria-label="입금 방식"
            >
              <Segmented.Item value="CASH" className="px-2 whitespace-nowrap">
                {METHOD_LABEL.CASH}
              </Segmented.Item>
              <Segmented.Item
                value="BANK_TRANSFER"
                className="px-2 whitespace-nowrap"
              >
                {METHOD_LABEL.BANK_TRANSFER}
              </Segmented.Item>
            </Segmented>
          </FormField>

          <FormField label="메모" htmlFor={memoId} hint={errors.memo}>
            <Input
              id={memoId}
              placeholder="8월 정산금 납부"
              value={draft.memo}
              onChange={(e) => change({ memo: e.target.value })}
              disabled={busy}
            />
          </FormField>
        </div>

        <hr className="border-border mt-1 mb-6" />

        <Panel.Section title="주문별 배분" className="mt-0">
          {orders === null ? (
            <p className="text-muted-foreground py-8 text-center text-sm">
              좌측에서 거래처를 펼치면 배분할 주문이 보여요
            </p>
          ) : (
            <AllocationTable
              targets={targets}
              values={allocations}
              issues={issues}
              disabled={amount === null || busy}
              onChange={changeAllocation}
            />
          )}

          {/* 요약 줄. 합계가 입금액과 어긋나면 그 아래 한 줄로 방향과 크기를 말한다 —
              미달은 허용(`입금만 진행`), 초과·상한 위반은 `입금 및 정산`이 잠긴다 */}
          {targets.length > 0 ? (
            <>
              <div className="mt-3 flex items-baseline justify-end gap-3 text-sm">
                <span className="text-muted-foreground">입금액</span>
                <span className="text-primary font-medium tabular-nums">
                  {formatNumber(amount ?? 0)}
                </span>
                <span className="text-border-strong">|</span>
                <span className="text-muted-foreground">배분 합계</span>
                <span
                  className={`text-base font-medium tabular-nums ${
                    overAllocated ? "text-destructive-strong" : ""
                  }`}
                >
                  {formatNumber(total)}
                </span>
              </div>
              {gapText ? (
                <p
                  role="status"
                  className={`mt-1 text-right text-xs ${
                    overAllocated
                      ? "text-destructive-strong"
                      : "text-muted-foreground"
                  }`}
                >
                  {gapText}
                </p>
              ) : null}
            </>
          ) : null}
        </Panel.Section>
      </Panel.Body>

      <div className="mt-4 shrink-0">
        {/* 거절 사유·직전 결과·옛 숫자 경고는 버튼 위 한 줄 — 패널 안이다(③) */}
        {formError ? (
          <p role="alert" className="text-destructive-strong mb-3 text-sm">
            {formError}
          </p>
        ) : stale && notice ? (
          <div className="mb-3 flex items-center justify-between gap-3">
            <p role="alert" className="text-destructive-strong text-sm">
              {noticeText(notice)}
            </p>
            <Button type="button" variant="line" size="sm" onClick={onRefresh}>
              다시 불러오기
            </Button>
          </div>
        ) : notice ? (
          <p role="status" className="text-foreground mb-3 text-sm">
            {noticeText(notice)}
          </p>
        ) : null}

        {/* 두 버튼은 같은 폭이다. 어느 쪽이 기본인지는 채움/테두리로만 말한다 */}
        <div className="flex gap-3">
          <Button
            variant="line"
            className="flex-1"
            disabled={!canSubmit}
            onClick={() => submit("paymentOnly")}
          >
            {busy ? "등록 중…" : "입금만 진행"}
          </Button>
          <Button
            className="flex-1"
            disabled={!canSettle}
            onClick={() => submit("settle")}
          >
            {busy ? "등록 중…" : "입금 및 정산"}
          </Button>
        </div>
      </div>
    </Panel>
  );
}
