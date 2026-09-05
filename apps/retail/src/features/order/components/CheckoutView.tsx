"use client";

import { Button, Notice, Panel } from "@ondo/ui";
import { Info } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
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
  describeOrderError,
  useOrderBusy,
  usePlaceOrderMutation,
} from "../api/mutations";
import {
  BANK_UNREGISTERED,
  CHECKOUT_EMPTY,
  CHECKOUT_TEXT,
  ORDER_PATH,
  PAYMENT_LABEL,
  PICKUP_LABEL,
  PLACE_FAILED,
} from "../constants";
import {
  checkoutBlockedReason,
  needsAgent,
  overriddenWholesalers,
  rejectedLegsOf,
  resolvePayment,
  toPlaceOrderRequest,
  totalsOf,
} from "../derive";
import {
  applyBulkToAll,
  rememberPlaced,
  setAgentName,
  setAgentPhone,
  setBulkPayment,
  setBulkPickup,
  setPaymentChoice,
  setPickupChoice,
  useCheckoutSetting,
} from "../store";
import type { CheckoutGroup, PaymentChoice, PickupChoice } from "../types";

/**
 * 주문서 한 장.
 *
 * **담긴 목록은 서버(`GET /checkout?cartItemIds=`)에서 온다.** 장바구니 화면이
 * 고른 `cartItemId`를 주소에 실어 넘기고, `app/(shop)/checkout/page.tsx`가 받아
 * `groups`로 넘긴다. 단가도 그 응답에서 다시 받은 값이다(스펙).
 *
 * 반대로 **수령·결제·사입삼촌은 이 feature의 스토어가 들고 있다.** 화면이
 * `useState`로 들면 `/cart`에 갔다 오는 순간 고른 값이 통째로 버려진다
 * (반복결함 `state-loss`).
 *
 * 화면에 뜨는 금액·장수·건수는 전부 `derive.ts`에서 나온다. 도매처 상자 머리 ·
 * 결제 요약 · 합계 바가 같은 `totalsOf`를 부르므로 세 자리가 갈릴 수 없다.
 */
export function CheckoutView({ groups }: { groups: readonly CheckoutGroup[] }) {
  const router = useRouter();
  const setting = useCheckoutSetting();
  const place = usePlaceOrderMutation();
  /**
   * 요청이 나가 있는 동안 **그리고 성공한 뒤에도** 잠근다. 응답이 오면
   * `useIsMutating`은 바로 0이 되는데 `router.replace`가 완료 화면(RSC)을 받아
   * 그리기까지 한 박자가 있다 — 그 사이 `주문 접수하기`가 다시 눌렸다(wire 회차 F4).
   * 되돌릴 수 없는 버튼은 누를 수 있는 순간이 한 번뿐이어야 한다. 접수된 주문서는
   * 어차피 이 화면을 떠나므로 `isSuccess`가 한 번 켜지면 다시 열 일이 없다.
   */
  const busy = useOrderBusy() || place.isSuccess;
  const [failure, setFailure] = useState<string | null>(null);
  /**
   * 멱등키. **주문서를 연 순간 한 번 만들고 다시 시도해도 같은 키**다 — 연타나
   * 실패 뒤 재시도로 같은 주문서가 두 번 접수되지 않는다(스펙: 같은 키로 다시
   * 오면 처음 결과를 돌려준다). 화면을 나갔다 오면 새 주문서라 새 키다.
   */
  const [idempotencyKey] = useState(() => crypto.randomUUID());

  const lines = groups.flatMap((group) => group.lines);
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
    lineCount: lines.length,
    agentRequired,
    agentName: setting.agentName,
    agentPhone: setting.agentPhone,
  });

  const handleSubmit = () => {
    setFailure(null);
    place.mutate(
      { body: toPlaceOrderRequest(groups, setting), idempotencyKey },
      {
        onSuccess: (result) => {
          /* 안 된 도매처는 주문에 없어서 상세 응답에 안 온다 — 완료 화면이 모달을
             띄울 수 있게 세션에 남기고 간다 */
          rememberPlaced(result.orderId, rejectedLegsOf(result, groups));
          /* `push`가 아니라 `replace`다. 뒤로 가기가 접수 끝난 주문서로 돌아오면
             사장이 같은 주문서를 한 번 더 접수한다 */
          router.replace(ORDER_PATH.complete(result.orderId));
          /* 헤더 뱃지(`GET /cart-items/count`)가 접수된 만큼 줄어야 한다 */
          router.refresh();
        },
        onError: (error) => setFailure(describeOrderError(error, PLACE_FAILED)),
      },
    );
  };

  return (
    <div className="mx-auto max-w-wrap">
      <Panel>
        <Panel.Title sub={CHECKOUT_TEXT.sub}>{CHECKOUT_TEXT.title}</Panel.Title>

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
                const bankRegistered = group.bank !== null;
                const pickupChoice: PickupChoice =
                  setting.pickupOverrides[group.wholesalerId] ?? "BULK";
                const paymentChoice: PaymentChoice =
                  setting.paymentOverrides[group.wholesalerId] ?? "BULK";
                const payment = resolvePayment(
                  paymentChoice,
                  setting.bulkPayment,
                  bankRegistered,
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
                        {/* 계좌 미등록 도매처는 **현금뿐**이다(스펙). 드롭다운을 잠그고
                            이유를 옆에 둔다 — 고를 수 없는 항목을 보여 주지 않는다 */}
                        {bankRegistered ? (
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
                        ) : (
                          <p className="text-body">
                            {PAYMENT_LABEL.CASH}{" "}
                            <span className="text-muted-foreground">
                              · {BANK_UNREGISTERED}
                            </span>
                          </p>
                        )}
                      </SetRow>
                    </SetRowGrid>

                    {/* 계좌 이체를 고른 도매처에만 붙는다. 현금으로 바꾸면 사라진다 */}
                    {payment === "BANK_TRANSFER" && group.bank !== null ? (
                      <BankAccountRow
                        wholesalerName={group.wholesalerName}
                        bank={group.bank}
                        amount={totalsOf(group.lines).amount}
                      />
                    ) : null}
                  </WholesalerOrderCard>
                );
              })}

              <p className="text-muted-foreground mt-2.5 text-xs">
                {CHECKOUT_TEXT.readOnlyHint} {CHECKOUT_TEXT.repriced}
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

        {/* 접수 요청이 안 갔을 때. 되돌릴 수 없는 실행이라 결과가 조용히 사라지면
            사장이 다시 눌러 두 번 접수한다 — 멱등키가 막지만 사실은 말해야 한다 */}
        {failure ? (
          <Notice className="mt-4">
            <span role="alert" className="flex items-start gap-2">
              <Info aria-hidden className="mt-0.5 size-4 shrink-0" />
              {failure}
            </span>
          </Notice>
        ) : null}

        <CheckoutSummaryBar
          amount={totals.amount}
          blockedReason={blockedReason}
          busy={busy}
          onSubmit={handleSubmit}
        />
      </Panel>
    </div>
  );
}
