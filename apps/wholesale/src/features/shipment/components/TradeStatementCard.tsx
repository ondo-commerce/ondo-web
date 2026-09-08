"use client";

import { Button, Panel, Table } from "@ondo/ui";
import type { ReactNode } from "react";
import { useStatementQuery } from "../api/queries";
import { RECEIVE_BY_LABEL } from "../constants";
import { formatNumber } from "@/shared/lib/format";

/** 라벨-값 한 줄. 라벨은 회색 왼쪽, 값은 검정 오른쪽(실측) */
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 text-sm">
      <dt className="text-muted-foreground shrink-0">{label}</dt>
      <dd className="min-w-0 text-right">{children}</dd>
    </div>
  );
}

/**
 * 우측 `장끼` 문서 카드 = 소매처에 넘기는 거래명세표(`GET /outbounds/{id}/statement`).
 *
 * 문서 카드(라벨-값 2열 + 품목표 + 하단 버튼) 패턴은 여기서 **처음 등장**한다.
 * 사용처가 1곳이라 `packages/ui`로 올리지 않고 이 feature 안에 둔다(Rule of Two).
 *
 * `다운로드`·`인쇄`는 **자리만 잡는다**(게이트 Q2). 스펙도 "렌더·인쇄는 프론트(서버 PDF 없음)"다 —
 * print 전용 스타일 없이 `window.print()`를 붙이면 사이드바까지 인쇄돼 장끼 구실을 못 한다.
 * 눌러 보고 실망하느니 처음부터 못 누르는 게 낫다.
 *
 * `Panel`과 제목은 부르는 쪽이 그린다 — 출고 전 봉투는 404라 경계의 `notFound` 자리가 본문을 대신한다.
 */
export function TradeStatementCard({ outboundId }: { outboundId: number }) {
  const { data: statement } = useStatementQuery(outboundId);

  return (
    <>
      <Panel.Body>
        <dl className="flex flex-col gap-2.5">
          <Field label="장끼번호">{statement.statementCode}</Field>
          <Field label="출고번호">{statement.outboundLabel}</Field>
          <Field label="출고일">{statement.shippedAt}</Field>
          {/* `판매처`가 아니다 — glossary §2.1의 폐기어라 아래 `거래처`와 뒤집힌다 */}
          <Field label="도매처">{statement.sellerName}</Field>
          {/* 배송지 줄은 없다 — BE가 장끼에서 `deliveryAddress`를 지웠다(2026-09-08 스펙) */}
          <Field label="거래처">{statement.retailerName}</Field>
          <Field label="수령 방식">
            {RECEIVE_BY_LABEL[statement.receiveBy]}
          </Field>
        </dl>

        <Panel.Section className="mt-6">
          <Table>
            <Table.Head>
              <Table.Row>
                <Table.Th align="left">상품명</Table.Th>
                <Table.Th align="left">옵션</Table.Th>
                <Table.Th>수량</Table.Th>
              </Table.Row>
            </Table.Head>
            <Table.Body>
              {/* 품목에 id가 없다(스펙 `Item`). 같은 상품·옵션이 두 줄일 수 없어 순번 키로 충분하다 */}
              {statement.lines.map((line, index) => (
                <Table.Row key={index}>
                  <Table.Td align="left">{line.productName}</Table.Td>
                  <Table.Td align="left" tone="muted">
                    {line.option}
                  </Table.Td>
                  <Table.Td>{formatNumber(line.qty)}</Table.Td>
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
        </Panel.Section>
      </Panel.Body>

      <div className="border-border mt-4 shrink-0 border-t pt-4">
        <div className="flex items-baseline justify-between">
          <span className="text-muted-foreground text-sm">총 수량</span>
          <span className="text-lg font-medium tabular-nums">
            {formatNumber(statement.totalQty)}개
          </span>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <Button variant="line" disabled className="w-full">
            다운로드
          </Button>
          <Button disabled className="w-full">
            인쇄
          </Button>
        </div>
      </div>
    </>
  );
}
