"use client";

import { cn } from "@ondo/ui";
import { ImageIcon } from "lucide-react";
import { useState } from "react";
import { THUMB_SLOTS } from "../constants";

/**
 * 상품 사진 갤러리 — 1:1 큰 자리 + 5칸 썸네일.
 *
 * **실제 이미지 자산이 없다.** 확정 와이어프레임도 회색 슬롯이고, 사진을 지어내
 * 넣으면 화면이 실제보다 완성돼 보인다. 대신 **몇 번째 사진을 보고 있는지**를
 * 글자로 적는다 — 그래야 썸네일을 눌렀을 때 무언가 바뀌었다는 것이 보인다.
 *
 * 사진이 5장을 넘으면 마지막 칸이 `+N`이 된다(원본 `+6`). 그 칸을 누르면 5번째
 * 사진으로 간다 — 6번째 이후를 여는 확대 뷰는 원본에 없어 만들지 않았다.
 */
export function ProductGallery({
  imageCount,
  productName,
}: {
  imageCount: number;
  /** 썸네일 접근성 이름에 상품명을 넣는다 — 사진만 있는 버튼은 맥락이 없다 */
  productName: string;
}) {
  const [selected, setSelected] = useState(1);

  const slots = Math.min(imageCount, THUMB_SLOTS);
  const hidden = imageCount - slots;

  return (
    <div>
      <div className="bg-secondary text-border-strong grid aspect-square place-items-center gap-2 rounded-control">
        <ImageIcon aria-hidden className="size-10" />
        <p aria-live="polite" className="text-muted-foreground text-body">
          {selected}번째 사진
        </p>
      </div>

      <div className="mt-2 grid grid-cols-5 gap-2">
        {Array.from({ length: slots }, (_, i) => i + 1).map((n) => {
          const isLast = n === slots && hidden > 0;

          return (
            <button
              key={n}
              type="button"
              onClick={() => setSelected(n)}
              aria-pressed={n === selected}
              aria-label={
                isLast
                  ? `${productName} ${n}번째 사진, ${hidden}장 더 있어요`
                  : `${productName} ${n}번째 사진`
              }
              className={cn(
                "bg-secondary text-muted-foreground grid aspect-square cursor-pointer place-items-center rounded-md text-xs",
                /* 선택 표시를 테두리가 아니라 안쪽 외곽선으로 준다 — 테두리를
                   주면 그 칸만 1.5px 작아져 격자가 흔들린다 (원본 outline-offset -1.5px) */
                n === selected &&
                  "outline-foreground -outline-offset-2 outline-2",
              )}
            >
              {isLast ? `+${hidden}` : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
