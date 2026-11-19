import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { cn } from "../lib/cn";

export interface KeyValueProps extends ComponentPropsWithoutRef<"dl"> {
  /** 금액·건수 묶음은 자릿수를 비교할 수 있게 값을 오른쪽에 맞춘다. */
  amounts?: boolean;
}

export function KeyValue({ amounts, className, ...props }: KeyValueProps) {
  return (
    <dl
      {...props}
      className={cn(
        "grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-3",
        amounts && "[&>div>dd]:text-right [&>div>dd]:tabular-nums",
        className,
      )}
    />
  );
}

KeyValue.Row = function KeyValueRow({
  term,
  children,
  total,
}: {
  term: ReactNode;
  children: ReactNode;
  total?: boolean;
}) {
  return (
    <div
      className={cn(
        "col-span-full grid grid-cols-subgrid items-baseline",
        total && "border-border border-t pt-3",
      )}
    >
      <dt className={total ? "text-sm" : "text-muted-foreground text-body"}>
        {term}
      </dt>
      <dd
        className={cn(
          "min-w-0 wrap-anywhere",
          total ? "text-base font-medium" : "text-sm",
        )}
      >
        {children}
      </dd>
    </div>
  );
};
