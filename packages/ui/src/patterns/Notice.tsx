import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "../lib/cn";

export interface NoticeProps extends HTMLAttributes<HTMLDivElement> {
  /** 우측 끝에 붙는 이동 링크 ("마켓 등록하러 가기 →" 등) */
  action?: ReactNode;
  /** 테두리를 둘러 더 눈에 띄게 */
  outlined?: boolean;
}

/** 안내 배너. 색은 강조 파랑 하나뿐이다 — 경고용 빨강 배너를 만들지 않는다 */
export function Notice({
  className,
  action,
  outlined = false,
  children,
  ...props
}: NoticeProps) {
  return (
    <div
      className={cn(
        "bg-accent text-accent-foreground flex items-center gap-2 rounded-control px-4 py-3 text-sm",
        outlined && "border-primary border",
        className,
      )}
      {...props}
    >
      <span className="min-w-0 flex-1">{children}</span>
      {action ? <span className="shrink-0">{action}</span> : null}
    </div>
  );
}
