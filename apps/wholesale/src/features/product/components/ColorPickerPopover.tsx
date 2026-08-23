"use client";

import { Button, ColorDot, Popover, ToggleChip } from "@ondo/ui";
import { useState } from "react";
import { COLOR_PALETTE, type PaletteColor } from "../constants";

/** 팔레트 순서를 유지한 채 이름 목록을 색으로 되돌린다 */
function resolve(names: string[]): PaletteColor[] {
  return COLOR_PALETTE.flatMap((g) => g.colors).filter((c) =>
    names.includes(c.name),
  );
}

/**
 * 색상 마스터 팝오버 — 고정 팔레트 26종 6그룹. 자유 입력을 받지 않는다.
 *
 * 모달이 아니라 팝오버인 이유: 고르는 대상(색)과 결과가 보이는 곳(옵션 표)이
 * 같은 화면에 있다. 모달로 덮으면 지금 표에 무엇이 있는지 안 보인 채로 고르게 된다.
 *
 * 한 번 열어서 고를 색을 다 고르고 `확인`으로 확정한다. 고를 때마다 즉시
 * 반영하지 않는 이유는, 색 하나를 뺄 때마다 그 색의 사이즈 선택이 바로
 * 날아가면 되돌릴 방법이 없기 때문이다.
 *
 * `취소` 버튼이 없는 것은 팝오버라서다 — 바깥을 누르면 닫히고, 확정 전이므로
 * 초안은 그대로 버려진다. 모달과 달리 닫는 방법이 이미 화면에 있다.
 *
 * 결과는 클릭 순서가 아니라 **팔레트 순서**로 돌려준다 — 표의 행 순서가
 * 고를 때마다 달라지면 같은 상품인데 매번 다르게 보인다.
 *
 * URL을 바꾸지 않는다 (docs/12-routing 규칙 3-A: 모달 기본은 로컬 상태).
 */
export function ColorPickerPopover({
  selected,
  onConfirm,
  children,
}: {
  /** 지금 골라져 있는 색 이름들. 팝오버를 열 때 초안의 출발점이 된다 */
  selected: string[];
  onConfirm: (colors: PaletteColor[]) => void;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<string[]>(selected);

  // 열 때마다 현재 선택으로 초기화한다. 닫고 다시 열었을 때
  // 지난번 편집이 남아 있으면 "확정 안 한 것"이 확정된 것처럼 보인다
  const openChange = (next: boolean) => {
    if (next) setDraft(selected);
    setOpen(next);
  };

  const toggle = (name: string) =>
    setDraft((names) =>
      names.includes(name) ? names.filter((n) => n !== name) : [...names, name],
    );

  return (
    <Popover open={open} onOpenChange={openChange}>
      <Popover.Trigger asChild>{children}</Popover.Trigger>

      {/* 제목을 두지 않는다 — 트리거 버튼이 "색상 선택"이라 바로 아래에 같은 말을
          한 번 더 쓰는 꼴이 된다. 대신 aria-label로 이름만 남긴다.

          폭을 고정하지 않는다. 그룹을 열로 세우면 필요한 폭이 내용에서 정해지고,
          화면을 넘지 않도록 Radix가 알려주는 남은 폭/높이만 상한으로 건다 */}
      <Popover.Content
        aria-label="색상 선택"
        collisionPadding={12}
        className="flex max-h-(--radix-popover-content-available-height) max-w-(--radix-popover-content-available-width) flex-col"
      >
        <div className="scroll-slim min-h-0 flex-1 overflow-auto">
          {/* 그룹 하나가 열 하나이고 그 사이를 얇은 회색선으로 가른다.
              선은 divide-x로 각 열의 왼쪽에 붙으므로, 간격은 gap이 아니라
              열의 좌우 여백(px-4)이 만든다 — 그래야 선이 두 열 한가운데 온다.
              items-start를 쓰지 않는 이유: 열 높이가 제각각이면 선도 제 열
              길이만큼만 그어져 들쭉날쭉해진다. 늘어나는 건 열 상자뿐이고
              칩은 위에 그대로 쌓인다 */}
          <div className="flex divide-x divide-border">
            {COLOR_PALETTE.map((group) => (
              <div
                key={group.group}
                className="flex flex-col gap-1.5 px-5 first:pl-3 last:pr-3"
              >
                <p className="text-foreground mb-2 text-center whitespace-nowrap">
                  {group.group}
                </p>
                {/* justify-start: 열 안에서 칩이 열 폭만큼 늘어나므로, 가운데
                    정렬이면 이름 길이에 따라 색 점이 좌우로 흩어진다 */}
                {group.colors.map((color) => (
                  <ToggleChip
                    key={color.name}
                    selected={draft.includes(color.name)}
                    onClick={() => toggle(color.name)}
                    className="justify-start mb-0.5"
                  >
                    <ColorDot color={color.hex} className="size-3.5" />
                    {color.name}
                  </ToggleChip>
                ))}
              </div>
            ))}
          </div>
        </div>

        <div className="mt-6 flex shrink-0 items-center justify-end gap-2">
          <Button
            variant="soft"
            onClick={() => setDraft([])}
            disabled={draft.length === 0}
          >
            초기화
          </Button>
          <Button
            onClick={() => {
              onConfirm(resolve(draft));
              setOpen(false);
            }}
          >
            확인 ({draft.length})
          </Button>
        </div>
      </Popover.Content>
    </Popover>
  );
}
