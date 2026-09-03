import { cn } from "@ondo/ui";
import { APPROVAL_STEP_STATE_LABEL } from "../constants";
import type { ApprovalStep } from "../types";

/**
 * 3단 진행 표시. 켜짐과 꺼짐을 **색으로만** 가르지 않는다 — 색을 못 읽어도 굵기가
 * 남고, 낭독기에는 `몇 단계 중 몇 번째`와 `지금 단계`가 글자로 읽힌다.
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
            "text-body flex items-center",
            step.state === "todo"
              ? "text-muted-foreground"
              : "text-foreground font-medium",
            /* 다음 칸까지 잇는 선. 마지막 칸 뒤에는 두지 않는다 */
            index < steps.length - 1 &&
              "after:bg-border flex-1 after:ml-2.5 after:h-px after:flex-1 after:content-['']",
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
