import { ToggleChip, cn } from "@ondo/ui";
import { Check } from "lucide-react";
import { STOCK_TEXT } from "../constants";
import type { ChatChoice, ClarifyView } from "../types";

/**
 * 되묻기 말풍선 안 옵션 칩 줄(loop-05b S8-3 S8-4 S8-16, 디자인 결정 22 23). 칩 글자가 곧 보낼 본문이다.
 *
 * 가로 스크롤이 아니라 줄바꿈 — 카카오처럼 옆으로 밀면 390에서 뒤쪽 칩이 안 보인다. 높이 28, ≤40rem 44.
 * 고른 칩은 ToggleChip 고름 모양 + 체크 + 숨긴 "(고름)". 줄이 잠겨도 고른 칩만은 흐리게 하지 않는다 —
 * 무엇을 골랐는지가 지난 대화의 정보다(`disabled:opacity-100`, packages/ui는 그대로 두고 className으로).
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
  return (
    <div
      role="group"
      aria-label={STOCK_TEXT.choicesLabel}
      data-ac="S8-3 S8-11"
      className="flex flex-wrap gap-1.5"
    >
      {view.choices.map((choice) => {
        const selected = choice.variantId === view.selectedVariantId;
        return (
          <ToggleChip
            key={choice.variantId}
            selected={selected}
            disabled={!enabled}
            onClick={() => onChoose(choice)}
            data-ac="S8-3 S8-4 S8-16"
            className={cn(
              "phone:h-11 phone:px-3",
              selected && "disabled:opacity-100",
            )}
          >
            {selected ? <Check aria-hidden className="size-3.5" /> : null}
            {choice.label}
            {selected ? (
              <span className="sr-only">{STOCK_TEXT.selectedSr}</span>
            ) : null}
          </ToggleChip>
        );
      })}
    </div>
  );
}
