import { describe, expect, it } from "vitest";
import { etaNoticeText } from "./derive";

/** 줄 글자 그대로(굵은 숫자를 이어 붙인 것). 화면이 읽히는 문장과 같다 */
const line = (input: string, saved: string | null, n: number) => {
  const notice = etaNoticeText(input, saved, n);
  return notice === null ? null : `${notice.lead}${notice.count}${notice.tail}`;
};

describe("S3-1 입고일 안내 줄 etaNoticeText", () => {
  it("다른 날짜 → 저장 문구. 3019 1곳, 3003 2곳", () => {
    expect(line("2026.11.08", "2026.11.05", 1)).toBe(
      "저장하면 이 옵션을 기다리는 소매처 1곳에 알림이 가요",
    );
    expect(line("2026.11.02", "2026.10.26", 2)).toBe(
      "저장하면 이 옵션을 기다리는 소매처 2곳에 알림이 가요",
    );
  });

  it("미정 → 날짜도 저장 문구", () => {
    expect(line("2026.11.03", null, 1)).toBe(
      "저장하면 이 옵션을 기다리는 소매처 1곳에 알림이 가요",
    );
  });

  it("저장된 날짜를 지움 → 해제 문구. 숫자만 따로 나온다", () => {
    expect(line("", "2026.10.26", 2)).toBe(
      "해제하면 소매처 2곳에 입고일 미정 알림이 가요",
    );
    expect(line("   ", "2026.10.26", 2)).toBe(
      "해제하면 소매처 2곳에 입고일 미정 알림이 가요",
    );
    expect(etaNoticeText("", "2026.10.26", 2)?.count).toBe("2곳");
  });

  it("같은 날짜(사유만 바꿈, 다시 침) → 줄 0. 앞뒤 공백은 같은 날짜", () => {
    expect(line("2026.11.05", "2026.11.05", 1)).toBeNull();
    expect(line(" 2026.11.05 ", "2026.11.05", 1)).toBeNull();
  });

  it("형식 오류 중 → 줄 0", () => {
    expect(line("2026.11", "2026.11.05", 1)).toBeNull();
    expect(line("2026-11-08", "2026.11.05", 1)).toBeNull();
    expect(line("2026.13.01", "2026.11.05", 1)).toBeNull();
  });

  it("처음부터 미정인 SKU를 빈칸 그대로 → 줄 0", () => {
    expect(line("", null, 1)).toBeNull();
  });

  it("기다리는 소매처 0곳 → 줄 0", () => {
    expect(line("2026.11.08", "2026.11.05", 0)).toBeNull();
    expect(line("", "2026.11.05", 0)).toBeNull();
  });
});
