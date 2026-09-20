"use client";

import { Button, Segmented } from "@ondo/ui";
import { useStageCountsQueries, type StageCounts } from "../api/queries";
import { STAGE_LABEL, STAGES } from "../constants";
import type { ShipmentStage } from "../types";
import { useQueryBoundaryGroupRetry } from "@/shared/api/QueryBoundary";

/**
 * 3단 필터 칩 줄. `packages/ui`의 `Segmented`를 그대로 쓴다 —
 * 회색 통 + 흰 조각 + 활성 글자 강조가 실측과 같고, 칸 수를 동적으로 받는다.
 *
 * **화면 하단에 한 번 더 그리지 않는다**(판정 D3). 목록만 흐르므로 이 줄은 늘 같은 자리에 떠 있다.
 *
 * 건수가 `null`이면 괄호 없이 라벨만 — 못 받은 건수를 0으로 지어내지 않는다.
 */
export function ShipmentStageChips({
  counts,
  value,
  onChange,
}: {
  /** 칩에 붙는 건수 = 그 단계에 있는 행의 총 개수(판정 D5). 못 받았으면 null */
  counts: StageCounts;
  value: ShipmentStage;
  onChange: (stage: ShipmentStage) => void;
}) {
  return (
    <Segmented
      value={value}
      /* Radix가 돌려주는 값은 string이다. 캐스팅 대신 아는 값 목록에서 찾아 좁힌다 */
      onValueChange={(next) => {
        const stage = STAGES.find((s) => s === next);
        if (stage) onChange(stage);
      }}
      aria-label="출고 단계"
    >
      {STAGES.map((stage) => {
        const count = counts[stage];
        return (
          <Segmented.Item key={stage} value={stage}>
            {count === null
              ? STAGE_LABEL[stage]
              : `${STAGE_LABEL[stage]} (${count})`}
          </Segmented.Item>
        );
      })}
    </Segmented>
  );
}

/**
 * 건수를 서버에서 받아 붙인 칩 줄. 경계 안이 아니다 — 건수 쿼리는 `useQueries`라 기다리는 동안도,
 * 실패해도 칩은 그대로 눌린다. 실패하면 옆에 작은 `건수 다시 시도`만 둔다(wire-order F4 재발 방지).
 *
 * 그 버튼은 뷰의 경계 그룹도 같이 리셋한다 — 지금 단계의 소매처 표가 **같은 키**를 보고 있어서,
 * 건수만 다시 받으면 칩은 차는데 표는 에러 블록으로 남아 한 번 더 눌러야 했다(wire-shipment F4).
 * 같은 키의 재요청은 TanStack이 하나로 합치니 요청이 두 번 나가진 않는다.
 */
export function ShipmentStageChipsWithCounts({
  q,
  value,
  onChange,
}: {
  q: string | undefined;
  value: ShipmentStage;
  onChange: (stage: ShipmentStage) => void;
}) {
  const { counts, failed, retry } = useStageCountsQueries(q);
  const retryGroup = useQueryBoundaryGroupRetry();
  return (
    <>
      <ShipmentStageChips counts={counts} value={value} onChange={onChange} />
      {failed ? (
        <Button
          type="button"
          variant="line"
          size="sm"
          onClick={() => {
            retryGroup?.();
            retry();
          }}
        >
          건수 다시 시도
        </Button>
      ) : null}
    </>
  );
}
