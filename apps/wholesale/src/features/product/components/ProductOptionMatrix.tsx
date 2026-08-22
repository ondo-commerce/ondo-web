"use client";

import { Button, Checkbox, ColorDot, Table } from "@ondo/ui";
import { ColorPickerPopover } from "./ColorPickerPopover";
import { SIZES } from "../constants";
import type { PaletteColor } from "../constants";
import type { SizeName } from "../types";

export interface OptionDraft {
  id: string;
  /** 팔레트 26종 중 하나. 표의 행 하나가 색상 하나다 */
  color: PaletteColor;
  sizes: SizeName[];
}

/** SIZES 축 순서를 지키면서 size 하나를 켜고 끈다 */
function toggleSize(sizes: SizeName[], size: SizeName): SizeName[] {
  return sizes.includes(size)
    ? sizes.filter((s) => s !== size)
    : SIZES.filter((s) => s === size || sizes.includes(s));
}

/**
 * 옵션 입력 — **색상 × 사이즈 매트릭스**.
 *
 * 두 축이 모두 닫힌 집합이라(팔레트 26종 × 사이즈 7종) 카드를 색상 수만큼 쌓는
 * 대신 표로 받는다. 색상 10개면 카드 10장이 아니라 표 10행이다.
 *
 * 사이즈 머리글의 체크박스가 그 열 전체를 한 번에 켜고 끈다. 도매 상품 대부분이
 * "모든 색이 같은 사이즈"라 보통 머리글만 누르면 끝나고, 예외인 색만 아래에서
 * 고친다. 일괄 조작을 본문 행이 아니라 머리글에 둔 이유는, 색상 열에 색이 아닌
 * 글자가 앉으면 그 행이 데이터처럼 보이기 때문이다.
 */
export function ProductOptionMatrix({
  options,
  onChange,
  disabled = false,
}: {
  options: OptionDraft[];
  onChange: (next: OptionDraft[]) => void;
  disabled?: boolean;
}) {
  const skuCount = options.reduce((n, o) => n + o.sizes.length, 0);

  /*
   * 팝오버가 팔레트 순서로 돌려주므로 그 순서를 그대로 행 순서로 쓴다.
   * 이미 있던 색은 객체를 그대로 재사용한다 — 새로 만들면 사이즈 선택이 날아간다.
   */
  const commitColors = (colors: PaletteColor[]) =>
    onChange(
      colors.map(
        (color) =>
          options.find((o) => o.color.name === color.name) ?? {
            id: `opt-${color.name}`,
            color,
            sizes: [],
          },
      ),
    );

  const setCellSize = (id: string, size: SizeName) =>
    onChange(
      options.map((o) =>
        o.id === id ? { ...o, sizes: toggleSize(o.sizes, size) } : o,
      ),
    );

  /**
   * 이 사이즈가 모든 색에 켜져 있나.
   *
   * 머리글 체크박스의 표시와 일괄 토글의 방향이 **같은 식**을 봐야 한다.
   * 보이는 상태와 눌렀을 때의 동작이 어긋나면 정반대로 조작하게 된다.
   */
  const isEverySize = (size: SizeName) =>
    options.every((o) => o.sizes.includes(size));

  /** 전부 켜져 있으면 전부 끄고, 아니면 전부 켠다 */
  const setAllSize = (size: SizeName) => {
    const everyone = isEverySize(size);
    onChange(
      options.map((o) => ({
        ...o,
        sizes: everyone
          ? o.sizes.filter((s) => s !== size)
          : SIZES.filter((s) => s === size || o.sizes.includes(s)),
      })),
    );
  };

  return (
    <div className="w-full space-y-1">
      <div className="flex items-center gap-3">
        <ColorPickerPopover
          selected={options.map((o) => o.color.name)}
          onConfirm={commitColors}
        >
          <button
            type="button"
            disabled={disabled}
            className="border-border bg-card hover:bg-secondary focus-visible:ring-ring inline-flex h-8 items-center gap-1.5 rounded-button border px-2.5 text-sm focus-visible:ring-2 focus-visible:outline-hidden disabled:cursor-not-allowed"
          >
            <span aria-hidden>◎</span> 색상 선택
          </button>
        </ColorPickerPopover>

        {options.length > 0 ? (
          <div className="ml-auto flex gap-4 items-baseline">
            <div className="flex gap-2 items-baseline">
              <span className="text-muted-foreground ">색상</span>
              <span className="text-foreground text-lg">{options.length}</span>
            </div>
            <div className="flex gap-2 items-baseline">
              <span className="text-muted-foreground ">SKU</span>
              <span className="text-foreground text-lg">{skuCount}</span>
            </div>
          </div>
        ) : null}
      </div>

      {options.length === 0 ? (
        <></>
      ) : (
        <Table>
          <Table.Head>
            <tr>
              <Table.Th align="left">색상</Table.Th>
              {SIZES.map((size) => (
                <Table.Th key={size} align="center">
                  {size}
                </Table.Th>
              ))}
              <Table.Th align="center">
                <span className="sr-only">삭제</span>
              </Table.Th>
            </tr>

            {/*
             * 일괄 선택 행. 색상 열이 "전체 선택"이라는 이름의 가상 행 하나를
             * 맡고, 그 줄의 체크박스가 각 사이즈 열 전체를 켜고 끈다.
             *
             * 머리글 안이 아니라 별도 행인 이유: th는 열 이름을 담는 자리다.
             * 체크박스를 사이즈 이름 아래 넣으면 이름과 컨트롤이 한 칸에 겹쳐
             * 머리글 높이가 두 배가 되고, 아래 체크박스들과 세로로도 어긋난다.
             * 행으로 빼면 같은 Table.Td를 쓰므로 열 전체가 한 줄로 선다
             * (PostPriceTable의 "전체 적용" 행과 같은 방식).
             *
             * thead 안에 두는 이유: 보이는 자리는 첫 행이지만 색상 하나가 아니다.
             * tbody에 넣으면 화면을 읽어 주는 도구가 색상 행으로 읽는다.
             *
             * Table.Row가 아니라 맨 tr인 이유: Table.Row의 hover 강조는
             * "고를 수 있는 데이터 행"이라는 신호라 여기서 켜지면 안 된다.
             */}
            <tr>
              <Table.Td align="left" tone="muted">
                전체 선택
              </Table.Td>
              {SIZES.map((size) => (
                <Table.Td key={size} align="center">
                  <span className="flex justify-center">
                    <Checkbox
                      checked={isEverySize(size)}
                      disabled={disabled}
                      onCheckedChange={() => setAllSize(size)}
                      aria-label={`모든 색상 ${size}`}
                    />
                  </span>
                </Table.Td>
              ))}
              <Table.Td />
            </tr>
          </Table.Head>

          <Table.Body>
            {options.map((option) => (
              <Table.Row key={option.id}>
                <Table.Td align="left">
                  <span className="flex items-center gap-2 whitespace-nowrap">
                    <ColorDot color={option.color.hex} className="size-3.5" />
                    {option.color.name}
                  </span>
                </Table.Td>

                {SIZES.map((size) => (
                  <Table.Td key={size} align="center">
                    <span className="flex justify-center">
                      <Checkbox
                        checked={option.sizes.includes(size)}
                        disabled={disabled}
                        onCheckedChange={() => setCellSize(option.id, size)}
                        aria-label={`${option.color.name} ${size}`}
                      />
                    </span>
                  </Table.Td>
                ))}

                <Table.Td align="center">
                  <Button
                    variant="ghost"
                    size="iconSm"
                    disabled={disabled}
                    onClick={() =>
                      onChange(options.filter((o) => o.id !== option.id))
                    }
                    aria-label={`${option.color.name} 옵션 제거`}
                  >
                    ✕
                  </Button>
                </Table.Td>
              </Table.Row>
            ))}
          </Table.Body>
        </Table>
      )}
    </div>
  );
}
