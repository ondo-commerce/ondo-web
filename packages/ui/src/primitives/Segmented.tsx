"use client";

import * as ToggleGroupPrimitive from "@radix-ui/react-toggle-group";
import {
  Children,
  isValidElement,
  useEffect,
  useState,
  type ComponentProps,
  type ReactElement,
} from "react";
import { cn } from "../lib/cn";

/* Root의 props는 single/multiple 유니온이다. 세그먼트는 항상 single이므로 그쪽만 뽑아 쓴다 */
export type SegmentedProps = Omit<
  Extract<ComponentProps<typeof ToggleGroupPrimitive.Root>, { type: "single" }>,
  "type"
>;

/**
 * 2택 세그먼트 토글 (판매중/시즌 종료, 정산 상태/미수 원장 등).
 * 항상 하나가 선택돼 있어야 하므로 빈 값으로 되돌아가는 것을 막는다.
 *
 * 선택 표시를 **칸이 아니라 별도의 조각(thumb) 하나**가 맡는다. 칸마다 배경을
 * 켜고 끄면 A에서 사라지고 B에서 생기는 것이라 옮겨갈 물체가 없다 — transition은
 * 같은 요소의 속성 변화만 보간하기 때문이다. 조각 하나를 옮기면 그 사이가 이어진다.
 *
 * 칸 폭을 grid로 균등하게 맞추는 이유도 같다. 폭이 같으면 조각의 이동이 항상
 * "칸 하나만큼"이라 실측(offsetLeft/offsetWidth) 없이 %로 계산된다.
 * 라벨 길이에 따라 칸 폭을 다르게 하려면 실측 + ResizeObserver가 필요하다.
 */
export function Segmented({
  className,
  value,
  onValueChange,
  children,
  ...props
}: SegmentedProps) {
  /* 첫 페인트에는 애니메이션을 끈다. 1번이 선택된 채로 열리면 조각이 왼쪽 끝에서
     미끄러져 들어오기 때문이다. useEffect는 첫 페인트가 끝난 뒤에 돌므로,
     여기서 true가 되는 순간부터가 "사용자가 실제로 볼 수 있는 이동"이다 */
  const [animate, setAnimate] = useState(false);

  useEffect(() => {
    setAnimate(true);
  }, []);

  /*
   * 칸 수와 선택 인덱스를 **같은 배열**에서 뽑는다. Children.count는 조건부 렌더로
   * 생긴 null까지 세는데 그건 화면에 안 나오므로, 그것만 쓰면 칸 수가 실제보다
   * 많아져 조각 폭이 좁아지고 이동 거리도 어긋난다.
   */
  const items = Children.toArray(children).filter(
    (child): child is ReactElement<{ value?: string }> => isValidElement(child),
  );
  const count = items.length;

  /* 못 찾으면 findIndex가 -1을 돌려준다. 비제어로 쓰거나 아직 선택이 없을 때가
     그 경우라 0번으로 떨어뜨린다 */
  const selectedIndex = Math.max(
    0,
    items.findIndex((item) => item.props.value === value),
  );

  return (
    <ToggleGroupPrimitive.Root
      {...props}
      type="single"
      value={value}
      /* 선택된 칸을 다시 누르면 Radix가 ""를 돌려준다. 그대로 흘리면 아무것도
         선택되지 않은 상태가 되어 조각이 갈 자리를 잃는다 — 빈 값은 여기서 버린다.
         JSDoc이 약속하던 동작을 호출부가 아니라 이 안에서 지킨다 */
      onValueChange={(next) => {
        if (next) onValueChange?.(next);
      }}
      className={cn(
        /* isolate: 조각을 -z-10으로 깔기 위한 쌓임 맥락. 없으면 패널 배경 뒤로
           빠져 아무것도 안 보인다 (Table의 hover 레이어와 같은 이유).
           grid: 칸 폭을 균등하게 만든다 */
        "bg-secondary relative isolate inline-grid gap-0 rounded-control p-1",
        className,
      )}
      style={{ gridTemplateColumns: `repeat(${count}, 1fr)` }}
    >
      {/*
       * 움직이는 흰 조각. absolute라 grid 흐름에서 빠지므로 칸을 하나 차지하지 않는다.
       * 폭은 안쪽 여백(p-1 = 0.25rem × 2)을 뺀 나머지를 칸 수로 나눈 값이다.
       */}
      <span
        aria-hidden
        className={cn(
          "bg-card absolute inset-y-1 left-1 -z-10 rounded-control shadow-sm",
          animate &&
            "transition-transform duration-200 ease-out motion-reduce:transition-none",
        )}
        style={{
          width: `calc((100% - 0.5rem) / ${count})`,
          /* 칸 폭이 모두 같으므로 조각 자신의 폭 기준 %로만 옮기면 된다.
             left가 아니라 transform인 이유: left를 애니메이션하면 매 프레임
             레이아웃이 다시 계산된다. transform은 합성 단계에서만 처리된다 */
          transform: `translateX(${selectedIndex * 100}%)`,
        }}
      />
      {children}
    </ToggleGroupPrimitive.Root>
  );
}

Segmented.Item = function SegmentedItem({
  className,
  ...props
}: ComponentProps<typeof ToggleGroupPrimitive.Item>) {
  return (
    <ToggleGroupPrimitive.Item
      className={cn(
        /* cursor-pointer: Tailwind v4 preflight가 button의 커서를 default로 바꾼다
           (Button·Select·ToggleChip과 같은 이유) */
        "text-muted-foreground grid h-8 cursor-pointer place-items-center rounded-control px-5 text-sm font-medium transition-colors",
        /* 배경과 그림자는 위의 조각이 그린다. 여기서 다시 칠하면 조각이 이동하는
           동안 두 개의 흰 면이 동시에 보인다 — 남는 건 글자색뿐이다 */
        "data-[state=on]:text-primary",
        // "focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-hidden",
        className,
      )}
      {...props}
    />
  );
};
