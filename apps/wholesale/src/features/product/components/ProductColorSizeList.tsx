import { ColorDot, Chip, Notice } from "@ondo/ui";
import Link from "next/link";
import type { Product } from "../types";

/**
 * 게시글이 **없는** 상품의 펼침 내용.
 * 판매가·SKU는 게시글에 붙는 값이라 아직 없다 — 색상별 사이즈만 보여준다.
 */
export function ProductColorSizeList({ product }: { product: Product }) {
  return (
    <div className="space-y-6">
      <div className="space-y-4">
        {product.colors.map((color) => {
          const sizes = product.skus
            .filter((s) => s.color === color.name)
            .map((s) => s.size);

          return (
            <div key={color.name} className="flex items-center gap-4">
              <div className="flex w-32 shrink-0 items-center gap-1.5 text-sm">
                <ColorDot color={color.hex} />
                <span>{color.displayName ?? color.name}</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {sizes.map((size) => (
                  <Chip key={size}>{size}</Chip>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <Notice
        action={
          <Link
            href={`/products/${product.id}/edit`}
            className="font-medium underline-offset-2 hover:underline"
          >
            마켓 등록하러 가기 →
          </Link>
        }
      >
        아직 온도마켓에 등록되지 않은 상품입니다
      </Notice>
    </div>
  );
}
