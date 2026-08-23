import { cva, type VariantProps } from "class-variance-authority";
import type {
  HTMLAttributes,
  TableHTMLAttributes,
  TdHTMLAttributes,
  ThHTMLAttributes,
} from "react";
import { cn } from "../lib/cn";

/**
 * 조밀한 데이터 표. 수량·금액이 대부분이라 **오른쪽 정렬 + tabular-nums가 기본**이고,
 * 텍스트 열만 align="left"로 되돌린다. 셀 색은 tone으로만 준다.
 *
 * 폭이 모자라면 **표를 줄이지 않고 가로로 스크롤한다.** 열이 눌려 글자가 줄바꿈되면
 * 숫자를 세로로 훑을 수 없기 때문이다. min-w-max가 "줄바꿈 없이 그렸을 때의 너비"를
 * 최소값으로 박아 줄바꿈이 생길 상황 자체를 없애고, 스크롤 컨테이너의 min-content가
 * 0으로 잡히는 성질 덕에 그 너비가 바깥 패널을 밀어내지 않는다. 둘은 세트다.
 */
export function Table({
  className,
  ...props
}: TableHTMLAttributes<HTMLTableElement>) {
  return (
    <div className="scroll-slim overflow-x-auto">
      <table
        className={cn("w-full min-w-max border-collapse text-sm", className)}
        {...props}
      />
    </div>
  );
}

Table.Head = function TableHead(
  props: HTMLAttributes<HTMLTableSectionElement>,
) {
  return <thead {...props} />;
};

Table.Body = function TableBody({
  className,
  ...props
}: HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <tbody
      className={cn("[&>tr:last-child>td]:border-b-0", className)}
      {...props}
    />
  );
};

export interface TableRowProps extends HTMLAttributes<HTMLTableRowElement> {
  /** 우측 상세 패널에 띄워 둔 행. 화면당 한 행만 표시한다 */
  selected?: boolean;
}

/* 양 끝 셀의 ::before만 깎는다. 가운데 셀까지 깎으면 셀마다 끊긴 조각이 된다.
   머리글 행은 th라 ::before가 없어서 이 규칙에 걸리지 않는다 */
const rowShape =
  "[&>td:first-child]:before:rounded-l-control " +
  "[&>td:last-child]:before:rounded-r-control";

Table.Row = function TableRow({
  className,
  selected,
  ...props
}: TableRowProps) {
  return (
    <tr
      aria-selected={selected}
      className={cn(
        rowShape,
        "hover:[&>td]:before:bg-secondary",
        selected && "[&>td]:before:bg-accent",
        className,
      )}
      {...props}
    />
  );
};

const align = {
  left: "text-left",
  center: "text-center",
  right: "text-right",
} as const;

export interface TableThProps extends ThHTMLAttributes<HTMLTableCellElement> {
  align?: keyof typeof align;
}

Table.Th = function TableTh({
  className,
  align: a = "right",
  ...props
}: TableThProps) {
  return (
    <th
      className={cn(
        "border-y border-gray-100 text-muted-foreground px-3 py-2 text-body font-normal whitespace-nowrap",
        align[a],
        className,
      )}
      {...props}
    />
  );
};

/* hover 면을 셀 배경이 아니라 ::before 레이어로 그린다 (AccordionRow와 같은 방식).
   구분선(border-b)에 radius를 주면 선이 같이 휘기 때문에, 둥근 건 이 레이어만이다.
   inset-0은 패딩 박스 기준이라 border-b 바깥으로 넘지 않는다 — 선은 직선으로 남는다.
   isolate가 없으면 -z-10이 패널 배경 뒤로 빠져 아무것도 안 보인다 */
const td = cva(
  "border-gray-100 relative isolate border-b p-2 " +
    "before:absolute before:inset-0 before:-z-10 before:transition-colors",
  {
    variants: {
      tone: {
        default: "text-foreground",
        muted: "text-muted-foreground",
        soft: "text-secondary-foreground",
        success: "text-success",
        danger: "text-destructive",
      },
      numeric: {
        true: "tabular-nums",
        false: "",
      },
    },
    defaultVariants: { tone: "default", numeric: true },
  },
);

export interface TableTdProps
  extends
    Omit<TdHTMLAttributes<HTMLTableCellElement>, "align">,
    VariantProps<typeof td> {
  align?: keyof typeof align;
}

Table.Td = function TableTd({
  className,
  align: a = "right",
  tone,
  numeric,
  ...props
}: TableTdProps) {
  return (
    <td
      className={cn(
        td({ tone, numeric: a === "left" ? false : numeric }),
        align[a],
        className,
      )}
      {...props}
    />
  );
};
