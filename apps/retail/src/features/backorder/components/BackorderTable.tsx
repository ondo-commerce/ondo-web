"use client";

import { Table } from "@ondo/ui";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { TABLE_CAPTION, TABLE_HEADERS, TOTAL_ROW_LABEL } from "../constants";
import {
  formatDate,
  optionLabel,
  orderHref,
  orderLinkLabel,
  qtyLabel,
} from "../derive";
import { EtaCell } from "./EtaCell";
import type { BackorderLine } from "../types";

/**
 * 미송 표 7열. 한 줄이 SKU 하나(상품 × 색상 × 사이즈)다.
 *
 * 합계는 **받은 목록에서 나온다** — 도매처 칩으로 좁히면 합계도 같이 줄어든다.
 * 전체 합을 따로 들고 오면 필터를 걸었을 때 표에 서 있는 행과 합계가 어긋난다
 * (settlements F7: 원장 필터를 걸면 `잔액`이 `금액`과 산술적으로 안 맞았다).
 *
 * `@ondo/ui`의 `Table`을 쓰는 이유가 폭이다. 저 안에 **폭이 모자라면 표를 줄이지 않고
 * 표만 가로로 스크롤**하는 규칙(`min-w-max` + 스크롤 컨테이너)이 들어 있어서, 1280px
 * 노트북에서도 열이 눌려 숫자가 두 줄로 접히지 않고 페이지 전체도 가로로 밀리지 않는다
 * (orders F2 · settlements F6 · retail-shell F14).
 */
export function BackorderTable({
  lines,
  today,
  totalQty,
}: {
  lines: readonly BackorderLine[];
  today: string;
  /** `summarize`가 이 목록에서 뽑은 값. 표가 다시 더하지 않는다 */
  totalQty: number;
}) {
  const router = useRouter();
  return (
    <Table aria-label={TABLE_CAPTION}>
      <Table.Head>
        <Table.Row>
          <Table.Th align="left">{TABLE_HEADERS.product}</Table.Th>
          <Table.Th align="left">{TABLE_HEADERS.wholesaler}</Table.Th>
          <Table.Th align="left">{TABLE_HEADERS.option}</Table.Th>
          <Table.Th>{TABLE_HEADERS.qty}</Table.Th>
          <Table.Th align="center">{TABLE_HEADERS.orderedAt}</Table.Th>
          <Table.Th align="center">{TABLE_HEADERS.eta}</Table.Th>
        </Table.Row>
      </Table.Head>

      {/* 마지막 행의 아래선을 지운다 — 바로 아래 합계 행의 윗선과 겹쳐 2px로 보인다
          (`_base.css` `.tbl tbody tr:last-child td{border-bottom:0}`) */}
      <Table.Body className="[&>tr:last-child>td]:border-b-0">
        {lines.map((line) => (
          /* 줄 전체가 그 주문으로 가는 이동이다(2026-11-18 사용자 지시: 펼치는 표가 아니면 버튼 열 대신 줄 클릭).
             키보드와 낭독기는 상품명의 링크 하나로 간다. 아래 tfoot은 못 누르는 줄이라 생짜 `<tr>`이다 */
          <Table.Row
            key={line.id}
            className="cursor-pointer"
            onClick={() => router.push(orderHref(line))}
          >
            <Table.Td align="left">
              <Link
                href={orderHref(line)}
                aria-label={orderLinkLabel(line)}
                onClick={(e) => e.stopPropagation()}
              >
                {line.productName}
              </Link>
            </Table.Td>
            <Table.Td align="left">{line.wholesalerName}</Table.Td>
            <Table.Td align="left">{optionLabel(line)}</Table.Td>
            <Table.Td>{qtyLabel(line.qty)}</Table.Td>
            <Table.Td align="center" numeric>
              {formatDate(line.orderedDate)}
            </Table.Td>
            <Table.Td align="center" numeric={false}>
              <EtaCell line={line} today={today} />
            </Table.Td>
          </Table.Row>
        ))}
      </Table.Body>

      <tfoot>
        <tr>
          <Table.Td
            colSpan={3}
            align="left"
            className="border-border border-t border-b-0 pt-3 font-medium"
          >
            {TOTAL_ROW_LABEL}
          </Table.Td>
          <Table.Td className="border-border border-t border-b-0 pt-3 font-medium">
            {qtyLabel(totalQty)}
          </Table.Td>
          <Table.Td
            colSpan={2}
            className="border-border border-t border-b-0 pt-3"
          />
        </tr>
      </tfoot>
    </Table>
  );
}
