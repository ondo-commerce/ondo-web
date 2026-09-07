"use client";

import { Button } from "@ondo/ui";
import { useEffect } from "react";
import { PackingQueueTable } from "./PackingQueueTable";
import { usePackingRowsQuery } from "../api/queries";
import type { PackingRowView } from "../types";
import { useShipmentRefresh } from "../api/mutations";

/**
 * 포장 대기 소매처를 펼쳤을 때의 본문 — 대기 줄 표(`GET /packing-items`).
 * 안에서만 `useSuspenseQuery`를 부른다. 경계는 부르는 쪽(펼침 영역 단위)이 감싼다 —
 * 이 표가 실패해도 소매처 목록은 그대로다.
 *
 * 받은 줄의 id를 부모에게 알린다(`onVisibleChange`) — 우측 패널이 "지금 목록에 없는 선택"을
 * 세는 데 쓴다. 검색으로 줄이 빠져도 선택은 살아 있어야 하고(shipments F3), 살아 있으면 그 사실을
 * 말해야 한다(#198 계열). 여기 말고 우측 패널이 같은 쿼리를 따로 보면 경계가 둘이 되어
 * 실패했을 때 `다시 시도`가 두 개 뜬다(wire-order F6) — 그래서 데이터 흐름을 한 곳으로 모은다.
 */
export function PackingRowDetail({
  retailerId,
  q,
  selectedIds,
  onToggle,
  onToggleVisible,
  onRestrictTo,
  onVisibleChange,
}: {
  retailerId: number;
  q: string | undefined;
  selectedIds: ReadonlySet<number>;
  onToggle: (row: PackingRowView) => void;
  onToggleVisible: (rows: PackingRowView[], checked: boolean) => void;
  onRestrictTo: (ids: number[]) => void;
  /** 표에 있는 줄 id. 내려갈 때는 `null` — 부모가 안정된 참조(useCallback)로 넘긴다 */
  onVisibleChange: (ids: readonly number[] | null) => void;
}) {
  const { data: rows, isRefetchError } = usePackingRowsQuery({
    retailerId,
    q,
  });
  const refresh = useShipmentRefresh();

  useEffect(() => {
    onVisibleChange(rows.map((row) => row.id));
    return () => onVisibleChange(null);
  }, [rows, onVisibleChange]);

  return (
    <>
      {/* 캐시엔 줄이 있는데 재조회만 실패한 상태 — 경계가 못 잡는 유일한 실패라 여기서 한 줄 */}
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
      <PackingQueueTable
        rows={rows}
        selectedIds={selectedIds}
        onToggle={onToggle}
        onToggleVisible={onToggleVisible}
        onRestrictTo={onRestrictTo}
      />
    </>
  );
}
