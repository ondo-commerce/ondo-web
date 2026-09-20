import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "../lib/cn";

export type PanelProps = HTMLAttributes<HTMLDivElement>;

/**
 * 흰 카드. 화면의 모든 내용은 패널 안에 들어간다 (패널 밖에 본문을 두지 않는다).
 *
 * 세로 flex인 이유: 화면 전체 스크롤을 쓰지 않기 때문이다. 넘치는 내용은
 * 패널 안의 Panel.Body가 받는다 — 제목과 하단 액션은 제자리에 남는다.
 * 높이를 채워야 하는 자리에서는 호출부가 flex-1을 넘긴다.
 */
export function Panel({ className, children, ...props }: PanelProps) {
  return (
    <div
      className={cn(
        "bg-card border border-border flex min-h-0 flex-col rounded-panel p-4",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export interface PanelTitleProps extends HTMLAttributes<HTMLDivElement> {
  /** 제목 아래 회색 보조 설명 */
  sub?: ReactNode;
  /**
   * 제목 **글자 바로 오른쪽**에 붙는 정적 표시물 (품번 칩 등).
   *
   * `action`과 자리가 다르다. `action`은 패널 우측 끝으로 밀려서 제목과 멀어지는데,
   * 품번처럼 **제목이 무엇인지 마저 말해주는 값**은 제목에서 떨어지면 딸린 값으로 안 읽힌다.
   * 누를 수 있는 것은 `action`, 읽기만 하는 꼬리표는 여기다.
   */
  suffix?: ReactNode;
  /** 제목 우측 끝에 붙는 액션 (버튼, 세그먼트 토글 등) */
  action?: ReactNode;
}

Panel.Title = function PanelTitle({
  className,
  sub,
  suffix,
  action,
  children,
  ...props
}: PanelTitleProps) {
  return (
    <div className={cn("mb-6 flex items-start gap-4", className)} {...props}>
      <div className="min-w-0 flex-1">
        <div className="flex justify-baseline items-center gap-2">
          <h2 className="text-xl font-medium">{children}</h2>
          {suffix ? <div className="shrink-0">{suffix}</div> : null}
        </div>
        {sub ? (
          <p className="text-muted-foreground mt-1.5 text-sm">{sub}</p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
};

export type PanelSectionProps = HTMLAttributes<HTMLElement> & {
  title?: ReactNode;
};

/** 패널 안의 논리 묶음. 제목은 15~16px 단계를 쓴다 */
Panel.Section = function PanelSection({
  className,
  title,
  children,
  ...props
}: PanelSectionProps) {
  return (
    <section className={cn("mt-6 first:mt-0", className)} {...props}>
      {title ? <h3 className="mb-1 text-sm">{title}</h3> : null}
      {children}
    </section>
  );
};

export type PanelBodyProps = HTMLAttributes<HTMLDivElement>;

/**
 * 패널 안에서 스크롤을 받는 유일한 자리.
 *
 * 화면(body)에는 스크롤이 없다. 내용이 넘치면 여기서만 흐른다 —
 * 그래야 제목·상태 토글·하단 버튼이 항상 같은 자리에 보인다.
 * 스크롤바는 패널 안쪽 여백 안에 생기므로 -mx로 끌어내지 않는다.
 * 막대는 평소 숨어 있다가 이 영역에 올렸을 때만 뜬다 (scroll-slim).
 */
Panel.Body = function PanelBody({
  className,
  children,
  ...props
}: PanelBodyProps) {
  return (
    <div
      className={cn("scroll-slim min-h-0 flex-1 overflow-y-auto", className)}
      {...props}
    >
      {children}
    </div>
  );
};
