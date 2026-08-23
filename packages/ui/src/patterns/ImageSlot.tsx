import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";
import { cn } from "../lib/cn";

export function SlotGrid({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex flex-wrap gap-2", className)} {...props} />;
}

const slot = cva(
  "text-border-strong relative grid place-items-center rounded-control text-xs",
  {
    variants: {
      size: {
        md: "size-24",
        lg: "size-50",
      },
    },
    defaultVariants: { size: "md" },
  },
);

export interface ImageSlotProps
  extends
    Omit<HTMLAttributes<HTMLDivElement>, "children">,
    VariantProps<typeof slot> {
  /** 배지·삭제 버튼 등 슬롯 위에 겹치는 것 */
  overlay?: ReactNode;
  children?: ReactNode;
}

/** 이미지 자리. 실제 이미지가 들어오면 children으로 넘긴다 */
export function ImageSlot({
  className,
  size,
  overlay,
  children,
  ...props
}: ImageSlotProps) {
  return (
    <div className={cn(slot({ size }), "bg-secondary", className)} {...props}>
      {children}
      {overlay}
    </div>
  );
}

export interface AddSlotProps
  extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof slot> {}

/** 이미지 추가 버튼. 점선 테두리 + 흰 배경으로 채워진 슬롯과 구분한다 */
export function AddSlot({ className, size, children, ...props }: AddSlotProps) {
  return (
    <button
      type="button"
      className={cn(
        slot({ size }),
        "border-border bg-card hover:bg-secondary border border-dashed transition-colors",
        // "focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-hidden",
        className,
      )}
      {...props}
    >
      {children ?? "+"}
    </button>
  );
}
