import type { HTMLAttributes } from "react";
import { cn } from "../lib/cn";

export interface ColorDotProps extends HTMLAttributes<HTMLSpanElement> {
  /** 실제 색상값. 상품 색상 팔레트처럼 데이터에서 오는 색은 토큰이 아니라 값으로 받는다 */
  color: string;
}

/** 상품 색상 표기용 점. 색 이름 텍스트와 항상 같이 쓴다 — 색만으로 구분하지 않는다 */
export function ColorDot({ color, className, ...props }: ColorDotProps) {
  return (
    <span
      aria-hidden
      style={{ backgroundColor: color }}
      className={cn(
        "inline-block size-4 shrink-0 rounded-full ring-1 ring-black/10 ring-inset",
        className,
      )}
      {...props}
    />
  );
}
