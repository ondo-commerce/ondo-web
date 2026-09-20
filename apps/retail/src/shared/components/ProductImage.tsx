"use client";

import { cn } from "@ondo/ui";
import { ImageIcon } from "lucide-react";
import Image from "next/image";
import { useState } from "react";

/**
 * 상품 사진 한 장. 있으면 그리고, **없거나 못 받으면 같은 회색 슬롯에 아이콘**을 둔다.
 *
 * 홈 카드 · 검색 행 · 상세 갤러리 세 곳이 같은 실패 모양을 가져야 해서 `shared/`에
 * 있다(Rule of Two). 전에는 URL이 없을 때만 아이콘이고, URL이 있는데 죽으면 카드는
 * 빈 회색, 상세는 `alt` 문장과 깨진 이미지 아이콘이 그대로 보였다(#217 D4). 도매가
 * 올린 주소가 죽는 일은 흔하고, 그때 화면이 고장 난 것처럼 읽히면 안 된다.
 *
 * 부모가 `relative` 상자와 `bg-secondary text-border-strong` 색을 든다 — 이 컴포넌트는
 * 그 안을 채우기만 한다(`fill`).
 *
 * `unoptimized`: 이미지 호스트가 `next.config`의 `remotePatterns`에 없다 —
 * 도매가 올린 주소 그대로 그린다.
 */
export function ProductImage({
  src,
  alt = "",
  sizes,
  priority = false,
  iconClassName,
}: {
  src: string | null | undefined;
  /** 장식이면 비운다. 갤러리 대표 사진처럼 뜻이 있는 것만 적는다 */
  alt?: string;
  sizes: string;
  priority?: boolean;
  /** 아이콘 크기. 슬롯 크기에 따라 부모가 정한다 */
  iconClassName?: string;
}) {
  /* 실패한 주소를 기억한다. `boolean`이면 다른 사진으로 바뀌어도 실패가 남는다 */
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const showImage = Boolean(src) && src !== failedSrc;

  return showImage && src ? (
    <Image
      src={src}
      alt={alt}
      fill
      unoptimized
      sizes={sizes}
      priority={priority}
      className="object-cover"
      onError={() => setFailedSrc(src)}
    />
  ) : (
    <ImageIcon aria-hidden className={cn("size-7", iconClassName)} />
  );
}
