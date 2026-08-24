"use client";

import { Segmented } from "@ondo/ui";
import { STAGE_LABEL } from "../constants";
import type { ShipmentStage } from "../types";

/** 칩 순서 = 업무 흐름 순서. 되돌아가는 전이가 없어서 이 순서가 곧 진행 방향이다 */
const STAGES: readonly ShipmentStage[] = ["ready", "packed", "shipped"];

/**
 * 3단 필터 칩 줄. `packages/ui`의 `Segmented`를 그대로 쓴다 —
 * 회색 통 + 흰 조각 + 활성 글자 강조가 실측과 같고, 칸 수를 동적으로 받는다.
 *
 * **화면 하단에 한 번 더 그리지 않는다**(판정 D3). 목록만 Panel.Body 안에서 흐르므로
 * 이 줄은 늘 같은 자리에 떠 있고, 하단 복제본은 영영 보이지 않는 자리에 놓인다.
 */
export function ShipmentStageChips({
  counts,
  value,
  onChange,
}: {
  /** 칩에 붙는 건수 = 그 단계에 있는 행의 총 개수(판정 D5) */
  counts: Record<ShipmentStage, number>;
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
      {STAGES.map((stage) => (
        <Segmented.Item key={stage} value={stage}>
          {STAGE_LABEL[stage]} ({counts[stage]})
        </Segmented.Item>
      ))}
    </Segmented>
  );
}
