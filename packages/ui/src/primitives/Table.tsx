import { cva, type VariantProps } from "class-variance-authority";
import { ChevronRight } from "lucide-react";
import type {
  HTMLAttributes,
  ReactNode,
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
export interface TableProps extends TableHTMLAttributes<HTMLTableElement> {
  /**
   * 머리글 행을 세로 스크롤에 고정한다. **표가 세로 스크롤을 직접 받게 되는 옵션이다.**
   *
   * 왜 옵션이 필요한가: 이 래퍼는 원래도 세로 스크롤 컨테이너였다. `overflow-x: auto`를
   * 주면 CSS 규칙상 `overflow-y: visible`이 `auto`로 계산되기 때문이다. 다만 높이 제한이
   * 없어서 실제로는 스크롤하지 않고 늘어나기만 했고, 세로 스크롤은 바깥 `Panel.Body`가
   * 받았다. sticky는 **가장 가까운 스크롤 컨테이너** 기준이라 thead 입장에서는 이 래퍼가
   * 기준인데 그게 안 움직이니, 클래스만 붙여서는 아무 일도 일어나지 않는다.
   *
   * 그래서 이 옵션은 래퍼에 높이(min-h-0 flex-1)를 줘서 **여기가 실제로 스크롤하게** 만든다.
   * 부르는 쪽은 표를 `Panel.Body` 안이 아니라 `Panel`의 flex 자식으로 직접 놓아야 한다 —
   * 안 그러면 스크롤 컨테이너가 둘이 겹쳐 막대가 두 개 생긴다.
   *
   * 경계선을 border가 아니라 inset shadow로 그리는 이유: `border-collapse` 표에서
   * sticky 셀의 border는 셀을 따라 움직이지 않는다(Chrome/Safari의 오래된 동작).
   * 그래서 머리글의 위아래 선만 그림자로 바꿔 그린다.
   *
   * `overscroll-contain`도 같이 붙는다. 표 안의 표처럼 스크롤 컨테이너가 중첩되면,
   * 안쪽을 끝까지 내렸을 때 휠이 바깥으로 넘어가 바깥 목록이 툭 튄다(scroll chaining).
   * 중첩 스크롤이 싸구려로 느껴지는 주된 원인이라 여기서 끊는다.
   */
  stickyHead?: boolean;
}

export function Table({ className, stickyHead, ...props }: TableProps) {
  return (
    <div
      className={cn(
        "scroll-slim",
        stickyHead
          ? "min-h-0 flex-1 overflow-auto overscroll-contain"
          : "overflow-x-auto",
      )}
    >
      <table
        className={cn(
          "w-full min-w-max border-collapse text-sm",
          stickyHead &&
            "[&>thead>tr>th]:sticky [&>thead>tr>th]:top-0 [&>thead>tr>th]:z-10 " +
              "[&>thead>tr>th]:bg-card [&>thead>tr>th]:border-y-0 " +
              "[&>thead>tr>th]:shadow-[inset_0_1px_0_var(--color-gray-100),inset_0_-1px_0_var(--color-gray-100)]",
          className,
        )}
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
  return <tbody className={className} {...props} />;
};

export interface TableRowProps extends HTMLAttributes<HTMLTableRowElement> {
  /** 우측 상세 패널에 띄워 둔 행. 화면당 한 행만 표시한다 */
  selected?: boolean;
}

/* 양 끝 셀의 ::before만 깎는다. 가운데 셀까지 깎으면 셀마다 끊긴 조각이 된다.
   머리글 행은 th라 ::before가 없어서 이 규칙에 걸리지 않는다 */
// const rowShape =
//   "[&>td:first-child]:before:rounded-l-control " +
//   "[&>td:last-child]:before:rounded-r-control";

Table.Row = function TableRow({
  className,
  selected,
  ...props
}: TableRowProps) {
  return (
    <tr
      aria-selected={selected}
      className={cn(
        // rowShape,
        "hover:[&>td]:before:bg-secondary",
        selected && "[&>td]:before:bg-secondary",
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

export interface TableExpandableRowProps {
  /** 펼쳐져 있는가. 제어형만 지원한다 — 어느 행이 열렸는지는 화면 상태다 */
  open: boolean;
  onToggle: () => void;
  /**
   * 확장행이 덮을 열 수 = **펼침 열(1) + 목록 열 수**.
   * 실제 머리글 수와 어긋나면 확장행이 표 폭을 다 못 받거나 넘쳐서 열이 밀린다.
   */
  colSpan: number;
  /** 스크린리더용 이름. `${label} 펼치기` / `${label} 접기`로 쓰인다 */
  label: string;
  /** 확장행의 DOM id. 접힘 행의 `aria-controls`가 이 값을 가리킨다 */
  detailId: string;
  /** 접힌 상태에서도 보이는 셀들. **chevron 열 다음부터** 넣는다 */
  children: ReactNode;
  /** 펼침 영역 내용. 없으면 확장행 자체를 그리지 않는다 */
  detail?: ReactNode;
  /** 확장행 `<td>`에 덧붙일 클래스. 기본 여백·테두리를 바꿔야 할 때만 쓴다 */
  detailClassName?: string;
  className?: string;
}

/**
 * 펼쳐지는 목록 행. 주문·상품·미송·출고·재고·정산 여섯 탭이 전부 이 한 벌을 쓴다.
 *
 * **`AccordionRow`를 쓰지 않는다.** 저건 div 기반이라 표 안에 넣으면 열 폭이 안 맞는다.
 * 대신 `Table.Row` + chevron 버튼(`aria-expanded`/`aria-controls`) + 두 번째 `<tr>`의
 * `colSpan` 확장행으로 만든다 — 확장행이 표의 전체 폭을 그대로 받는다.
 *
 * 펼쳐진 행은 배경이 회색이 된다(`Table.Row`의 selected). **지금 보고 있는 행이라는
 * 표시는 그 배경 하나가 맡는다** — 부르는 쪽에서 셀 내용까지 바꾸지 않는다.
 *
 * 한때는 배지를 평문으로 내리게 했는데, `Badge`가 높이 고정(h-6.5)이라 글자로 바뀌는
 * 순간 행이 6px 낮아졌다. 펼칠 때마다 표가 움찔해서 되돌렸다.
 */
Table.ExpandableRow = function TableExpandableRow({
  open,
  onToggle,
  colSpan,
  label,
  detailId,
  children,
  detail,
  detailClassName,
  className,
}: TableExpandableRowProps) {
  return (
    <>
      <Table.Row
        selected={open}
        className={cn("cursor-pointer", className)}
        onClick={onToggle}
        aria-label={`${label} 상세`}
      >
        <Table.Td align="center">
          {/* 행 전체 클릭과 같은 토글이라 버블링을 끊는다 — 두 번 열렸다 닫히면 안 된다 */}
          <button
            type="button"
            aria-expanded={open}
            aria-controls={detailId}
            aria-label={`${label} ${open ? "접기" : "펼치기"}`}
            className="focus-visible:ring-ring text-border-strong inline-flex rounded-button p-1 focus-visible:ring-2 focus-visible:outline-hidden"
            onClick={(e) => {
              e.stopPropagation();
              onToggle();
            }}
          >
            {/* 펼치면 90°만 돈다 — `>`를 180° 돌리면 `<`가 되어 "펼침"으로 안 읽힌다 */}
            <ChevronRight
              aria-hidden
              className={cn("size-4 transition-transform", open && "rotate-90")}
            />
          </button>
        </Table.Td>
        {children}
      </Table.Row>

      {open && detail ? (
        <tr id={detailId}>
          {/*
            확장행은 표 폭을 통째로 받는다.

            max-w-0이 없으면 안쪽 표의 너비가 바깥 목록 표의 열 폭 계산에 끼어들어,
            내용이 많은 행을 펼칠 때 목록 전체가 가로로 늘어난다(마지막 열이 밀려난다).
            0으로 못박으면 이 셀은 폭 계산에서 빠지고 표 폭만큼 늘어나며, 넘치는 안쪽 표는
            자기 스크롤 컨테이너 안에서 흐른다.

            isolate가 핵심이다. 안쪽 표도 머리글이 sticky(z-10)인데, 이 셀이 스태킹
            컨텍스트를 안 만들면 그 z-10이 바깥 목록 머리글의 z-10과 같은 무대에서 겨룬다.
            같은 층에서는 DOM 순서가 늦은 쪽이 이기고 thead보다 tbody가 뒤라서,
            **안쪽 머리글이 바깥 머리글을 덮는다.** isolate로 가둬 두면 이 셀은 z-auto
            층에 머물러 바깥 머리글(z-10)이 항상 위에 온다.
            (`Table.Td`는 이미 isolate를 갖고 있는데, 확장행은 생짜 `<td>`라 빠져 있었다.)
          */}
          <td colSpan={colSpan} className="isolate max-w-0 p-0">
            <div
              className={cn("border-border border p-4 mt-1", detailClassName)}
            >
              {detail}
            </div>
          </td>
        </tr>
      ) : null}
    </>
  );
};
