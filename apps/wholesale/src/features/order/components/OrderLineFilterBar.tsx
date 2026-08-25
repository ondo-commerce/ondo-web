"use client";

import { Select } from "@ondo/ui";
import { LINE_FILTER_ALL } from "../constants";

/**
 * 라인 표 우측 상단의 색상·사이즈 필터. 단일 선택이다.
 *
 * ⚠️ 재고 탭 `InventoryFilterBar`와 사실상 같은 컴포넌트인데 **복제했다.**
 * 저건 `features/inventory/index.ts`에 export돼 있지 않아 feature 밖에서 import할 수 없다
 * (ESLint가 막는다). 사용처가 2곳이 됐으니 `packages/ui` 승격 조건은 찼지만,
 * 승격은 네 탭이 다 들어온 뒤 별도 패스에서 판정한다.
 *
 * 닫힌 트리거에는 고른 값이 보인다 — 지금 무엇으로 걸러져 있는지가 표 밖에서 읽혀야 한다.
 */
export function OrderLineFilterBar({
  colors,
  sizes,
  color,
  size,
  onColorChange,
  onSizeChange,
}: {
  colors: string[];
  sizes: string[];
  color: string;
  size: string;
  onColorChange: (value: string) => void;
  onSizeChange: (value: string) => void;
}) {
  return (
    <div className="mb-2 flex justify-end gap-2">
      <Select value={color} onValueChange={onColorChange}>
        <Select.Trigger aria-label="색상 필터">
          {color === LINE_FILTER_ALL ? "색상" : color}
        </Select.Trigger>
        <Select.Content>
          <Select.Item value={LINE_FILTER_ALL}>{LINE_FILTER_ALL}</Select.Item>
          {colors.map((name) => (
            <Select.Item key={name} value={name}>
              {name}
            </Select.Item>
          ))}
        </Select.Content>
      </Select>

      <Select value={size} onValueChange={onSizeChange}>
        <Select.Trigger aria-label="사이즈 필터">
          {size === LINE_FILTER_ALL ? "사이즈" : size}
        </Select.Trigger>
        <Select.Content>
          <Select.Item value={LINE_FILTER_ALL}>{LINE_FILTER_ALL}</Select.Item>
          {sizes.map((name) => (
            <Select.Item key={name} value={name}>
              {name}
            </Select.Item>
          ))}
        </Select.Content>
      </Select>
    </div>
  );
}
