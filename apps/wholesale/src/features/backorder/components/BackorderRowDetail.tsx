"use client";

import { Button } from "@ondo/ui";
import { AllocationCounterBar } from "./AllocationCounterBar";
import { BackorderAllocationTable } from "./BackorderAllocationTable";
import { useAllocateMutation } from "../api/mutations";
import { useSkuBackordersQuery } from "../api/queries";
import {
  allocatedQty,
  allocationErrorText,
  allResolved,
  effectiveDraft,
  toAllocationRequest,
  unallocatedQty,
  withAllocation,
} from "../derive";
import type { AllocationDraft } from "../types";
import { QueryBoundary } from "@/shared/api/QueryBoundary";

/**
 * 펼친 행의 내용 — 카운터 3개 + 배분 표 + 배분 확정. 목록 응답에는 라인이 없어서
 * 펼치는 순간 그 SKU의 미송 건을 부른다. 우측 요약과 같은 queryKey라 한 번만 받는다.
 *
 * 경계를 행 안에 둔다 — 한 행의 펼침이 실패했다고 목록 전체가 죽으면 안 된다.
 *
 * 입력값(`draft`)은 여기 두지 않고 `BackorderListView`가 SKU별로 든다 — 접으면 이 컴포넌트가
 * 내려가는데 그때 손으로 고친 배분이 사라지면 안 된다(F2). 대신 **상한 자르기와 초기값은
 * 여기서 한다**: 행과 가용재고를 아는 쪽이 여기뿐이다.
 */
export function BackorderRowDetail({
  variantId,
  draft,
  onDraftChange,
  onAllocated,
}: {
  variantId: number;
  /** 저장된 입력. `undefined`면 아직 손대지 않은 것(선착순으로 채운다) */
  draft: AllocationDraft | undefined;
  onDraftChange: (next: AllocationDraft) => void;
  /** 서버가 받아 준 뒤. `cleared`면 이 SKU의 미송이 전부 해소됐다 */
  onAllocated: (cleared: boolean) => void;
}) {
  return (
    <QueryBoundary>
      <BackorderRowDetailBody
        variantId={variantId}
        draft={draft}
        onDraftChange={onDraftChange}
        onAllocated={onAllocated}
      />
    </QueryBoundary>
  );
}

function BackorderRowDetailBody({
  variantId,
  draft,
  onDraftChange,
  onAllocated,
}: {
  variantId: number;
  draft: AllocationDraft | undefined;
  onDraftChange: (next: AllocationDraft) => void;
  onAllocated: (cleared: boolean) => void;
}) {
  const { data } = useSkuBackordersQuery(variantId);
  const { lines, summary } = data;

  /**
   * 카운터 3개는 **여기서 한 번만 계산해** 카운터 바와 표에 나눠 준다 —
   * 두 컴포넌트가 각자 세면 합이 어긋날 수 있고, 어긋나는 순간 사장이 화면을 안 믿는다.
   * 화면이 그리는 입력(`effective`)이 곧 요청에 실리는 입력이다.
   */
  const capacity = summary.assignable;
  const effective = effectiveDraft(lines, capacity, draft);
  const allocated = allocatedQty(effective);

  /* 아코디언을 닫을지는 응답의 `resolvedBackorderIds`로 판정한다 — 스펙: "프론트가 잔여
     계산으로 판정하지 않게". 훅 옵션으로 받는 이유는 mutations.ts `AllocationDone` 주석 */
  const allocate = useAllocateMutation(variantId, {
    onDone: (batch) =>
      onAllocated(allResolved(lines, batch.resolvedBackorderIds)),
  });

  return (
    <>
      <AllocationCounterBar
        unallocated={unallocatedQty(summary.totalQty, allocated)}
        assignable={capacity}
        allocated={allocated}
      />
      <BackorderAllocationTable
        lines={lines}
        draft={effective}
        onChange={(lineId, next) => {
          /* 고치기 시작하면 직전 거절 문구는 할 일을 다 했다 — 옛 오류가 새 입력 옆에 남지 않게(F1) */
          if (allocate.error) allocate.reset();
          onDraftChange(
            withAllocation(effective, lines, capacity, lineId, next),
          );
        }}
      />

      {/* 확인 다이얼로그는 없다 — Figma에 그려져 있지 않다. 대신 배분이 0이면 눌리지 않는다.
          거절 사유는 버튼 왼쪽 한 줄 — 패널 안, 입력 바로 아래다 */}
      <div className="mt-4 mb-2 flex items-center justify-end gap-3">
        {allocate.error ? (
          <p role="alert" className="text-destructive-strong text-sm">
            {allocationErrorText(allocate.error)}
          </p>
        ) : null}
        <Button
          disabled={allocated === 0 || allocate.isPending}
          onClick={() => allocate.mutate(toAllocationRequest(effective))}
        >
          배분 확정
        </Button>
      </div>
    </>
  );
}
