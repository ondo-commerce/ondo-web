import { cn } from "@ondo/ui";
import { APPROVAL_STEP_STATE_LABEL } from "../constants";
import type { ApprovalStep } from "../types";

/**
 * 신청 완료 → 심사 중 → 승인 완료(또는 거절) 3단 진행 표시.
 *
 * 켜짐과 꺼짐을 **색으로만** 가르지 않는다. 지난 단계·지금 단계는 글자가 진하고
 * 굵고(500), 아직 안 온 단계는 회색에 보통 굵기다. 색을 못 읽어도 굵기가 남는다.
 *
 * 순서가 뜻을 갖는 목록이라 `<ol>`이다. 화면 낭독기에는 `몇 단계 중 몇 번째`와
 * `지금 단계`가 글자로 읽힌다 — 점 하나로는 아무것도 전달되지 않는다.
 */
export function ApprovalSteps({ steps }: { steps: ApprovalStep[] }) {
  return (
    <ol
      aria-label="가입 심사 진행"
      className="border-border flex items-center gap-2.5 rounded-control border px-4 py-3.5"
    >
      {steps.map((step, index) => (
        <li
          key={step.label}
          aria-current={step.state === "current" ? "step" : undefined}
          className={cn(
            "flex items-center text-body",
            step.state === "todo"
              ? "text-muted-foreground"
              : "text-foreground font-medium",
            /* 다음 칸까지 잇는 선. 마지막 칸 뒤에는 두지 않는다 */
            index < steps.length - 1 &&
              "flex-1 after:bg-border after:ml-2.5 after:h-px after:flex-1 after:content-['']",
          )}
        >
          <span
            aria-hidden
            className={cn(
              "mr-1.75 size-1.75 shrink-0 rounded-full",
              step.state === "todo" ? "bg-border-strong" : "bg-foreground",
            )}
          />
          <span className="whitespace-nowrap">{step.label}</span>
          <span className="sr-only">
            {` (${steps.length}단계 중 ${index + 1}번째 · ${APPROVAL_STEP_STATE_LABEL[step.state]})`}
          </span>
        </li>
      ))}
    </ol>
  );
}
