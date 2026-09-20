"use client";

import { Select } from "@ondo/ui";
import {
  FILTER_ALL,
  RECEIVE_BY_LABEL,
  RECEIVE_BY_ORDER,
  type ReceiveByFilterValue,
} from "../constants";

/** 트리거·목록에 세울 값 순서. `전체`가 맨 위다 */
const OPTIONS: readonly ReceiveByFilterValue[] = [
  FILTER_ALL,
  ...RECEIVE_BY_ORDER,
];

/**
 * 포장 대기 표 위 우측의 수령방식 필터. **단일 선택**이고 `전체`로 되돌릴 수 있다.
 *
 * 닫힌 트리거에는 고른 값이 아니라 `수령방식`이 보인다(재고 탭 색상/사이즈 필터와 같은 방식) —
 * 값을 고르면 그 값이 대신 들어가서, 지금 무엇으로 걸러져 있는지가 표 밖에서 읽힌다.
 *
 * 이 필터를 **필수 선택으로 만들지 않는다.** 수령방식이 섞인 채로도 목록을 볼 수 있어야
 * 하고, 섞인 선택은 포장 버튼 쪽에서 막는다(게이트 Q3).
 */
export function PickupMethodFilter({
  value,
  onChange,
}: {
  value: ReceiveByFilterValue;
  onChange: (value: ReceiveByFilterValue) => void;
}) {
  return (
    <div className="mb-2 flex justify-end">
      <Select
        value={value}
        /* Radix가 돌려주는 값은 string이다. 캐스팅 대신 아는 값 목록에서 찾아 좁힌다 */
        onValueChange={(next) => {
          const option = OPTIONS.find((o) => o === next);
          if (option) onChange(option);
        }}
      >
        <Select.Trigger aria-label="수령방식 필터">
          {value === FILTER_ALL ? "수령방식" : RECEIVE_BY_LABEL[value]}
        </Select.Trigger>
        <Select.Content>
          <Select.Item value={FILTER_ALL}>{FILTER_ALL}</Select.Item>
          {RECEIVE_BY_ORDER.map((receiveBy) => (
            <Select.Item key={receiveBy} value={receiveBy}>
              {RECEIVE_BY_LABEL[receiveBy]}
            </Select.Item>
          ))}
        </Select.Content>
      </Select>
    </div>
  );
}
