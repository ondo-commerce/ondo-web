import { Button, cn } from "@ondo/ui";
import { Check } from "lucide-react";
import { BACKORDER_TEXT, STOCK_TEXT } from "../constants";
import { choiceKey, choiceKindOf } from "../derive";
import type { ChatChoice, ClarifyView, ReplyLinkView } from "../types";
import { ReplyScreenLink } from "./ReplyScreenLink";

/** 되묻기의 보기는 고르면 그 글을 보낸다. 지난 대화에서도 무엇을 골랐는지 남긴다. */
export function ClarifyChoices({
  view,
  locked,
  link,
  onChoose,
}: {
  view: ClarifyView;
  /** 세션 끊김 — `active`여도 잠근다(결정 29) */
  locked: boolean;
  /**
   * 보기 줄 아래 링크(`replyLinkOf`). 미송 되묻기만 있다(loop-08f §4-1 1). 보기 잠금(`enabled`)과 따로라
   * 지난 되묻기, 잠긴 되묻기에서도 눌린다(Q4 ①)
   */
  link: ReplyLinkView | null;
  onChoose: (choice: ChatChoice) => void;
}) {
  const enabled = view.active && !locked;
  return view.mode === "backorder" ? (
    <>
      <BackorderChoices view={view} enabled={enabled} onChoose={onChoose} />
      {link === null ? null : <ReplyScreenLink link={link} />}
    </>
  ) : (
    <div
      role="group"
      aria-label={STOCK_TEXT.choicesLabel}
      data-ac="S8-3 S8-11"
      className="flex flex-wrap gap-2"
    >
      {view.choices.map((choice) => {
        const key = choiceKey(choice);
        const selected = key === view.selectedKey;
        return (
          <Button
            key={key}
            type="button"
            variant="line"
            size="sm"
            aria-pressed={selected}
            disabled={!enabled}
            onClick={() => onChoose(choice)}
            data-ac="S8-3 S8-4 S8-16"
            className={cn(
              "phone:h-11 phone:px-3",
              selected && "bg-accent disabled:text-foreground",
            )}
          >
            <SelectedMark selected={selected} />
            {choice.label}
            <SelectedSr selected={selected} />
          </Button>
        );
      })}
    </div>
  );
}

/**
 * 미송 보기는 긴 주문명이 있어 한 줄에 한 보기로 두고 전체 이름을 줄바꿈한다.
 * 마지막의 `다른 주문이에요`는 주문 선택지와 구분할 수 있도록 내용 폭으로 둔다.
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
      className="grid gap-2"
    >
      {view.choices.map((choice) => {
        const key = choiceKey(choice);
        const selected = key === view.selectedKey;
        if (choiceKindOf(choice) === "NOT_LISTED")
          return (
            <Button
              key={key}
              type="button"
              variant="line"
              size="sm"
              aria-pressed={selected}
              disabled={!enabled}
              onClick={() => onChoose(choice)}
              data-kind="NOT_LISTED"
              data-ac="S3-4"
              className={cn(
                "justify-self-start phone:h-11 phone:px-3",
                selected && "bg-accent disabled:text-foreground",
              )}
            >
              <SelectedMark selected={selected} />
              {choice.label}
              <SelectedSr selected={selected} />
            </Button>
          );
        return (
          <Button
            key={key}
            type="button"
            variant="line"
            size="sm"
            aria-pressed={selected}
            disabled={!enabled}
            onClick={() => onChoose(choice)}
            data-backorder-id={choice.backorderId ?? undefined}
            data-ac="S3-1 S3-2"
            className={cn(
              "h-auto min-h-9 w-full items-start justify-start px-3 py-2 text-left whitespace-normal wrap-anywhere phone:min-h-11",
              selected && "bg-accent disabled:text-foreground",
            )}
          >
            {selected ? (
              <Check aria-hidden className="mt-0.75 size-3.5 shrink-0" />
            ) : null}
            <span className="min-w-0">{choice.label}</span>
            <SelectedSr selected={selected} />
          </Button>
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
