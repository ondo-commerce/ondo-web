"use client";

import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import { Check } from "lucide-react";
import type { ComponentProps } from "react";
import { cn } from "../lib/cn";

export type CheckboxProps = ComponentProps<typeof CheckboxPrimitive.Root>;

export function Checkbox({ className, ...props }: CheckboxProps) {
  return (
    <CheckboxPrimitive.Root
      className={cn(
        "group border-input bg-card size-6 shrink-0 rounded-button border cursor-pointer",
        "data-[state=checked]:bg-primary data-[state=checked]:border-primary data-[state=checked]:text-primary-foreground",
        // "focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-hidden",
        "disabled:bg-muted disabled:cursor-not-allowed",
        className,
      )}
      {...props}
    >
      {/* 켜짐/꺼짐 두 상태뿐이다. indeterminate는 쓰지 않는다 —
          "일부만 켜짐"을 채워진 상자로 그리면 "전부 켜짐"으로 읽힌다 */}
      <CheckboxPrimitive.Indicator className="grid place-items-center">
        <Check aria-hidden strokeWidth={2.5} className="size-3.5" />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}
