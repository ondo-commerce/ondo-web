import { ToggleChip, cn } from "@ondo/ui";
import { Check } from "lucide-react";
import { BACKORDER_TEXT, STOCK_TEXT } from "../constants";
import { choiceKey, choiceKindOf } from "../derive";
import type { ChatChoice, ClarifyView } from "../types";

/**
 * 되묻기 말풍선 안 보기 줄. 보기 글자가 곧 보낼 본문이다.
 * - 재고(loop-05b S8-3 S8-4 S8-16, 디자인 결정 22 23): 옵션 알약 칩 줄바꿈
 * - 미송(loop-06 S3-1 S3-2, 결정 37 38): 주문 네모 버튼 세로 목록 + 끝에 `다른 주문이에요` 알약
 *
 * 고른 보기는 고름 모양 + 체크 + 숨긴 "(고름)". 줄이 잠겨도 고른 것만은 흐리게 하지 않는다 — 무엇을 골랐는지가
 * 지난 대화의 정보다(`disabled:opacity-100`, packages/ui는 그대로 두고 className으로).
 */
export function ClarifyChoices({
  view,
  locked,
  onChoose,
}: {
  view: ClarifyView;
  /** 세션 끊김 — `active`여도 잠근다(결정 29) */
  locked: boolean;
  onChoose: (choice: ChatChoice) => void;
}) {
  const enabled = view.active && !locked;
  return view.mode === "backorder" ? (
    <BackorderChoices view={view} enabled={enabled} onChoose={onChoose} />
  ) : (
    <div
      role="group"
      aria-label={STOCK_TEXT.choicesLabel}
      data-ac="S8-3 S8-11"
      className="flex flex-wrap gap-1.5"
    >
      {view.choices.map((choice) => {
        const key = choiceKey(choice);
        const selected = key === view.selectedKey;
        return (
          <ToggleChip
            key={key}
            selected={selected}
            disabled={!enabled}
            onClick={() => onChoose(choice)}
            data-ac="S8-3 S8-4 S8-16"
            className={cn(
              "phone:h-11 phone:px-3",
              selected && "disabled:opacity-100",
            )}
          >
            <SelectedMark selected={selected} />
            {choice.label}
            <SelectedSr selected={selected} />
          </ToggleChip>
        );
      })}
    </div>
  );
}

/**
 * 미송 보기 목록(결정 37). 주문 글자가 30자를 넘어 알약이면 두 줄로 접힐 때 경계가 흐려진다(B안 기각) — 한 보기 =
 * 테두리 네모 한 칸, 왼쪽 정렬, 줄바꿈만 하고 말줄임은 없다(S3-1 잘림 0). `다른 주문이에요`는 모양을 달리해
 * 주문으로 오해하지 않게 끝에 알약 하나(결정 38).
 */
function BackorderChoices({
  view,
  enabled,
  onChoose,
}: {
  view: ClarifyView;
  enabled: boolean;
  onChoose: (choice: ChatChoice) => void;
}) {
  return (
    <div
      role="group"
      aria-label={BACKORDER_TEXT.choicesLabel}
      data-ac="S3-1 S3-2"
      className="grid gap-1.5"
    >
      {view.choices.map((choice) => {
        const key = choiceKey(choice);
        const selected = key === view.selectedKey;
        if (choiceKindOf(choice) === "NOT_LISTED")
          return (
            <ToggleChip
              key={key}
              selected={selected}
              disabled={!enabled}
              onClick={() => onChoose(choice)}
              data-kind="NOT_LISTED"
              data-ac="S3-4"
              className={cn(
                "justify-self-start phone:h-11 phone:px-3",
                selected && "disabled:opacity-100",
              )}
            >
              <SelectedMark selected={selected} />
              {choice.label}
              <SelectedSr selected={selected} />
            </ToggleChip>
          );
        return (
          <button
            key={key}
            type="button"
            disabled={!enabled}
            onClick={() => onChoose(choice)}
            data-backorder-id={choice.backorderId ?? undefined}
            data-ac="S3-1 S3-2"
            className={cn(
              "focus-visible:ring-ring flex min-h-9 w-full items-start gap-1.5 rounded-control border px-3 py-1.75 text-left text-sm leading-5 [overflow-wrap:anywhere] whitespace-normal focus-visible:ring-2 focus-visible:outline-hidden disabled:cursor-not-allowed disabled:opacity-50 phone:min-h-11 phone:py-2.75",
              selected
                ? "border-primary bg-accent text-accent-foreground disabled:opacity-100"
                : "border-border bg-card text-foreground",
            )}
          >
            {selected ? (
              <Check aria-hidden className="mt-0.75 size-3.5 shrink-0" />
            ) : null}
            <span className="min-w-0">{choice.label}</span>
            <SelectedSr selected={selected} />
          </button>
        );
      })}
    </div>
  );
}

function SelectedMark({ selected }: { selected: boolean }) {
  return selected ? <Check aria-hidden className="size-3.5" /> : null;
}

/** 색(테두리)만으로 고른 것을 알리지 않는다(05b 결정 23) */
function SelectedSr({ selected }: { selected: boolean }) {
  return selected ? (
    <span className="sr-only">{STOCK_TEXT.selectedSr}</span>
  ) : null;
}
