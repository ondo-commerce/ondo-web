import { DETAIL_TEXT } from "../constants";
import { methodLabel } from "../derive";
import type { OrderRecord } from "../types";

/**
 * 도매처별 결제 · 수령 정보.
 *
 * **확정 전 도매처도 여기 선다**(가정 A5-d). 원본은 3곳 중 2곳만 그려서, 아직
 * 확정 안 된 도매처가 조용히 빠져 있었다 — 사장이 자기 주문의 도매처 하나를
 * 잃어버린다. 값이 없다는 사실을 "도매처가 확정하면 여기에 표시돼요"로 말한다.
 *
 * 주소는 라인 표와 **같은 도매처 건**에서 온다. 원본은 이 자리와 라인 표가
 * 서로 다른 주소를 적고 있었다(가정 A5-e).
 */
export function PaymentPickupPanel({ order }: { order: OrderRecord }) {
  return (
    <>
      {order.legs.map((leg) => (
        <section
          key={leg.wholesalerId}
          aria-label={`${leg.wholesalerName} 결제·수령`}
          className="border-border bg-accent text-body mt-3 flex flex-wrap items-center gap-x-2.5 gap-y-1 rounded-control border px-3.5 py-2.5 first:mt-0"
        >
          <h3 className="text-sm font-medium">{leg.wholesalerName}</h3>
          <span className="text-muted-foreground min-w-0">
            {leg.wholesalerLocation} · {leg.phone} · {leg.businessHours}
          </span>

          {/* 취소된 건에 `확정하면 표시돼요`를 남기지 않는다 — 영영 오지 않을
              말이라 사장이 기다리게 된다(F3) */}
          <span className="text-muted-foreground ml-auto phone:ml-0">
            {leg.canceled
              ? DETAIL_TEXT.legCanceled
              : leg.pickup && leg.payment
                ? methodLabel(leg.pickup, leg.payment)
                : DETAIL_TEXT.notConfirmed}
          </span>
        </section>
      ))}
    </>
  );
}
