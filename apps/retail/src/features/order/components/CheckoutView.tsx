"use client";

import { Button, Notice, Panel } from "@ondo/ui";
import { Info } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  BulkSettingSection,
  PAYMENT_OPTIONS,
  PICKUP_OPTIONS,
} from "./BulkSettingSection";
import { BankAccountRow } from "./BankAccountRow";
import { CheckoutSummaryBar } from "./CheckoutSummaryBar";
import { MethodSelect, SetRow, SetRowGrid } from "./MethodSelect";
import { PaymentSummary } from "./PaymentSummary";
import { PickupContactSection } from "./PickupContactSection";
import { WholesalerOrderCard } from "./WholesalerOrderCard";
import {
  CHECKOUT_EMPTY,
  CHECKOUT_TEXT,
  PAYMENT_LABEL,
  PICKUP_LABEL,
  SCENARIO_NOTICE,
} from "../constants";
import {
  acceptedLineIds,
  checkoutBlockedReason,
  groupByWholesaler,
  needsAgent,
  overriddenWholesalers,
  resolvePayment,
  totalsOf,
} from "../derive";
import {
  applyBulkToAll,
  setAgentName,
  setAgentPhone,
  setBulkPayment,
  setBulkPickup,
  setPaymentChoice,
  setPickupChoice,
  submitOrder,
  useCheckoutSetting,
} from "../store";
import type {
  CheckoutLine,
  OrderScenario,
  PaymentChoice,
  PickupChoice,
} from "../types";

/**
 * 주문서 한 장.
 *
 * **담긴 목록을 이 화면이 직접 읽지 않는다.** 장바구니는 다른 feature라
 * `app/(shop)/checkout`이 조립해서 `lines`로 넘겨 준다(가정 A10) — 헤더 뱃지를
 * `app/(shop)/layout.tsx`가 끼워 넣는 것과 같은 방식이고, import 방향
 * (`app → features → shared`)이 한 방향으로 남는다.
 *
 * 반대로 **수령·결제·사입삼촌은 이 feature의 스토어가 들고 있다.** 화면이
 * `useState`로 들면 `/cart`에 갔다 오는 순간 고른 값이 통째로 버려지고
 * (반복결함 `state-loss`), 완료 화면이 그 값을 못 읽어서 자기 더미를 갖게 된다.
 *
 * 화면에 뜨는 금액·장수·건수는 전부 `derive.ts`에서 나온다. 도매처 상자 머리 ·
 * 결제 요약 · 합계 바가 같은 `totalsOf`를 부르므로 세 자리가 갈릴 수 없다.
 */
export function CheckoutView({
  lines,
  scenario,
  onAccepted,
}: {
  /** 장바구니에서 **고른 것만**. 선택을 푼 조합은 여기 오지 않는다 */
  lines: readonly CheckoutLine[];
  /** 접수 결과를 무엇으로 그릴지. 주소 쿼리에서만 온다 */
  scenario: OrderScenario;
  /** 접수된 조합의 lineId. 장바구니 정리는 조립부가 한다 */
  onAccepted: (lineIds: readonly string[]) => void;
}) {
  const router = useRouter();
  const setting = useCheckoutSetting();

  const groups = groupByWholesaler(lines);
  const totals = totalsOf(lines);
  const overridden = overriddenWholesalers(
    groups,
    setting.pickupOverrides,
    setting.paymentOverrides,
  );
  const agentRequired = needsAgent(
    groups,
    setting.pickupOverrides,
    setting.bulkPickup,
  );
  const blockedReason = checkoutBlockedReason({
    lines,
    agentRequired,
    agentName: setting.agentName,
    agentPhone: setting.agentPhone,
  });

  const handleSubmit = () => {
    const receipt = submitOrder({ groups, scenario });
    const query = scenario === "default" ? "" : `?scenario=${scenario}`;

    router.push(`/checkout/complete${query}`);
    /* 접수된 도매처의 조합만 장바구니에서 뺀다. 접수가 안 된 도매처의 조합은
       남아 있어야 `장바구니에서 보기`가 거짓말이 되지 않는다(RT-44) */
    onAccepted(acceptedLineIds(receipt));
  };

  return (
    <div className="mx-auto max-w-wrap">
      <Panel>
        <Panel.Title sub={CHECKOUT_TEXT.sub}>{CHECKOUT_TEXT.title}</Panel.Title>

        {/* 확인용 시나리오로 켠 화면이면 그 사실을 먼저 말한다(F10). 기본
            주소에는 이 줄이 없다 — 아무 일도 없는데 안내가 서 있으면 그것도
            거짓말이다 */}
        {scenario === "default" ? null : (
          <Notice className="mb-4">
            <span className="flex items-start gap-2">
              <Info aria-hidden className="mt-0.5 size-4 shrink-0" />
              {SCENARIO_NOTICE}
            </span>
          </Notice>
        )}

        {lines.length === 0 ? (
          <div className="py-16 text-center">
            <h3 className="text-base font-medium">{CHECKOUT_EMPTY.title}</h3>
            <p className="text-muted-foreground text-body mt-1.5">
              {CHECKOUT_EMPTY.description}
            </p>
            <Button asChild variant="line" className="mt-3.5">
              <Link href="/cart">{CHECKOUT_TEXT.backToCart}</Link>
            </Button>
          </div>
        ) : (
          <>
            <BulkSettingSection
              pickup={setting.bulkPickup}
              payment={setting.bulkPayment}
              overriddenCount={overridden.length}
              appliedCount={setting.appliedCount}
              onChangePickup={setBulkPickup}
              onChangePayment={setBulkPayment}
              onApply={() => applyBulkToAll(groups)}
            />

            <section className="mt-6">
              <h3 className="text-muted-foreground text-body mb-2.5">
                {CHECKOUT_TEXT.wholesalerSection}{" "}
                <span className="text-muted-foreground">{groups.length}곳</span>
              </h3>

              {groups.map((group) => {
                const pickupChoice: PickupChoice =
                  setting.pickupOverrides[group.wholesalerId] ?? "BULK";
                const paymentChoice: PaymentChoice =
                  setting.paymentOverrides[group.wholesalerId] ?? "BULK";
                const payment = resolvePayment(
                  paymentChoice,
                  setting.bulkPayment,
                );

                return (
                  <WholesalerOrderCard key={group.wholesalerId} group={group}>
                    <SetRowGrid>
                      <SetRow label="수령">
                        <MethodSelect
                          value={pickupChoice}
                          options={PICKUP_OPTIONS}
                          followLabel={PICKUP_LABEL[setting.bulkPickup]}
                          ariaLabel={`${group.wholesalerName} 수령 방법`}
                          onChange={(next) =>
                            setPickupChoice(
                              group.wholesalerId,
                              next as PickupChoice,
                            )
                          }
                        />
                      </SetRow>
                      <SetRow label="결제">
                        <MethodSelect
                          value={paymentChoice}
                          options={PAYMENT_OPTIONS}
                          followLabel={PAYMENT_LABEL[setting.bulkPayment]}
                          ariaLabel={`${group.wholesalerName} 결제 방법`}
                          onChange={(next) =>
                            setPaymentChoice(
                              group.wholesalerId,
                              next as PaymentChoice,
                            )
                          }
                        />
                      </SetRow>
                    </SetRowGrid>

                    {/* 계좌 이체를 고른 도매처에만 붙는다. 현금으로 바꾸면 사라진다 */}
                    {payment === "TRANSFER" ? (
                      <BankAccountRow
                        wholesalerName={group.wholesalerName}
                        amount={totalsOf(group.lines).amount}
                      />
                    ) : null}
                  </WholesalerOrderCard>
                );
              })}

              <p className="text-muted-foreground mt-2.5 text-xs">
                {CHECKOUT_TEXT.readOnlyHint}
              </p>
            </section>

            <PickupContactSection
              required={agentRequired}
              name={setting.agentName}
              phone={setting.agentPhone}
              onChangeName={setAgentName}
              onChangePhone={setAgentPhone}
            />

            <PaymentSummary totals={totals} wholesalerCount={groups.length} />
          </>
        )}

        <CheckoutSummaryBar
          amount={totals.amount}
          blockedReason={blockedReason}
          onSubmit={handleSubmit}
        />
      </Panel>
    </div>
  );
}
