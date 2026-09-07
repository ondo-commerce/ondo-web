"use client";

import { Button, Segmented, Select } from "@ondo/ui";
import { useEffect, useState } from "react";
import { ReceivableLedgerTable } from "./ReceivableLedgerTable";
import { SettlementStatusTable } from "./SettlementStatusTable";
import { useLedgerQuery, useRetailerOrdersQuery } from "../api/queries";
import {
  FILTER_ALL,
  LEDGER_ENTRY_TYPES,
  LEDGER_LABEL,
  ORDER_PAGE_SIZE,
  SETTLEMENT_LABEL,
  SETTLEMENT_STATUSES,
} from "../constants";
import { filterOrders } from "../derive";
import type { LedgerEntryType, OrderRowView, SettlementStatus } from "../types";
import { QueryBoundary } from "@/shared/api/QueryBoundary";

/** 세그먼트 2택. 같은 자리의 표만 바뀐다 — 다른 페이지로 이동하지 않는다 */
type Segment = "status" | "ledger";

/** 필터 값 = 각 축의 값 + `전체` */
type StatusFilter = SettlementStatus | typeof FILTER_ALL;
type LedgerFilter = LedgerEntryType | typeof FILTER_ALL;

/**
 * 거래처를 펼쳤을 때 나오는 영역. 세그먼트가 두 얼굴(정산 상태 / 미수원장)을 갖는다.
 *
 * 확정 주문 쿼리(`GET /orders?retailerId`)는 **이 컴포넌트가 들고**, 받은 줄을 부모에게 알린다
 * (`onOrdersChange`) — 우측 입금 패널의 배분 표가 같은 응답을 쓴다. 우측이 같은 쿼리를 따로 보면
 * 경계가 둘이 되어 실패했을 때 `다시 시도`가 두 개 뜬다(wire-order F6). 그래서 데이터 흐름을 한 곳으로 모은다.
 *
 * 세그먼트와 필터 상태는 **이 컴포넌트 안에만 둔다.** 거래처를 바꾸면 호출부가
 * key로 이 컴포넌트를 새로 만들어 필터가 자동으로 풀린다 — A거래처에 걸어 둔
 * `미결제` 필터가 B거래처 표에 남아 "주문이 없다"로 보이는 상황을 막는다.
 * 정산 상태 필터는 **받은 목록 안에서** 건다(서버 파라미터를 쓰면 키가 갈려 배분 표와 어긋난다).
 *
 * 원장은 세그먼트를 열 때만 부른다(자기 경계 안). 구분 필터는 서버 `entryType`이다 — 잔액은 `meta`라 필터와 무관.
 */
export function SettlementSegmentView({
  retailerId,
  onOrdersChange,
  onRefresh,
}: {
  retailerId: number;
  /** 받은 확정 주문. 내려갈 때는 `null` — 부모가 안정된 참조(useCallback)로 넘긴다 */
  onOrdersChange: (orders: readonly OrderRowView[] | null) => void;
  /** 재조회 실패 시 `다시 불러오기`. 부모의 것 하나를 쓴다 — 우측 패널의 잠금도 같이 풀려야 한다(②) */
  onRefresh: () => void;
}) {
  const [segment, setSegment] = useState<Segment>("status");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(FILTER_ALL);
  const [ledgerFilter, setLedgerFilter] = useState<LedgerFilter>(FILTER_ALL);

  const { data, isRefetchError } = useRetailerOrdersQuery(retailerId);

  useEffect(() => {
    onOrdersChange(data.rows);
    return () => onOrdersChange(null);
  }, [data.rows, onOrdersChange]);

  const visibleOrders = filterOrders(
    data.rows,
    statusFilter === FILTER_ALL ? null : statusFilter,
  );

  return (
    <div>
      {/* 캐시엔 줄이 있는데 재조회만 실패한 상태 — 경계가 못 잡는 유일한 실패라 여기서 한 줄(⑩) */}
      {isRefetchError ? (
        <p
          role="alert"
          className="text-destructive-strong mb-2 flex items-center justify-between gap-3 text-sm"
        >
          최신 주문을 못 불러왔어요
          <Button type="button" variant="line" size="sm" onClick={onRefresh}>
            다시 불러오기
          </Button>
        </p>
      ) : null}

      <div className="mb-2 flex items-center justify-between gap-2">
        <Segmented
          value={segment}
          onValueChange={(value) => setSegment(value as Segment)}
          aria-label="정산 보기 전환"
        >
          <Segmented.Item value="status">정산 상태</Segmented.Item>
          <Segmented.Item value="ledger">미수원장</Segmented.Item>
        </Segmented>

        {/* 필터는 세그먼트마다 다른 축을 거른다. 자리는 같고 라벨과 옵션만 바뀐다 */}
        {segment === "status" ? (
          <Select
            value={statusFilter}
            onValueChange={(value) => setStatusFilter(value as StatusFilter)}
          >
            {/* 닫힌 트리거에는 고른 값이 보인다. 무엇으로 걸러져 있는지가 표 밖에서 읽혀야 한다 */}
            <Select.Trigger aria-label="정산 상태 필터">
              {statusFilter === FILTER_ALL
                ? "정산 상태"
                : SETTLEMENT_LABEL[statusFilter]}
            </Select.Trigger>
            <Select.Content>
              <Select.Item value={FILTER_ALL}>{FILTER_ALL}</Select.Item>
              {SETTLEMENT_STATUSES.map((status) => (
                <Select.Item key={status} value={status}>
                  {SETTLEMENT_LABEL[status]}
                </Select.Item>
              ))}
            </Select.Content>
          </Select>
        ) : (
          <Select
            value={ledgerFilter}
            onValueChange={(value) => setLedgerFilter(value as LedgerFilter)}
          >
            <Select.Trigger aria-label="원장 구분 필터">
              {ledgerFilter === FILTER_ALL
                ? "구분"
                : LEDGER_LABEL[ledgerFilter]}
            </Select.Trigger>
            <Select.Content>
              <Select.Item value={FILTER_ALL}>{FILTER_ALL}</Select.Item>
              {LEDGER_ENTRY_TYPES.map((type) => (
                <Select.Item key={type} value={type}>
                  {LEDGER_LABEL[type]}
                </Select.Item>
              ))}
            </Select.Content>
          </Select>
        )}
      </div>

      {segment === "status" ? (
        <>
          <SettlementStatusTable
            orders={visibleOrders}
            hasFilter={statusFilter !== FILTER_ALL}
          />
          {data.meta.totalPages > 1 ? (
            <p className="text-muted-foreground mt-2 text-right text-xs">
              확정 주문 {ORDER_PAGE_SIZE}건까지만 보입니다 (전체{" "}
              {data.meta.totalElements}건)
            </p>
          ) : null}
        </>
      ) : (
        /* 원장은 자기 경계 — 원장이 실패해도 정산 상태 표·배분 표는 그대로다 */
        <QueryBoundary>
          <LedgerSegment
            retailerId={retailerId}
            entryType={ledgerFilter === FILTER_ALL ? undefined : ledgerFilter}
            onRefresh={onRefresh}
          />
        </QueryBoundary>
      )}
    </div>
  );
}

/** 미수원장 표. 안에서만 `useSuspenseQuery`를 부른다 */
function LedgerSegment({
  retailerId,
  entryType,
  onRefresh,
}: {
  retailerId: number;
  entryType: LedgerEntryType | undefined;
  onRefresh: () => void;
}) {
  const { data: ledger, isRefetchError } = useLedgerQuery({
    retailerId,
    entryType,
  });

  return (
    <>
      {isRefetchError ? (
        <p
          role="alert"
          className="text-destructive-strong mb-2 flex items-center justify-between gap-3 text-sm"
        >
          최신 원장을 못 불러왔어요
          <Button type="button" variant="line" size="sm" onClick={onRefresh}>
            다시 불러오기
          </Button>
        </p>
      ) : null}
      <ReceivableLedgerTable
        ledger={ledger}
        hasFilter={entryType !== undefined}
      />
    </>
  );
}
