import { AddSlot, Chip, ImageSlot, SlotGrid } from "@ondo/ui";

const MAX_IMAGE_COUNT = 9;

/**
 * 게시글 이미지 9칸. 첫 번째가 대표다.
 *
 * 대표를 큰 슬롯으로 따로 띄우지 않고 **같은 크기로 나열한 뒤 배지로만 구분한다** —
 * 상세 화면(ProductDetailPanel)이 이미 이 그림이라, 등록과 조회가 같은 배치로 보인다.
 * 순서가 곧 대표 지정이라는 규칙도 한 줄에 늘어놔야 눈에 들어온다.
 */
export function PostImageGrid({
  images,
  disabled = false,
}: {
  images: string[];
  disabled?: boolean;
}) {
  const shown = images.slice(0, MAX_IMAGE_COUNT);

  return (
    <div className="space-y-2">
      <SlotGrid>
        {shown.map((img, i) => (
          <ImageSlot
            key={i}
            overlay={
              i === 0 ? (
                <Chip
                  tone="accent"
                  className="absolute top-2 left-2 h-5 px-2 text-xs"
                >
                  대표 이미지
                </Chip>
              ) : null
            }
          >
            {img}
          </ImageSlot>
        ))}
        {shown.length < MAX_IMAGE_COUNT ? (
          <AddSlot disabled={disabled} />
        ) : null}
      </SlotGrid>
    </div>
  );
}
