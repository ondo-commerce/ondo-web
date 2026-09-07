"use client";

import { Button, Panel } from "@ondo/ui";
import { useState } from "react";
import { ShipConfirmDialog } from "./ShipConfirmDialog";
import { useShipOutboundMutation } from "../api/mutations";
import { useOutboundDetailQuery } from "../api/queries";
import { outboundErrorText, toOutboundView } from "../derive";
import { formatNumber } from "@/shared/lib/format";

/**
 * 우측 `포장 상세 (#N)` 패널(`GET /outbounds/{id}`). 물건을 넘기는 순간 여기서 출고로 확정한다.
 *
 * 담긴 품목은 **SKU 단위로 합쳐진 목록**이다(스펙) — 대기 줄과 단위가 다르다.
 * 주문이 둘이어도 같은 SKU면 한 줄이라, 좌측 대기 표와 줄 수가 안 맞아도 틀린 게 아니다.
 *
 * `isShippable`은 버튼 활성 판정일 뿐 성공 보장이 아니다(스펙: 재고 검증이 안 들어 있다) —
 * 409 `INSUFFICIENT_STOCK`은 확정 뒤에 문구로 온다. `Panel`은 부르는 쪽이 그린다.
 */
export function PackageDetailPanel({
  outboundId,
  stale,
  onRefresh,
  onShipped,
}: {
  outboundId: number;
  /** 직전 처리 뒤 목록 재조회가 실패한 상태. 옛 목록의 봉투를 한 번 더 확정하지 않게 잠근다 */
  stale: boolean;
  onRefresh: () => void;
  /** 서버가 확정한 뒤(재조회까지 끝난 뒤). 장끼번호를 넘긴다 — 그 자리에서 보여 주기 위해서다(shipments F9) */
  onShipped: (statementCode: string, refreshed: boolean) => void;
}) {
  const { data: outbound } = useOutboundDetailQuery(outboundId);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const ship = useShipOutboundMutation(outboundId, {
    onDone: (detail, refreshed) =>
      onShipped(toOutboundView(detail).statementCode ?? "-", refreshed),
  });

  const confirm = () => {
    setConfirmOpen(false);
    ship.mutate();
  };

  const errorText = ship.error ? outboundErrorText(ship.error) : null;

  return (
    <>
      <Panel.Title
        sub={`${outbound.retailerName} · 포장일 ${outbound.createdAt}`}
      >
        포장 상세 ({outbound.label})
      </Panel.Title>

      <Panel.Body>
        <Panel.Section title={`포함 상품(${outbound.lines.length}개)`}>
          <ul className="flex flex-col gap-2.5">
            {outbound.lines.map((line) => (
              <li
                key={line.variantId}
                className="flex items-baseline gap-3 text-sm"
              >
                <span className="min-w-0 flex-1">
                  {line.productName}{" "}
                  <span className="text-muted-foreground">({line.sku})</span>
                </span>
                <span className="shrink-0 tabular-nums">
                  {formatNumber(line.qty)}개
                </span>
              </li>
            ))}
          </ul>
        </Panel.Section>
      </Panel.Body>

      <div className="border-border mt-4 shrink-0 border-t pt-4">
        <div className="flex items-baseline justify-between">
          <span className="text-muted-foreground text-sm">총 수량</span>
          <span className="text-lg font-medium tabular-nums">
            {formatNumber(outbound.totalQty)}개
          </span>
        </div>

        {/* 거절 사유·옛 목록 경고는 버튼 위 한 줄 — 패널 안 */}
        {errorText ? (
          <p role="alert" className="text-destructive-strong mt-4 text-sm">
            {errorText}
          </p>
        ) : stale ? (
          <div className="mt-4 flex items-center justify-between gap-3">
            <p role="alert" className="text-destructive-strong text-sm">
              목록을 새로 못 불러왔어요. 옛 목록으로는 확정하지 않아요.
            </p>
            <Button type="button" variant="line" size="sm" onClick={onRefresh}>
              다시 불러오기
            </Button>
          </div>
        ) : outbound.shippedAt !== null ? (
          <p role="status" className="text-muted-foreground mt-4 text-sm">
            이미 출고된 봉투예요 — 출고 완료 탭에서 장끼를 볼 수 있어요.
          </p>
        ) : !outbound.isShippable ? (
          <p role="status" className="text-muted-foreground mt-4 text-sm">
            지금은 출고할 수 없는 봉투예요.
          </p>
        ) : null}

        <Button
          size="lg"
          className="mt-4"
          disabled={
            !outbound.isShippable ||
            outbound.shippedAt !== null ||
            ship.isPending ||
            stale
          }
          onClick={() => setConfirmOpen(true)}
        >
          {ship.isPending ? "출고 처리 중…" : "출고 완료 처리"}
        </Button>
      </div>

      <ShipConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        outboundLabel={outbound.label}
        totalQty={outbound.totalQty}
        onConfirm={confirm}
      />
    </>
  );
}
