import { Table } from "@ondo/ui";
import { availableQtyTone } from "../derive";
import { formatNumber } from "@/shared/lib/format";

/**
 * 판매가능 한 칸. 규칙은 `derive.availableQtyTone` 하나고, 여기서는 그 톤을 셀에 입힐 뿐이다.
 * `Table.Td`에 파랑(primary) 톤이 없어 양수만 클래스로 입힌다 — 회색은 표의 `muted` 톤 그대로.
 */
export function AvailableQtyCell({ value }: { value: number }) {
  const tone = availableQtyTone(value);
  return tone === "primary" ? (
    <Table.Td className="text-primary">{formatNumber(value)}</Table.Td>
  ) : (
    <Table.Td tone="muted">{formatNumber(value)}</Table.Td>
  );
}
