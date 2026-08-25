import { cva, type VariantProps } from "class-variance-authority";
import type { HTMLAttributes } from "react";
import { cn } from "../lib/cn";

/**
 * 상태 배지. 색은 두 가지뿐이다 — 파랑=진행/신규, 회색=완료·비활성.
 * 상태값이 늘어나도 색을 늘리지 않는다 (주문 상태 5종도 이 둘로 표현한다).
 */
const badge = cva(
  "inline-flex h-6.5 items-center justify-center rounded-button px-2.5 text-xs whitespace-nowrap",
  {
    variants: {
      tone: {
        active: "bg-card border-input text-primary",
        done: "bg-secondary text-muted-foreground",
      },
    },
    defaultVariants: { tone: "done" },
  },
);

export interface BadgeProps
  extends HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badge> {}

export function Badge({ className, tone, children, ...props }: BadgeProps) {
  return (
    <span className={cn(badge({ tone }), className)} {...props}>
      {children}
    </span>
  );
}
