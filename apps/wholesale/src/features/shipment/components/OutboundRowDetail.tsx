"use client";

import { Button } from "@ondo/ui";
import { PackageTable } from "./PackageTable";
import { ShippedTable } from "./ShippedTable";
import { useShipmentRefresh } from "../api/mutations";
import { useOutboundRowsQuery } from "../api/queries";
import { OUTBOUND_PAGE_SIZE } from "../constants";
import type { OutboundStatus } from "../types";

/**
 * 출고 대기·출고 완료 소매처를 펼쳤을 때의 본문 — 봉투 목록(`GET /outbounds`).
 * 두 단계는 `status`만 다르고 묶는 방식이 같아 한 컴포넌트다. 표만 단계별로 갈린다.
 *
 * 안에서만 `useSuspenseQuery`를 부른다. 경계는 부르는 쪽(펼침 영역 단위)이 감싼다.
 */
export function OutboundRowDetail({
  retailerId,
  status,
  q,
  selectedId,
  onSelect,
}: {
  retailerId: number;
  status: OutboundStatus;
  q: string | undefined;
  selectedId: number | null;
  onSelect: (outboundId: number) => void;
}) {
  const { data, isRefetchError } = useOutboundRowsQuery({
    retailerId,
    status,
    q,
  });
  const refresh = useShipmentRefresh();

  return (
    <>
      {isRefetchError ? (
        <p
          role="alert"
          className="text-destructive-strong mb-2 flex items-center justify-between gap-3 text-sm"
        >
          최신 목록을 못 불러왔어요
          <Button
            type="button"
            variant="line"
            size="sm"
            onClick={() => void refresh()}
          >
            다시 불러오기
          </Button>
        </p>
      ) : null}

      {data.rows.length === 0 ? (
        <p className="text-muted-foreground py-8 text-center text-sm">
          {status === "SHIPPED"
            ? "출고된 묶음이 없습니다"
            : "출고 대기 중인 묶음이 없습니다"}
        </p>
      ) : status === "SHIPPED" ? (
        <ShippedTable
          rows={data.rows}
          selectedId={selectedId}
          onSelect={onSelect}
        />
      ) : (
        <PackageTable
          rows={data.rows}
          selectedId={selectedId}
          onSelect={onSelect}
        />
      )}

      {/* 화면에 페이저가 없다. 첫 페이지 밖의 봉투는 있다는 것만 알린다 */}
      {data.meta.totalPages > 1 ? (
        <p className="text-muted-foreground mt-2 text-right text-xs">
          최근 {OUTBOUND_PAGE_SIZE}건까지만 보입니다 (전체{" "}
          {data.meta.totalElements}건)
        </p>
      ) : null}
    </>
  );
}
