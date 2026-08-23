"use client";

import * as SwitchPrimitive from "@radix-ui/react-switch";
import type { ComponentProps } from "react";
import { cn } from "../lib/cn";

export type SwitchProps = ComponentProps<typeof SwitchPrimitive.Root>;

export function Switch({ className, ...props }: SwitchProps) {
  return (
    <SwitchPrimitive.Root
      className={cn(
        "bg-border data-[state=checked]:bg-primary inline-flex h-6 w-11 shrink-0 rounded-full p-0.75 transition-colors",
        // "focus-visible:ring-ring focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-hidden",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb className="bg-card size-4.5 rounded-full transition-transform data-[state=checked]:translate-x-5" />
    </SwitchPrimitive.Root>
  );
}
