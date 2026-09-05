import { Button, Table } from "@ondo/ui";
import Link from "next/link";
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
          {/*
            버튼 열도 이름이 있어야 보조기술이 `주문 보기`가 어느 열인지 말한다.

            `relative`가 붙은 이유가 폭이다. `sr-only`는 `position:absolute`인데
            `Table.Th`에는 위치 기준이 없어서, 이 span의 컨테이닝 블록이 표의 가로
            스크롤 상자를 **건너뛰고** 바깥으로 잡힌다. 그러면 표는 자기 상자 안에서
            스크롤하는데도 **페이지 전체가 가로로 밀린다**(390px에서 문서 폭 660px).
            기준을 th로 못박아 스크롤 상자 안에 가둔다.
          */}
          <Table.Th align="center" className="relative">
            <span className="sr-only">{TABLE_HEADERS.action}</span>
          </Table.Th>
        </Table.Row>
      </Table.Head>

      {/* 마지막 행의 아래선을 지운다 — 바로 아래 합계 행의 윗선과 겹쳐 2px로 보인다
          (`_base.css` `.tbl tbody tr:last-child td{border-bottom:0}`) */}
      <Table.Body className="[&>tr:last-child>td]:border-b-0">
        {lines.map((line) => (
          /*
            생짜 `<tr>`다. `Table.Row`를 쓰면 hover에서 행 전체에 회색 면이 깔리는데
            (`hover:[&>td]:before:bg-secondary`), **이 행은 누를 수 없다** — onClick도
            링크도 없고 실제로 눌리는 것은 오른쪽 끝 `주문 보기` 하나다. 누를 수 있는 것처럼
            보이는 면을 깔아 두면 사장이 행을 누르고 아무 일도 안 일어나는 걸 보고서야 안다
            (inventory Q-06 · retail-market F11이 같은 뿌리로 이미 두 번 났다).
            아래 tfoot도 같은 이유로 생짜 `<tr>`이다.
          */
          <tr key={line.id}>
            {/* 상품명은 **텍스트다.** 같은 줄에 같은 목적지 링크를 둘 두면
                키보드로 두 번 지나야 하고 둘 중 무엇이 다른지도 알 수 없다
                (retail-market F9). 이 줄의 링크는 `주문 보기` 하나다 */}
            <Table.Td align="left">{line.productName}</Table.Td>
            <Table.Td align="left">{line.wholesalerName}</Table.Td>
            <Table.Td align="left">{optionLabel(line)}</Table.Td>
            <Table.Td>{qtyLabel(line.qty)}</Table.Td>
            <Table.Td align="center" numeric>
              {formatDate(line.orderedDate)}
            </Table.Td>
            <Table.Td align="center" numeric={false}>
              <EtaCell line={line} today={today} />
            </Table.Td>
            <Table.Td align="center">
              {/* 눌러도 아무 일이 없는 버튼을 두지 않는다(retail-market F2).
                  목적지 `/orders/{통합주문번호}`가 아직 준비 중 화면인 것은 이번 범위 밖이다 */}
              <Button asChild variant="line" size="sm">
                <Link href={orderHref(line)} aria-label={orderLinkLabel(line)}>
                  주문 보기
                </Link>
              </Button>
            </Table.Td>
          </tr>
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
            colSpan={3}
            className="border-border border-t border-b-0 pt-3"
          />
        </tr>
      </tfoot>
    </Table>
  );
}
