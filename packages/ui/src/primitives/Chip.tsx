import { cva, type VariantProps } from "class-variance-authority";
import type { HTMLAttributes } from "react";
import { cn } from "../lib/cn";

/**
 * 짧은 값 하나를 감싸는 정적 표시물 (품번, 카테고리, 개수 등).
 * 알약(pill)과 사각(square)은 같은 컴포넌트다 — ondo.css의 .chip / .label 관계.
 * 색 조합은 여기 있는 것뿐이다. 새 조합을 만들지 않는다.
 */
const chip = cva(
  "inline-flex h-6 items-center justify-center px-2.5 text-sm whitespace-nowrap",
  {
    variants: {
      shape: {
        pill: "rounded-full",
        square: "rounded-button",
      },
      tone: {
        /* 선택됨·강조 */
        accent: "bg-accent text-accent-foreground",
        /* 부가 정보 (품번, 카테고리 경로) */
        sub: "bg-secondary text-secondary-foreground",
        /* 배경 없는 캡션형 */
        plain: "text-muted-foreground px-0 text-xs",
      },
    },
    defaultVariants: { shape: "pill", tone: "sub" },
  },
);

export interface ChipProps
  extends HTMLAttributes<HTMLSpanElement>, VariantProps<typeof chip> {}

export function Chip({
  className,
  shape,
  tone,
  children,
  ...props
}: ChipProps) {
  return (
    <span className={cn(chip({ shape, tone }), className)} {...props}>
      {children}
    </span>
  );
}
