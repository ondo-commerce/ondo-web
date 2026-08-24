"use client";

import { Table } from "@ondo/ui";
import { PickupMethodBadge } from "./PickupMethodBadge";
import {
  formatDateTime,
  lineSummaryLabel,
  packageQty,
  sortPackagesByDesc,
} from "../derive";
import type { Package } from "../types";
import { formatNumber } from "@/shared/lib/format";

/**
 * `포장 완료` 단계의 표. **체크박스가 없다** — 여기서 고르는 것은 여러 줄을 묶는
 * 일이 아니라 이미 묶인 것 하나를 여는 일이라, 선택이 항상 한 행이다.
 *
 * 수령방식 필터도 없다. 포장이 끝난 뒤에는 수령 방식이 묶음을 가르는 축이 아니다.
 */
export function PackageTable({
  packages,
  selectedPackageNo,
  onSelect,
}: {
  packages: readonly Package[];
  selectedPackageNo: string | null;
  onSelect: (packageNo: string) => void;
}) {
  /* 포장 일시 최신순(판정 D8) */
  const rows = sortPackagesByDesc(packages, (pkg) => pkg.packedAt);

  return (
    <Table>
      <Table.Head>
        <Table.Row>
          <Table.Th align="left">포장번호</Table.Th>
          <Table.Th align="left">상품 요약</Table.Th>
          <Table.Th align="center">수령 방식</Table.Th>
          <Table.Th align="left">포장 일시</Table.Th>
          <Table.Th>수량</Table.Th>
        </Table.Row>
      </Table.Head>
      <Table.Body>
        {rows.map((pkg) => (
          <Table.Row
            key={pkg.packageNo}
            selected={selectedPackageNo === pkg.packageNo}
            tabIndex={0}
            aria-label={`${pkg.packageNo} 포장 상세`}
            className="cursor-pointer"
            onClick={() => onSelect(pkg.packageNo)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSelect(pkg.packageNo);
              }
            }}
          >
            <Table.Td align="left">{pkg.packageNo}</Table.Td>
            <Table.Td align="left">{lineSummaryLabel(pkg.lines)}</Table.Td>
            <Table.Td align="center">
              <PickupMethodBadge method={pkg.pickupMethod} />
            </Table.Td>
            <Table.Td align="left" tone="muted">
              {formatDateTime(pkg.packedAt)}
            </Table.Td>
            <Table.Td>{formatNumber(packageQty(pkg))}</Table.Td>
          </Table.Row>
        ))}
      </Table.Body>
    </Table>
  );
}
