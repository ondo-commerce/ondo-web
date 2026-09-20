"use client";

import * as ToggleGroupPrimitive from "@radix-ui/react-toggle-group";
import {
  Children,
  isValidElement,
  useEffect,
  useRef,
  useState,
  type ComponentProps,
  type ReactElement,
} from "react";
import { cn } from "../lib/cn";

/* Root의 props는 single/multiple 유니온이다. 세그먼트는 항상 single이므로 그쪽만 뽑아 쓴다 */
export type SegmentedProps = Omit<
  Extract<ComponentProps<typeof ToggleGroupPrimitive.Root>, { type: "single" }>,
  "type"
> & {
  /**
   * 칸 폭을 **라벨 길이에 맞춘다.** 기본값(false)은 균등 폭이다.
   *
   * 기본을 바꾸지 않는 이유: 균등 폭일 때는 조각의 이동이 항상 "칸 하나만큼"이라
   * 실측 없이 %로 계산된다(아래 참고). 라벨 길이가 비슷한 2~3택에서는 그게 더 안정적이고,
   * 이미 쓰고 있는 화면들의 모양을 바꾸지 않는다.
   *
   * `fit`을 켜면 칸 폭이 제각각이라 %로는 조각이 갈 자리를 못 구한다. 그래서 선택된 칸을
   * 실측하고 `ResizeObserver`로 따라간다 — 라벨의 건수가 바뀌거나 폰트가 늦게 로드돼
   * 폭이 달라져도 조각이 어긋나지 않아야 하기 때문이다.
   */
  fit?: boolean;
};

/**
 * 2택 세그먼트 토글 (판매중/시즌 종료, 정산 상태/미수 원장 등).
 * 항상 하나가 선택돼 있어야 하므로 빈 값으로 되돌아가는 것을 막는다.
 *
 * 선택 표시를 **칸이 아니라 별도의 조각(thumb) 하나**가 맡는다. 칸마다 배경을
 * 켜고 끄면 A에서 사라지고 B에서 생기는 것이라 옮겨갈 물체가 없다 — transition은
 * 같은 요소의 속성 변화만 보간하기 때문이다. 조각 하나를 옮기면 그 사이가 이어진다.
 *
 * 칸 폭을 grid로 균등하게 맞추는 이유도 같다. 폭이 같으면 조각의 이동이 항상
 * "칸 하나만큼"이라 실측 없이 %로 계산된다.
 * 라벨 길이에 맞춰 칸 폭을 다르게 하려면 `fit`을 켠다 — 그때는 실측 + ResizeObserver로 간다.
 */
export function Segmented({
  className,
  value,
  onValueChange,
  children,
  fit = false,
  ...props
}: SegmentedProps) {
  /* 첫 페인트에는 애니메이션을 끈다. 1번이 선택된 채로 열리면 조각이 왼쪽 끝에서
     미끄러져 들어오기 때문이다. useEffect는 첫 페인트가 끝난 뒤에 돌므로,
     여기서 true가 되는 순간부터가 "사용자가 실제로 볼 수 있는 이동"이다 */
  const [animate, setAnimate] = useState(false);

  useEffect(() => {
    setAnimate(true);
  }, []);

  const rootRef = useRef<HTMLDivElement>(null);
  /** fit일 때만 쓴다. 측정 전(SSR 직후)에는 null이라 아래 균등 폭 계산으로 떨어진다 */
  const [thumb, setThumb] = useState<{ left: number; width: number } | null>(
    null,
  );

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

  /*
   * 선택된 칸의 위치·폭을 실측한다. offsetLeft 대신 getBoundingClientRect를 쓰는 이유는
   * offsetLeft의 기준(테두리 상자냐 패딩 상자냐)이 브라우저마다 달라서다 — 두 사각형을
   * 빼면 기준이 무엇이든 같은 값이 나온다.
   *
   * 칸 하나하나까지 관찰한다. 통 전체 폭이 고정된 자리에서는 라벨의 건수가 바뀌어도
   * 통 크기가 안 변해서, 루트만 보면 놓친다.
   */
  useEffect(() => {
    if (!fit) return;
    const root = rootRef.current;
    if (!root) return;

    const measure = () => {
      const items = root.querySelectorAll<HTMLElement>(":scope > button");
      const el = items[selectedIndex];
      if (!el) return;
      const base = root.getBoundingClientRect();
      const rect = el.getBoundingClientRect();
      setThumb({ left: rect.left - base.left, width: rect.width });
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    root
      .querySelectorAll<HTMLElement>(":scope > button")
      .forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [fit, selectedIndex, count, children]);

  return (
    <ToggleGroupPrimitive.Root
      {...props}
      ref={rootRef}
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
      style={{
        gridTemplateColumns: `repeat(${count}, ${fit ? "auto" : "1fr"})`,
      }}
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
            "duration-200 ease-out motion-reduce:transition-none " +
              /* fit은 칸마다 폭이 달라서 폭도 같이 보간해야 한다. transform만 쓰던
                 원래 의도(합성 단계에서만 처리)에서 한 발 물러선 것이지만, 조각은
                 absolute라 폭이 변해도 형제들의 배치는 다시 계산되지 않는다 */
              (fit ? "transition-[transform,width]" : "transition-transform"),
        )}
        style={
          thumb
            ? /* 실측값. left-1을 style의 left:0으로 덮고 이동은 transform이 맡는다 —
                 p-1(4px)을 숫자로 박지 않으려는 것이다(루트 폰트 크기가 바뀌면 4가 아니다) */
              {
                left: 0,
                width: thumb.width,
                transform: `translateX(${thumb.left}px)`,
              }
            : {
                width: `calc((100% - 0.5rem) / ${count})`,
                /* 칸 폭이 모두 같으므로 조각 자신의 폭 기준 %로만 옮기면 된다.
                   left가 아니라 transform인 이유: left를 애니메이션하면 매 프레임
                   레이아웃이 다시 계산된다. transform은 합성 단계에서만 처리된다 */
                transform: `translateX(${selectedIndex * 100}%)`,
              }
        }
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
        "text-accent-foreground grid h-7 cursor-pointer place-items-center rounded-control px-3 text-[13px] font-medium transition-colors",
        /* 배경과 그림자는 위의 조각이 그린다. 여기서 다시 칠하면 조각이 이동하는
           동안 두 개의 흰 면이 동시에 보인다 — 남는 건 글자색뿐이다 */
        "data-[state=on]:text-foreground",
        // "focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-hidden",
        className,
      )}
      {...props}
    />
  );
};
