"use client";

import { ColorDot, Input, Table } from "@ondo/ui";
import type { PriceRow, PriceValue } from "../types";
import { formatNumber } from "@/shared/lib/format";

/**
 * 옵션별 판매가 & 주문 제한 재고.
 * **입력 칸은 주문 제한과 판매가 둘뿐이다** — 현재고·평균원가는 재고 이력에서
 * 오는 참고값이다. 화면에서 계산하지 않는다.
 *
 * 현재고는 늘 보인다. 재고는 게시글과 별개로 등록되므로 게시글을 쓰는 시점에
 * 이미 값이 있을 수 있다.
 *
 * 행은 옵션 매트릭스(색상 × 사이즈)에서 나온다(`priceRows.ts`). 요청의 `variantPrices`가
 * "전 variant를 빠짐없이" 채워야 하므로(스펙) 행 집합이 곧 보낼 집합이다.
 */
export function PostPriceTable({
  rows,
  values,
  onChange,
  onApplyAll,
  disabled = false,
  showAvgCost = true,
  describedBy,
}: {
  rows: PriceRow[];
  values: Record<string, PriceValue>;
  onChange: (id: string, next: PriceValue) => void;
  onApplyAll: (field: keyof PriceValue, value: number) => void;
  disabled?: boolean;
  /**
   * 평균원가 열을 보일지.
   *
   * 현재고와 달리 이 열만 접는 이유: 재고는 게시글과 무관하게 따로 등록되므로
   * 게시글을 쓰는 시점에 이미 값이 있을 수 있다. 판매가를 정할 때 봐야 하는
   * 참고값이라 항상 보인다.
   *
   * 평균원가는 입고 단가에서 나오는 값이라 입고가 없으면 존재하지 않는다.
   * 0원으로 채워 보여주면 "원가가 0인 상품"으로 읽히므로 열째로 뺀다.
   */
  showAvgCost?: boolean;
  /** 서버가 가격을 지적했을 때(`PRICE_REQUIRED`) 그 문구의 id. 표 전체가 그 설명을 받는다 */
  describedBy?: string;
}) {
  return (
    <Table aria-describedby={describedBy}>
      <Table.Head>
        <Table.Row>
          <Table.Th align="left">색상</Table.Th>
          <Table.Th align="center">사이즈</Table.Th>
          <Table.Th>현재고</Table.Th>
          {/* 입력 열의 너비는 머리글에 건다. 본문 칸에만 걸면 행이 하나도 없을 때
              제약이 사라지고, 표가 w-full이라 남는 폭이 이 열들로 몰린다 */}
          <Table.Th className="w-28">주문 제한</Table.Th>
          {showAvgCost ? <Table.Th>평균원가(원)</Table.Th> : null}
          <Table.Th className="w-28">판매가(원)</Table.Th>
        </Table.Row>

        {/*
         * 일괄 입력 행. 입력 칸이 있는 열에만 칸을 두고 나머지는 비운다 —
         * 어느 열에 걸리는 값인지가 자리로 전달되므로 라벨이 필요 없다.
         *
         * thead 안에 두는 이유: 보이는 자리는 첫 행이지만 데이터가 아니다.
         * tbody에 넣으면 화면을 읽어 주는 도구가 SKU 한 줄로 읽고, 행 수를
         * 셀 때도 하나 더 세게 된다.
         *
         * Table.Row가 아니라 맨 tr인 이유: Table.Row의 hover 강조는 "고를 수
         * 있는 데이터 행"이라는 신호다. 여기서 켜지면 누를 수 있는 줄로 읽힌다.
         */}
        <tr>
          {/* 색상·사이즈·현재고를 묶어 라벨 자리로 쓴다 */}
          <Table.Td align="left" colSpan={3} tone="muted">
            전체 적용
          </Table.Td>
          <Table.Td>
            <Input
              size="sm"
              numeric
              disabled={disabled}
              defaultValue={0}
              onChange={(e) =>
                onApplyAll("orderLimit", Number(e.target.value) || 0)
              }
              aria-label="주문 제한 전체 적용"
            />
          </Table.Td>
          {showAvgCost ? <Table.Td /> : null}
          <Table.Td>
            <Input
              size="sm"
              numeric
              disabled={disabled}
              defaultValue={0}
              onChange={(e) => onApplyAll("price", Number(e.target.value) || 0)}
              aria-label="판매가 전체 적용"
            />
          </Table.Td>
        </tr>
      </Table.Head>
      <Table.Body>
        {rows.map((row) => {
          const value = values[row.id] ?? { orderLimit: 0, price: 0 };

          return (
            <Table.Row key={row.id}>
              <Table.Td align="left">
                {row.firstOfColor ? (
                  <span className="flex items-center gap-1.5">
                    <ColorDot color={row.colorHex} />
                    {row.color}
                  </span>
                ) : null}
              </Table.Td>
              <Table.Td align="center">{row.size}</Table.Td>
              <Table.Td tone={row.stock === 0 ? "danger" : "default"}>
                {formatNumber(row.stock)}
              </Table.Td>
              <Table.Td>
                <Input
                  size="sm"
                  numeric
                  disabled={disabled}
                  value={value.orderLimit}
                  onChange={(e) =>
                    onChange(row.id, {
                      ...value,
                      orderLimit: Number(e.target.value) || 0,
                    })
                  }
                  aria-label={`${row.color} ${row.size} 주문 제한`}
                />
              </Table.Td>
              {showAvgCost ? (
                <Table.Td tone="muted">{formatNumber(row.avgCost)}</Table.Td>
              ) : null}
              <Table.Td>
                <Input
                  size="sm"
                  numeric
                  disabled={disabled}
                  value={value.price}
                  onChange={(e) =>
                    onChange(row.id, {
                      ...value,
                      price: Number(e.target.value) || 0,
                    })
                  }
                  aria-label={`${row.color} ${row.size} 판매가`}
                />
              </Table.Td>
            </Table.Row>
          );
        })}
      </Table.Body>
    </Table>
  );
}
