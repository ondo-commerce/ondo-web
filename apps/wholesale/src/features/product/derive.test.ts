import { describe, expect, it } from "vitest";
import { PRICE_INPUT_MAX_DIGITS } from "./constants";
import {
  integerText,
  isIntegerInput,
  isIntegerText,
  isPriceMissing,
  parseIntegerText,
} from "./derive";

/**
 * 가격표 숫자 칸의 입력 방어. 하네스 28회차 중 16회차에서 `45.5 → 455` 같은
 * 결함이 다시 나왔다(input-guard). 이 규칙이 여기서 고정된다 — 깨지면 테스트가 먼저 안다.
 */
describe("isIntegerText — 0 이상 정수의 숫자만", () => {
  it.each(["", "0", "45", "1234567890"])("통과: %j", (text) => {
    expect(isIntegerText(text)).toBe(true);
  });

  it.each(["45.5", "-3", "1e5", "1,000", " 4", "４５"])(
    "거부: %j (소수점·부호·지수·쉼표·공백·전각)",
    (text) => {
      expect(isIntegerText(text)).toBe(false);
    },
  );
});

describe("isIntegerInput — 정수이면서 자릿수 상한 안", () => {
  it(`${PRICE_INPUT_MAX_DIGITS}자리까지는 유효하다`, () => {
    expect(isIntegerInput("9".repeat(PRICE_INPUT_MAX_DIGITS))).toBe(true);
  });

  it(`${PRICE_INPUT_MAX_DIGITS + 1}자리부터 칸이 빨개진다`, () => {
    expect(isIntegerInput("1" + "0".repeat(PRICE_INPUT_MAX_DIGITS))).toBe(
      false,
    );
  });
});

describe("parseIntegerText ↔ integerText", () => {
  it("빈 칸은 0 — 주문 제한 0 은 무제한", () => {
    expect(parseIntegerText("")).toBe(0);
  });

  it("서버 null 은 빈 칸으로 돌아온다", () => {
    expect(integerText(null)).toBe("");
    expect(integerText(12000)).toBe("12000");
  });
});

describe("isPriceMissing — 빈 칸과 0 은 같은 뜻", () => {
  it.each(["", "0", "00"])("비었다: %j", (text) => {
    expect(isPriceMissing(text)).toBe(true);
  });

  it("12000 은 비어 있지 않다", () => {
    expect(isPriceMissing("12000")).toBe(false);
  });

  it("정수가 아닌 글자는 '비었다'가 아니라 '잘못됐다'다", () => {
    expect(isPriceMissing("45.5")).toBe(false);
  });
});
