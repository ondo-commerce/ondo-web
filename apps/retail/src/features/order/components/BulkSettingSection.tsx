"use client";

import { Button } from "@ondo/ui";
import { MethodSelect, SetRow, SetRowGrid } from "./MethodSelect";
import {
  CHECKOUT_TEXT,
  PAYMENT_LABEL,
  PICKUP_LABEL,
  bulkAppliedNotice,
  bulkOverwriteHint,
} from "../constants";
import type { PaymentMethod, PickupMethod } from "../types";

/** 드롭다운 항목. 라벨을 컴포넌트에 적지 않고 상수 표에서 만든다 */
export const PICKUP_OPTIONS = (Object.keys(PICKUP_LABEL) as PickupMethod[]).map(
  (value) => ({ value, label: PICKUP_LABEL[value] }),
);

export const PAYMENT_OPTIONS = (
  Object.keys(PAYMENT_LABEL) as PaymentMethod[]
).map((value) => ({ value, label: PAYMENT_LABEL[value] }));

/**
 * `일괄 설정` 섹션 — 수령·결제를 한 번에 정하고 `전체 적용`으로 전부 되돌린다.
 *
 * **`전체 적용`은 누르기 전과 누른 뒤에 다른 말을 한다.**
 * 앞에는 예고(`개별로 정한 2곳도 일괄 설정으로 돌아가요`), 뒤에는 결과
 * (`2곳을 일괄 설정으로 맞췄어요`). 직전 회차에서 아직 안 한 일을 완료형으로
 * 말하는 화면이 결함으로 잡혔다 — 되돌릴 수 없는 일괄 실행이라 더 그렇다.
 *
 * 적용 대상은 화면에 보이는 상자가 아니라 **주문 대상 목록**에서 나온다
 * (`store.applyBulkToAll`). 접혀 있거나 스크롤 밖에 있는 도매처도 같이 바뀐다.
 */
export function BulkSettingSection({
  pickup,
  payment,
  overriddenCount,
  appliedCount,
  onChangePickup,
  onChangePayment,
  onApply,
}: {
  pickup: PickupMethod;
  payment: PaymentMethod;
  /** 지금 개별로 정해 둔 도매처 수. 0이면 `전체 적용`이 되돌릴 것이 없다 */
  overriddenCount: number;
  /** 방금 되돌린 도매처 수. null이면 아직 누른 적이 없다 */
  appliedCount: number | null;
  onChangePickup: (next: PickupMethod) => void;
  onChangePayment: (next: PaymentMethod) => void;
  onApply: () => void;
}) {
  return (
    <section className="mt-6 first:mt-0">
      <h3 className="text-muted-foreground text-body mb-2.5">
        {CHECKOUT_TEXT.bulkSection}
      </h3>

      <div className="border-border rounded-control border p-3.5">
        <SetRowGrid>
          <SetRow label="수령 방법">
            <MethodSelect
              value={pickup}
              options={PICKUP_OPTIONS}
              ariaLabel="수령 방법 일괄 설정"
              onChange={(next) => onChangePickup(next as PickupMethod)}
            />
          </SetRow>
          <SetRow label="결제 방법">
            <MethodSelect
              value={payment}
              options={PAYMENT_OPTIONS}
              ariaLabel="결제 방법 일괄 설정"
              onChange={(next) => onChangePayment(next as PaymentMethod)}
            />
          </SetRow>
        </SetRowGrid>

        <div className="mt-3 flex flex-wrap items-center justify-end gap-x-3 gap-y-1.5">
          {/* 무엇이 덮이는지 **누르기 전에** 버튼 옆에 있다 */}
          {overriddenCount > 0 ? (
            <span className="text-muted-foreground text-body">
              {bulkOverwriteHint(overriddenCount)}
            </span>
          ) : null}
          <Button variant="line" size="sm" onClick={onApply}>
            {CHECKOUT_TEXT.bulkApply}
          </Button>
        </div>

        {/* 누른 뒤의 결과. 예고와 자리를 나눠 둬야 둘이 서로를 덮지 않는다 */}
        <p
          role="status"
          className="text-secondary-foreground text-body mt-1.5 text-right empty:hidden"
        >
          {appliedCount === null ? "" : bulkAppliedNotice(appliedCount)}
        </p>
      </div>
    </section>
  );
}
