/**
 * 0 이상 정수만 받는 숫자칸의 공통 규칙. `NumericInput`(shared/components)과 각 feature의
 * `parseNumberInput`이 같이 본다 — 칸이 막는 글자와 파서가 버리는 글자가 다르면 어느 한쪽에서
 * `45.5`가 `455`로 새어 나간다(wire-order F7 · wire-backorder F6 · wire-inventory F4 · wire-settlement F3, #199).
 */

/**
 * 숫자칸 상한. 서버의 수량·금액이 int32라 그 아래 9자리로 맞춘다 — 넘기면 400 아니면 오버플로고,
 * 화면은 `1.2e24` 같은 부동소수를 요청에 싣는다(wire-inventory F3). 도매 거래에서 10억이 넘는 한 건은 없다.
 */
export const NUMERIC_INPUT_MAX = 999_999_999;

/** 상한을 넘겼을 때 칸 옆에 붙는 한 줄. 상품 탭 가격표와 같은 말투다 */
export const NUMERIC_INPUT_MAX_TEXT = "999,999,999까지 입력할 수 있어요";

/** 칸에 들어갈 수 있는 글자 — 0 이상 정수의 숫자뿐. 소수점·부호·쉼표·전각은 키 단위로 막는다 */
export function isDigits(text: string): boolean {
  return /^\d*$/.test(text);
}

/**
 * 숫자만으로 된 입력이 상한을 넘겼는가. 자릿수로 먼저 가른다 — 25자리를 `Number`로 바꾸면
 * 정밀도가 깨져 비교 자체를 못 믿는다.
 */
export function exceedsNumericMax(raw: string): boolean {
  if (!isDigits(raw) || raw === "") return false;
  const trimmed = raw.replace(/^0+(?=\d)/, "");
  const maxDigits = String(NUMERIC_INPUT_MAX).length;
  return (
    trimmed.length > maxDigits ||
    (trimmed.length === maxDigits && Number(trimmed) > NUMERIC_INPUT_MAX)
  );
}
