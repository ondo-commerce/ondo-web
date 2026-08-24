"use client";

import { Button, Panel } from "@ondo/ui";
import { useState } from "react";
import { ShipConfirmDialog } from "./ShipConfirmDialog";
import { formatDateLabel, packageQty } from "../derive";
import type { Package, Retailer } from "../types";
import { formatNumber } from "@/shared/lib/format";

/**
 * 우측 `포장 상세 (PKG-NNN)` 패널. 물건을 넘기는 순간 여기서 출고로 확정한다.
 *
 * 담긴 품목은 포장 시점의 스냅샷이라 대기 목록에 없다 — 그래서 이 목록의 출처가
 * 좌측 표가 아니라 `package.lines`다.
 */
export function PackageDetailPanel({
  pkg,
  retailer,
  onShip,
}: {
  pkg: Package;
  retailer: Retailer;
  onShip: () => void;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const totalQty = packageQty(pkg);

  const confirm = () => {
    setConfirmOpen(false);
    onShip();
  };

  return (
    <Panel className="flex-1">
      <Panel.Title
        sub={`${retailer.name} · 포장일 ${formatDateLabel(pkg.packedAt)}`}
      >
        포장 상세 ({pkg.packageNo})
      </Panel.Title>

      <Panel.Body>
        <Panel.Section title={`포함 상품(${pkg.lines.length}개)`}>
          <ul className="flex flex-col gap-2.5">
            {pkg.lines.map((line) => (
              <li key={line.id} className="flex items-baseline gap-3 text-sm">
                <span className="min-w-0 flex-1">
                  {line.productName}{" "}
                  <span className="text-muted-foreground">
                    ({line.skuCode})
                  </span>
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
            {formatNumber(totalQty)}개
          </span>
        </div>

        <Button size="lg" className="mt-4" onClick={() => setConfirmOpen(true)}>
          출고 완료 처리
        </Button>
      </div>

      <ShipConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        packageNo={pkg.packageNo}
        totalQty={totalQty}
        onConfirm={confirm}
      />
    </Panel>
  );
}
