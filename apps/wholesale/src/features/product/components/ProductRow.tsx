"use client";

import { Table } from "@ondo/ui";
import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import type { Product } from "../types";

/**
 * 상품 목록 행 하나 + 펼침 영역.
 *
 * **`AccordionRow`를 쓰지 않는다.** 저건 div 기반이라 표 안에 넣으면 열 폭이 안 맞는다.
 * 주문 탭(`OrderRow`)과 같은 방식이다 — `Table.Row` + chevron 버튼
 * (`aria-expanded`/`aria-controls`) + 두 번째 `<tr>`의 `colSpan` 확장행.
 * 확장행이 표의 전체 폭을 그대로 받는다.
 *
 * 펼쳐진 행은 배경이 회색이 되고 배지가 평문으로 바뀐다(주문 탭과 같은 규칙).
 * 지금 보고 있는 행이므로 상태를 색으로 다시 강조할 이유가 없다.
 */
export function ProductRow({
  product,
  open,
  onToggle,
  children,
}: {
  product: Product;
  open: boolean;
  onToggle: () => void;
  /** 펼침 영역에 들어가는 내용 */
  children: ReactNode;
}) {
  const detailId = `product-detail-${product.id}`;

  return (
    <>
      <Table.Row
        selected={open}
        className="cursor-pointer"
        onClick={onToggle}
        aria-label={`${product.name} 상세`}
      >
        <Table.Td align="center">
          {/* 행 전체 클릭과 같은 토글이라 버블링을 끊는다 — 두 번 열렸다 닫히면 안 된다 */}
          <button
            type="button"
            aria-expanded={open}
            aria-controls={detailId}
            aria-label={`${product.name} 펼치기`}
            className="focus-visible:ring-ring text-border-strong inline-flex rounded-button p-1 focus-visible:ring-2 focus-visible:outline-hidden"
            onClick={(e) => {
              e.stopPropagation();
              onToggle();
            }}
          >
            {/* 펼치면 90°만 돈다 — `>`를 180° 돌리면 `<`가 되어 "펼침"으로 안 읽힌다 */}
            <ChevronRight
              aria-hidden
              className={`size-4 transition-transform ${open ? "rotate-90" : ""}`}
            />
          </button>
        </Table.Td>

        <Table.Td align="left" tone="muted">
          {product.code}
        </Table.Td>
        <Table.Td align="left">{product.name}</Table.Td>
        <Table.Td align="left" tone="muted">
          {product.category.join(" > ")}
        </Table.Td>

        {/*
          TODO(구성): 색상 수와 SKU 수를 한 칸에 넣는다. 예) `3색 · 12 SKU`
          - 값은 product.colors.length / product.skus.length 두 개뿐이다.
          - 숫자와 글자가 섞인 칸이라 Table.Td 기본값(우측 정렬 + tabular-nums)이 어울리지 않는다.
            머리글을 align="center"로 뒀으니 셀도 맞춰야 열이 어긋나지 않는다.
          - 이 형식을 여러 곳에서 쓰게 되면 derive.ts로 빼는 게 맞다. 지금은 한 곳뿐이라 여기 둔다.
        */}
        <Table.Td align="center">{/* TODO */}</Table.Td>

        {/*
          TODO(게시 상태): 세 가지 상태를 구분해야 한다.
            product.post === null            → 아직 마켓에 안 올린 상품 ("미등록")
            product.post.status === "ON_SALE"      → 판매중
            product.post.status === "SEASON_ENDED" → 시즌종료

          - 라벨 상수가 아직 없다. constants.ts에 POST_STATUS_LABEL을 만들어 두면
            나중에 상세 패널·수정 화면이 같은 문구를 쓴다(주문 탭의 ORDER_STATUS_LABEL과 같은 자리).
          - Badge tone은 두 개뿐이다: "active"(파랑) / "done"(회색). 색을 늘리지 않는 게 규칙이다.
          - 펼쳐진 행(open === true)에서는 배지 대신 평문으로 내린다 — OrderRow와 같은 처리다.
        */}
        <Table.Td align="center">{/* TODO */}</Table.Td>
      </Table.Row>

      {open ? (
        <tr id={detailId}>
          {/*
            6 = 펼침 열 + 목록 5열. 확장행은 표 폭을 통째로 받는다.

            max-w-0이 없으면 안쪽 SKU 표의 너비가 바깥 목록 표의 열 폭 계산에 끼어들어,
            SKU가 많은 상품을 펼칠 때 목록 전체가 가로로 늘어난다(게시 열이 밀려난다).
            0으로 못박으면 이 셀은 폭 계산에서 빠지고 표 폭만큼 늘어나며, 넘치는 SKU 표는
            자기 스크롤 컨테이너 안에서 흐른다.

            isolate가 핵심이다. 안쪽 표도 머리글이 sticky(z-10)인데, 이 셀이 스태킹
            컨텍스트를 안 만들면 그 z-10이 바깥 목록 머리글의 z-10과 같은 무대에서 겨룬다.
            같은 층에서는 DOM 순서가 늦은 쪽이 이기고 thead보다 tbody가 뒤라서,
            **안쪽 머리글이 바깥 머리글을 덮는다.** isolate로 가둬 두면 이 셀은 z-auto
            층에 머물러 바깥 머리글(z-10)이 항상 위에 온다.
            (`Table.Td`는 이미 isolate를 갖고 있는데, 확장행은 생짜 `<td>`라 빠져 있었다.)
          */}
          <td
            colSpan={6}
            className="border-gray-100 bg-accent isolate max-w-0 border-b p-4"
          >
            {children}
          </td>
        </tr>
      ) : null}
    </>
  );
}
