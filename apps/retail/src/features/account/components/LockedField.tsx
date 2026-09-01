import { cn } from "@ondo/ui";
import { Lock } from "lucide-react";
import type { ReactNode } from "react";
import { LOCKED_VALUE_CLASS } from "../constants";
import { FieldHelp } from "./FieldError";

/**
 * 못 고치는 값 한 칸 (`.f.lock`) — 회색 상자 + 오른쪽 끝 자물쇠.
 *
 * **폼 컨트롤이 아니다.** `<input disabled>`로 그리지 않는 이유가 둘이다.
 * ① 비활성 입력은 키보드 순회에서 빠져서 화면 낭독기로 훑을 때 값 자체가
 *    사라진다. 사업자등록번호·이메일은 **읽으라고 있는 값**이다.
 * ② 가리킬 컨트롤이 없으므로 이름표도 `<label>`이 아니다. `for`가 아무것도
 *    가리키지 못하는 `<label>`은 이름표 역할을 못 한다.
 * 대신 묶음(`role="group"`)에 이름을 붙여 "이 값이 무엇인지"를 남긴다.
 *
 * 잠긴 이유는 색이 아니라 **글자**로 말한다(`help`) — 회색 상자만으로는 왜
 * 못 고치는지, 어디에 물어야 하는지가 전달되지 않는다.
 */
export function LockedField({
  id,
  label,
  value,
  help,
  action,
  className,
}: {
  /** 이름표의 DOM id. 묶음의 `aria-labelledby`가 이것을 가리킨다 */
  id: string;
  label: string;
  value: string;
  help?: string;
  /** 값 오른쪽 끝에 붙는 조작. 없으면 자물쇠가 선다 */
  action?: ReactNode;
  className?: string;
}) {
  return (
    /* 여백은 `FormField`(mb-5 · 라벨과 상자 사이 mt-2)와 같은 값이다 —
       나란히 선 편집 칸과 잠긴 칸의 높이가 어긋나면 2열이 계단처럼 보인다 */
    <div role="group" aria-labelledby={id} className={cn("mb-5", className)}>
      <p id={id} className="text-body font-medium">
        {label}
      </p>
      <div className={cn(LOCKED_VALUE_CLASS, "mt-2")}>
        <span className="min-w-0 truncate">{value}</span>
        <span className="ml-auto flex shrink-0 items-center">
          {action ?? (
            <>
              <Lock aria-hidden className="size-3.5" />
              {/* 자물쇠 그림만으로는 "못 고친다"가 전달되지 않는다 */}
              <span className="sr-only">바꿀 수 없는 값</span>
            </>
          )}
        </span>
      </div>
      {help ? <FieldHelp>{help}</FieldHelp> : null}
    </div>
  );
}
