import { cva, type VariantProps } from "class-variance-authority";
import type { InputHTMLAttributes } from "react";
import { cn } from "../lib/cn";

const input = cva(
  "border-input bg-card text-foreground placeholder:text-muted-foreground w-full rounded-control border px-3 " +
    // "focus-visible:ring-ring focus-visible:border-ring focus-visible:ring-1 focus-visible:outline-hidden " +
    "disabled:bg-muted disabled:text-muted-foreground disabled:cursor-not-allowed",
  {
    variants: {
      size: {
        sm: "h-7 text-xs",
        md: "h-9 text-sm",
      },
      /* 수량·금액은 오른쪽 정렬 + 자릿수 고정 폭 */
      numeric: {
        true: "text-right tabular-nums",
        false: "",
      },
    },
    defaultVariants: { size: "md", numeric: false },
  },
);

export interface InputProps
  extends
    Omit<InputHTMLAttributes<HTMLInputElement>, "size">,
    VariantProps<typeof input> {}

export function Input({ className, size, numeric, ...props }: InputProps) {
  return (
    <input className={cn(input({ size, numeric }), className)} {...props} />
  );
}
