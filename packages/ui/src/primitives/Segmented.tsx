"use client";

import * as ToggleGroupPrimitive from "@radix-ui/react-toggle-group";
import type { ComponentProps } from "react";
import { cn } from "../lib/cn";

/* Root의 props는 single/multiple 유니온이다. 세그먼트는 항상 single이므로 그쪽만 뽑아 쓴다 */
export type SegmentedProps = Omit<
  Extract<ComponentProps<typeof ToggleGroupPrimitive.Root>, { type: "single" }>,
  "type"
>;

/**
 * 2택 세그먼트 토글 (판매중/시즌 종료, 정산 상태/미수 원장 등).
 * 항상 하나가 선택돼 있어야 하므로 빈 값으로 되돌아가는 것을 막는다.
 */
export function Segmented({ className, ...props }: SegmentedProps) {
  return (
    <ToggleGroupPrimitive.Root
      type="single"
      className={cn(
        "bg-secondary inline-flex gap-0 rounded-control p-1",
        className,
      )}
      {...props}
    />
  );
}

Segmented.Item = function SegmentedItem({
  className,
  ...props
}: ComponentProps<typeof ToggleGroupPrimitive.Item>) {
  return (
    <ToggleGroupPrimitive.Item
      className={cn(
        "text-muted-foreground grid h-9 place-items-center rounded-control px-6 text-sm font-bold transition-colors",
        "data-[state=on]:bg-card data-[state=on]:text-primary data-[state=on]:shadow-sm",
        // "focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-hidden",
        className,
      )}
      {...props}
    />
  );
};
