import { LegStatusBadge } from "./OrderStatusBadge";
import { DETAIL_TEXT } from "../constants";
import { methodLabel } from "../derive";
import type { OrderRecord } from "../types";

/**
 * 도매처별 결제 · 수령 정보. 값은 상세 응답의 도매처 건(`WholesalerOrder`)이다.
 *
 * 수령·결제는 **주문할 때 고른 값**이라 확정 전에도 있다 — fixtures 시절의
 * "확정하면 표시돼요"는 서버 모양에 없다. 대신 도매처 건의 상태(도매가 준 라벨
 * 그대로)를 옆에 세운다 — 요약 응답에 없어서 목록 펼침에서 사라진 값이 여기 있다.
 *
 * 주소는 라인 표와 **같은 도매처 건**에서 온다. 전화·영업시간은 스펙에 없다
 * (`04-wire.md` §3) — 그 자리를 비운다.
 */
export function PaymentPickupPanel({ order }: { order: OrderRecord }) {
  return (
    <>
      {order.legs.map((leg) => (
        <section
          key={leg.wholesaleOrderId}
          aria-label={`${leg.wholesalerName} 결제·수령`}
          className="border-border bg-accent text-body mt-3 flex flex-wrap items-center gap-x-2.5 gap-y-1 rounded-control border px-3.5 py-2.5 first:mt-0"
        >
          <h3 className="text-sm font-medium">{leg.wholesalerName}</h3>
          <LegStatusBadge statusKey={leg.statusKey} label={leg.statusLabel} />
          {leg.wholesalerLocation !== "" ? (
            <span className="text-muted-foreground min-w-0">
              {leg.wholesalerLocation}
            </span>
          ) : null}
          <span className="text-muted-foreground tabular-nums">
            {DETAIL_TEXT.legNo(leg.legNo)}
          </span>

          {/* 취소된 건에 수령·결제를 남기지 않는다 — 영영 쓰지 않을 값이라
              사장이 기다리게 된다(F3) */}
          <span className="text-muted-foreground ml-auto phone:ml-0">
            {leg.canceled
              ? DETAIL_TEXT.legCanceled
              : methodLabel(leg.pickup, leg.payment)}
          </span>
        </section>
      ))}
    </>
  );
}
