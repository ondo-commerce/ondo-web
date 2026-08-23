import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "../lib/cn";

export interface FormFieldProps extends HTMLAttributes<HTMLDivElement> {
  label: ReactNode;
  /** 필수 항목은 라벨 옆에 빨간 * */
  required?: boolean;
  /** 라벨 우측에 붙는 보조 컨트롤 (일괄 적용 입력 등) */
  action?: ReactNode;
  /** 라벨 아래 회색 설명. 입력 위에 온다 */
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
    /* 필드 사이 20px 한 겹. 바깥(mb-4)과 안쪽(mb-5)에 겹쳐 걸면 36px이 되는데,
       그러면 Panel.Section이 만드는 섹션 간격과 차이가 좁아져 묶음이 안 보인다.
       섹션이 큰 구분을 맡으므로 필드는 붙여 둔다 (디자인 시스템 값 22px) */
    <div className={cn("mb-5", className)} {...props}>
      {/* 라벨 줄. action은 같은 줄 오른쪽 끝이라 ml-auto가 먹으려면 여기가
          flex-row여야 한다 — flex-col 안에서는 아무 일도 하지 않는다 */}
      <div className="flex items-center gap-1">
        <label htmlFor={htmlFor} className="text-sm">
          {label}
        </label>
        {required ? (
          <span className="text-destructive" aria-hidden>
            *
          </span>
        ) : null}
        {action ? <div className="ml-auto">{action}</div> : null}
      </div>

      {/* 라벨보다 한 톤 조용하게 — 13px(--text-body). 14px면 라벨과 무게가 같아서
          설명인지 또 다른 라벨인지 구분이 안 된다 */}
      {hint ? (
        <p className="text-muted-foreground mt-1 text-body">{hint}</p>
      ) : null}

      <div className="mt-2">{children}</div>
    </div>
  );
}
