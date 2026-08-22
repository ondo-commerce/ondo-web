"use client";

import * as SelectPrimitive from "@radix-ui/react-select";
import { Check, ChevronDown } from "lucide-react";
import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";
import { cn } from "../lib/cn";

const trigger = cva(
  /* cursor-pointer: Tailwind v4 preflight가 button의 커서를 default로 바꿔서
     직접 준다 (Button과 같은 이유). disabled에서는 아래 not-allowed가 이긴다 */
  "inline-flex cursor-pointer items-center justify-between gap-2 text-sm whitespace-nowrap transition-colors " +
    // "focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-hidden " +
    "disabled:text-muted-foreground disabled:cursor-not-allowed " +
    "data-[placeholder]:text-muted-foreground",
  {
    variants: {
      variant: {
        /* 폼 안의 드롭다운 — 흰 배경 + 테두리. hover는 Button의 line과 같은 단계 */
        filter:
          "bg-secondary h-8 rounded-control pr-2.5 pl-4 enabled:hover:bg-secondary-strong",
        field:
          "border-input bg-card h-9 w-full rounded-control border pr-2.5 pl-3 enabled:hover:bg-secondary",
        /* 목록 상단 필터 — 회색 채움, 테두리 없음, 내용만큼만.
           이미 회색이라 hover는 Button의 soft처럼 한 단계 더 진해진다 */
      },
    },
    defaultVariants: { variant: "field" },
  },
);

export interface SelectTriggerProps
  extends
    ComponentProps<typeof SelectPrimitive.Trigger>,
    VariantProps<typeof trigger> {}

function SelectTrigger({
  className,
  variant = "filter",
  children,
  ...props
}: SelectTriggerProps) {
  return (
    <SelectPrimitive.Trigger
      className={cn(trigger({ variant }), className)}
      {...props}
    >
      {children}
      {/* absoluteStrokeWidth를 쓰는 이유: lucide는 24 viewBox라 12px로 줄이면
          획도 절반이 된다. 원래 인라인 SVG(12 viewBox · 1.75)와 같은 굵기를
          유지하려면 크기와 무관하게 획을 고정해야 한다 */}
      <SelectPrimitive.Icon asChild>
        <ChevronDown
          aria-hidden
          absoluteStrokeWidth
          strokeWidth={2}
          className="text-border-strong size-4 shrink-0"
        />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  );
}

function SelectContent({
  className,
  children,
  position = "popper",
  ...props
}: ComponentProps<typeof SelectPrimitive.Content>) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        position={position}
        sideOffset={4}
        className={cn(
          "bg-popover text-popover-foreground border-border shadow-dropdown",
          "relative z-50 max-h-72 min-w-(--radix-select-trigger-width) overflow-hidden rounded-control border",
          className,
        )}
        {...props}
      >
        <SelectPrimitive.Viewport className="p-1">
          {children}
        </SelectPrimitive.Viewport>
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  );
}

function SelectItem({
  className,
  children,
  ...props
}: ComponentProps<typeof SelectPrimitive.Item>) {
  return (
    <SelectPrimitive.Item
      className={cn(
        "flex h-8 cursor-pointer items-center gap-2 rounded-button px-3 text-sm outline-hidden select-none hover:bg-secondary",
        "data-disabled:text-muted-foreground data-disabled:pointer-events-none",
        className,
      )}
      {...props}
    >
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>

      <SelectPrimitive.ItemIndicator className="ml-auto shrink-0">
        <Check aria-hidden strokeWidth={2.5} className="size-3.5" />
      </SelectPrimitive.ItemIndicator>
    </SelectPrimitive.Item>
  );
}

export const Select = Object.assign(SelectPrimitive.Root, {
  Trigger: SelectTrigger,
  Value: SelectPrimitive.Value,
  Content: SelectContent,
  Item: SelectItem,
  Group: SelectPrimitive.Group,
});
