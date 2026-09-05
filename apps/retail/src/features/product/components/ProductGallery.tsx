"use client";

import { cn } from "@ondo/ui";
import { ImageIcon } from "lucide-react";
import Image from "next/image";
import { useState } from "react";
import { THUMB_SLOTS } from "../constants";

/**
 * 상품 사진 갤러리 — 1:1 큰 자리 + 5칸 썸네일.
 *
 * 사진은 서버의 `images[].url`이다(`sortOrder` 순으로 정렬돼 온다). 사진이 한 장도
 * 없는 게시글은 회색 슬롯 하나만 그린다 — 지어내 넣으면 화면이 실제보다 완성돼
 * 보인다. **몇 번째 사진을 보고 있는지**를 글자로도 적는다 — 썸네일을 눌렀을 때
 * 무언가 바뀌었다는 것이 보조기술에도 보이게.
 *
 * 사진이 5장을 넘으면 마지막 칸이 `+N`이 된다(원본 `+6`). 그 칸을 누르면 5번째
 * 사진으로 간다 — 6번째 이후를 여는 확대 뷰는 원본에 없어 만들지 않았다.
 *
 * `unoptimized`: 이미지 호스트가 `next.config`의 `remotePatterns`에 없다 —
 * 도매가 올린 주소 그대로 그린다.
 */
export function ProductGallery({
  images,
  productName,
}: {
  images: readonly string[];
  /** 썸네일 접근성 이름에 상품명을 넣는다 — 사진만 있는 버튼은 맥락이 없다 */
  productName: string;
}) {
  const [selected, setSelected] = useState(1);

  const slots = Math.min(images.length, THUMB_SLOTS);
  const hidden = images.length - slots;
  const current = images[selected - 1];

  return (
    <div>
      <div className="bg-secondary text-border-strong relative grid aspect-square place-items-center gap-2 overflow-hidden rounded-control">
        {current ? (
          <Image
            src={current}
            alt={`${productName} ${selected}번째 사진`}
            fill
            unoptimized
            sizes="(max-width: 60rem) 100vw, 480px"
            className="object-cover"
            priority
          />
        ) : (
          <ImageIcon aria-hidden className="size-10" />
        )}
        <p aria-live="polite" className="sr-only">
          {images.length === 0 ? "사진이 없어요" : `${selected}번째 사진`}
        </p>
      </div>

      {slots > 0 ? (
        <div className="mt-2 grid grid-cols-5 gap-2">
          {images.slice(0, slots).map((url, i) => {
            const n = i + 1;
            const isLast = n === slots && hidden > 0;

            return (
              <button
                key={url}
                type="button"
                onClick={() => setSelected(n)}
                aria-pressed={n === selected}
                aria-label={
                  isLast
                    ? `${productName} ${n}번째 사진, ${hidden}장 더 있어요`
                    : `${productName} ${n}번째 사진`
                }
                className={cn(
                  "bg-secondary text-muted-foreground relative grid aspect-square cursor-pointer place-items-center overflow-hidden rounded-md text-xs",
                  /* 선택 표시를 테두리가 아니라 안쪽 외곽선으로 준다 — 테두리를
                     주면 그 칸만 1.5px 작아져 격자가 흔들린다 (원본 outline-offset -1.5px) */
                  n === selected &&
                    "outline-foreground -outline-offset-2 outline-2",
                )}
              >
                <Image
                  src={url}
                  alt=""
                  fill
                  unoptimized
                  sizes="96px"
                  className="object-cover"
                />
                {isLast ? (
                  <span className="bg-card/80 text-foreground relative rounded px-1">
                    +{hidden}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
