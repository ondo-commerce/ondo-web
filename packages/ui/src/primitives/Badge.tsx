import { cva, type VariantProps } from "class-variance-authority";
import type { HTMLAttributes } from "react";
import { cn } from "../lib/cn";

/**
 * 상태 배지 — 색 점 + 글자. 상자가 없어 표 줄의 hover 면과 부딪히지 않는다.
 * 점 색은 넷이다(2026-11-18 사용자 지시로 2색에서 늘렸다): 노랑 = 대기, 파랑 = 진행, 초록 = 완료,
 * 회색 = 해당 없음이나 끝난 무효(취소, 시즌 종료). 빨강(`warn`)은 지연과 거절뿐이다.
 * 색만으로 뜻을 전하지 않는다 — 글자가 항상 같이 있다.
 */
const badge = cva(
  "inline-flex h-6.5 items-center justify-center gap-1.5 text-xs whitespace-nowrap before:size-1.5 before:shrink-0 before:rounded-full before:content-['']",
  {
    variants: {
      tone: {
        wait: "text-foreground font-medium before:bg-waiting",
        active: "text-foreground font-medium before:bg-primary",
        done: "text-foreground before:bg-success",
        muted: "text-muted-foreground before:bg-border-strong",
        warn: "text-destructive-strong font-medium before:bg-destructive",
      },
    },
    defaultVariants: { tone: "muted" },
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
