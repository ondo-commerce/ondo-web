import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "../lib/cn";

export interface FormFieldProps extends HTMLAttributes<HTMLDivElement> {
  label: ReactNode;
  /** 필수 항목은 라벨 옆에 빨간 * */
  required?: boolean;
  /** 라벨 우측에 붙는 보조 컨트롤 (일괄 적용 입력 등) */
  action?: ReactNode;
  /** 입력 아래 회색 설명 */
  hint?: ReactNode;
  htmlFor?: string;
}

/**
 * 라벨 + 입력 한 벌.
 * react-hook-form에 결합하지 않는다 — 필터바·검색창처럼 폼 밖에서도 쓰기 때문이다.
 */
export function FormField({
  className,
  label,
  required,
  action,
  hint,
  htmlFor,
  children,
  ...props
}: FormFieldProps) {
  return (
    <div className={cn("mb-6", className)} {...props}>
      <div className="mb-6 flex flex-col">
        <div className="flex flex-col">
          <div className="flex gap-1">
            <label htmlFor={htmlFor} className="text-sm">
              {label}
            </label>
            {required ? (
              <span className="text-destructive" aria-hidden>
                *
              </span>
            ) : null}
          </div>
          {action ? <div className="ml-auto">{action}</div> : null}
          {hint ? <p className="text-muted-foreground mt-1">{hint}</p> : null}
        </div>
        <div className="mt-2"> {children}</div>
      </div>
    </div>
  );
}
