"use client";

import { Select } from "@ondo/ui";
import { FILTER_ALL } from "../constants";

/**
 * SKU 표 위 우측의 필터 2개. **단일 선택이다**(§7 Q7) —
 * 다중 선택이 필요해지면 주문 탭의 필터 칩 줄 패턴이 먼저 생기고 거기에 맞춘다.
 *
 * 닫힌 트리거에는 고른 값이 아니라 `색상`/`사이즈`가 보인다(Figma 실측).
 * 값을 고르면 그 값이 대신 들어간다 — 지금 무엇으로 걸러져 있는지가 표 밖에서
 * 읽혀야 하기 때문이다.
 */
export function InventoryFilterBar({
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
          {color === FILTER_ALL ? "색상" : color}
        </Select.Trigger>
        <Select.Content>
          <Select.Item value={FILTER_ALL}>{FILTER_ALL}</Select.Item>
          {colors.map((name) => (
            <Select.Item key={name} value={name}>
              {name}
            </Select.Item>
          ))}
        </Select.Content>
      </Select>

      <Select value={size} onValueChange={onSizeChange}>
        <Select.Trigger aria-label="사이즈 필터">
          {size === FILTER_ALL ? "사이즈" : size}
        </Select.Trigger>
        <Select.Content>
          <Select.Item value={FILTER_ALL}>{FILTER_ALL}</Select.Item>
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
