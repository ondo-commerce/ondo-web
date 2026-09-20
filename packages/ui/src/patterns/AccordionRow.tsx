"use client";

import { ChevronDown } from "lucide-react";
import { useId, useState, type HTMLAttributes, type ReactNode } from "react";
import { cn } from "../lib/cn";

export function AccordionRows({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex flex-col", className)} {...props} />;
}

export interface AccordionRowProps {
  /** 접힌 상태에서도 보이는 행 내용 */
  header: ReactNode;
  /** 행 우측 끝 회색 부가 정보 (카테고리 경로 등) */
  tail?: ReactNode;
  children: ReactNode;
  /** 제어형으로 쓸 때. 생략하면 행이 스스로 열고 닫는다 */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  defaultOpen?: boolean;
  className?: string;
}

/**
 * 목록의 기본 단위. 펼친 행은 회색이 되고 바로 아래에 본문이 같은 테두리로 이어진다.
 * 무엇을 펼쳐 보여줄지는 호출부가 정한다 — 이 컴포넌트는 도메인을 모른다.
 */
export function AccordionRow({
  header,
  tail,
  children,
  open: controlledOpen,
  onOpenChange,
  defaultOpen = false,
  className,
}: AccordionRowProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen);
  const bodyId = useId();

  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : uncontrolledOpen;

  const toggle = () => {
    if (!isControlled) setUncontrolledOpen((v) => !v);
    onOpenChange?.(!open);
  };

  return (
    <div
      className={cn(
        "border-border",
        open && "-mt-px overflow-hidden first:mt-0",
        className,
      )}
    >
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-controls={bodyId}
        className={cn(
          "relative isolate flex w-full cursor-pointer items-center gap-1.5 py-3 px-4 text-left",
          // "focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-hidden",
          // hover 면을 행 전체가 아니라 안쪽으로 물린 둥근 면으로 그린다.
          // 클릭 영역은 버튼 전체 그대로고, 보이는 면만 줄어든다.
          // inset-x/y = 물리는 정도, rounded-control = 둥근 정도.
          open
            ? "bg-secondary rounded-control"
            : "border-b border-border before:absolute before:inset-x-0 before:inset-y-0 before:-z-10 before:rounded-control before:transition-colors hover:before:bg-secondary active:before:bg-secondary-strong",
        )}
      >
        <ChevronDown
          aria-hidden
          strokeWidth={1.5}
          className={cn(
            "text-border-strong size-5 shrink-0 transition-transform",
            open && "rotate-180",
          )}
        />
        <span className="min-w-0 text-[15px] flex-1">{header}</span>
        {tail ? (
          <span className="text-muted-foreground shrink-0 text-sm">{tail}</span>
        ) : null}
      </button>
      {open ? (
        <div
          id={bodyId}
          className="border border-border rounded-control pl-8 py-1 px-4 my-1"
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}
