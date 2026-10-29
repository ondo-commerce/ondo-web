/**
 * 헤더 아이콘 오른쪽 위 숫자 알약(디자인 결정 29). 종과 채팅 링크가 같은 모양을 쓴다.
 *
 * 빨간 점이 아니라 primary 알약인 이유: 빨강은 필수 표시와 재고 0 경고색이고 새 주문은 경고가 아니다.
 * 채팅 목록의 안 읽은 수 알약과 같은 색이라 "세는 숫자"로 같이 읽힌다.
 * 글자는 `aria-hidden` — 숫자는 아이콘의 접근 이름에 한 번만 있다(S11-2). 부모가 `relative`여야 한다.
 */
export function CountBadge({
  text,
  "data-ac": dataAc,
}: {
  text: string;
  "data-ac"?: string;
}) {
  return (
    <span
      aria-hidden
      data-ac={dataAc}
      className="bg-primary text-primary-foreground ring-card pointer-events-none absolute -top-0.75 -right-1.25 h-4 min-w-4 rounded-full px-1 text-center text-xs leading-4 font-medium tabular-nums ring-2"
    >
      {text}
    </span>
  );
}
