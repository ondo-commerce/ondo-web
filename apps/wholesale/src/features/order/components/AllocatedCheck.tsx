import { Check } from "lucide-react";

/**
 * 전량 할당이 끝나 더 넣을 수량이 없는 라인의 표시(Figma 실측: 연초록 원 + 진초록 ✓).
 * 입력칸을 비활성으로 두지 않고 아예 ✓로 바꾸는 이유는, 비활성 칸은 "지금은 안 되지만
 * 나중엔 될 수도"로 읽히는데 여기는 **끝난 상태**이기 때문이다.
 *
 * 색은 새 토큰을 만들지 않고 기존 `--color-success`의 투명도만 낮춰 면으로 쓴다.
 * **Rule of Two: 주문 탭 안에 둔다.**
 */
export function AllocatedCheck() {
  return (
    <span
      role="img"
      aria-label="전량 할당 완료"
      className="bg-success/10 text-success inline-flex size-6 items-center justify-center rounded-full"
    >
      {/* strokeWidth는 lucide 기본값(2)이 아니다 — 원본이 12뷰박스에 2였던 굵은 ✓라,
          24뷰박스에서 같은 굵기로 보이려면 올려야 한다(Figma 실측 유지) */}
      <Check aria-hidden className="size-3.5" strokeWidth={3} />
    </span>
  );
}
