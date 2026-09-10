"use client";

import { ImageIcon } from "lucide-react";
import Image from "next/image";
import { useState } from "react";
import { isImageUrl } from "../derive";

/**
 * 게시글 이미지 한 장. `ImageSlot` 안을 채운다 — 슬롯의 `relative`·가운데 정렬·회색 글자색을
 * 그대로 빌린다.
 *
 * **못 받으면 아이콘이다.** 전에는 브라우저가 `alt` 문장을 88px 슬롯에 그대로 흘려
 * `대표` 칩과 겹쳤다(wire-product F8) — 도매가 올린 주소가 죽는 일은 흔하고, 그때 화면이
 * 고장 난 것처럼 읽히면 안 된다. `alt`는 낭독기에만 남긴다(`sr-only`).
 * URL 꼴이 아닌 값도 같은 취급이다 — `next/image`는 절대 URL·`/`로 시작하는 경로만 받는다.
 *
 * 상세 패널과 수정 그리드가 같은 실패 모양을 가져야 해서 하나로 뒀다(Rule of Two).
 * `packages/ui` `ImageSlot`에 `src`가 생기면 그리로 옮긴다(design(ui) 이슈 별도).
 *
 * `unoptimized`: 이미지 호스트가 아직 정해지지 않아 `next.config`의 `remotePatterns`에
 * 적을 값이 없다. 최적화 프록시를 거치면 그 목록에 없는 호스트는 400이다.
 */
export function ListingImage({ src, alt }: { src: string; alt: string }) {
  /* 실패한 주소를 기억한다. `boolean`이면 순서를 바꿔 다른 사진이 와도 실패가 남는다 */
  const [failedSrc, setFailedSrc] = useState<string | null>(null);

  if (!isImageUrl(src) || src === failedSrc) {
    return (
      <>
        <ImageIcon aria-hidden className="size-7" />
        <span className="sr-only">{alt} (불러오지 못함)</span>
      </>
    );
  }

  return (
    <Image
      src={src}
      alt={alt}
      fill
      sizes="88px"
      unoptimized
      className="rounded-control object-cover"
      onError={() => setFailedSrc(src)}
    />
  );
}
