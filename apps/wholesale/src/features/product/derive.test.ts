import { TRANSPORT_ERROR_CODE } from "@ondo/api";
import { describe, expect, it } from "vitest";
import {
  IMAGE_MAX_BYTES,
  MAX_IMAGE_COUNT,
  PRICE_INPUT_MAX_DIGITS,
} from "./constants";
import {
  integerText,
  isImageUrl,
  isIntegerInput,
  isIntegerText,
  isPriceMissing,
  orderCompleted,
  parseIntegerText,
  rejectImageFile,
  remainingImageSlots,
  uploadFailure,
  uploadNote,
} from "./derive";
import type { UploadSlotStatus } from "./types";
import { WHOLESALE_ERROR_CODE } from "@/shared/api/errorCodes";

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

/* ------------------------------------------------------------------------
 * 게시글 이미지 업로드 (#250)
 * ------------------------------------------------------------------------ */

describe("isImageUrl — S2-2: http(s)·blob 만 그림이다", () => {
  it.each([
    "https://img.example.com/a.jpg",
    "http://x/a.png",
    "blob:http://localhost:3100/0f1a",
  ])("참: %j", (value) => {
    expect(isImageUrl(value)).toBe(true);
  });

  it.each(["data:image/png;base64,AAAA", "a.jpg", ""])(
    "거짓: %j (data·상대경로·빈 문자열)",
    (value) => {
      expect(isImageUrl(value)).toBe(false);
    },
  );
});

describe("uploadFailure — S1-4: 코드가 복구 종류를 정한다", () => {
  it.each([
    TRANSPORT_ERROR_CODE.NETWORK,
    TRANSPORT_ERROR_CODE.PARSE,
    WHOLESALE_ERROR_CODE.INTERNAL_ERROR,
  ])("재시도형: %s", (code) => {
    expect(uploadFailure(code)).toMatchObject({ kind: "retry" });
  });

  it.each([
    WHOLESALE_ERROR_CODE.VALIDATION_FAILED,
    WHOLESALE_ERROR_CODE.FILE_TOO_LARGE,
    WHOLESALE_ERROR_CODE.UNSUPPORTED_FILE_TYPE,
  ])("다시 고르기형: %s", (code) => {
    expect(uploadFailure(code)).toMatchObject({ kind: "repick" });
  });

  it.each([
    WHOLESALE_ERROR_CODE.UNAUTHENTICATED,
    WHOLESALE_ERROR_CODE.NOT_APPROVED,
  ])("세션 문제는 실패 칸이 아니다: %s", (code) => {
    expect(uploadFailure(code)).toEqual({ kind: "auth" });
  });

  it("모르는 코드는 재시도형 — 다시 보내 보는 게 빼기보다 싸다", () => {
    expect(uploadFailure("SOMETHING_NEW")).toMatchObject({ kind: "retry" });
  });

  it("다시 고르기형은 짧은 꼴과 전체 문장이 다르다 — 88px 칸과 낭독기가 따로 읽는다", () => {
    const failure = uploadFailure(WHOLESALE_ERROR_CODE.UNSUPPORTED_FILE_TYPE);
    expect(failure).toMatchObject({
      short: "jpg·png만 돼요",
      message: "jpg·png만 올릴 수 있어요. 다시 골라 주세요",
    });
  });
});

describe("rejectImageFile — S2-6: 서버 앞의 사전 검사", () => {
  const jpg = (size: number) => ({ name: "a.jpg", size, type: "image/jpeg" });

  it("형식이 jpeg·png 가 아니면 TYPE — 크기는 보지도 않는다", () => {
    expect(rejectImageFile({ name: "a.gif", size: 0, type: "image/gif" })).toBe(
      "TYPE",
    );
    expect(rejectImageFile({ name: "a.jpg", size: 10, type: "" })).toBe("TYPE");
  });

  it("0바이트는 EMPTY", () => {
    expect(rejectImageFile(jpg(0))).toBe("EMPTY");
    expect(rejectImageFile({ name: "b.png", size: 0, type: "image/png" })).toBe(
      "EMPTY",
    );
  });

  it("상한을 넘으면 SIZE, 상한과 같으면 통과", () => {
    expect(rejectImageFile(jpg(IMAGE_MAX_BYTES + 1))).toBe("SIZE");
    expect(rejectImageFile(jpg(IMAGE_MAX_BYTES))).toBeNull();
  });

  it("보통 jpg·png 는 통과", () => {
    expect(rejectImageFile(jpg(1234))).toBeNull();
    expect(
      rejectImageFile({ name: "b.png", size: 88, type: "image/png" }),
    ).toBeNull();
  });
});

describe("remainingImageSlots — S2-8: 대기·진행·실패 칸도 칸이다", () => {
  it("빈 격자는 9칸", () => {
    expect(remainingImageSlots({ registered: 0, pending: 0, failed: 0 })).toBe(
      MAX_IMAGE_COUNT,
    );
  });

  it("등록 6 + 진행 1 + 실패 1 이면 1칸", () => {
    expect(remainingImageSlots({ registered: 6, pending: 1, failed: 1 })).toBe(
      1,
    );
  });

  it("넘치면 음수가 아니라 0", () => {
    expect(remainingImageSlots({ registered: 9, pending: 1, failed: 0 })).toBe(
      0,
    );
  });
});

describe("orderCompleted — S2-12: 선택 순서를 지키는 앞쪽 연속 구간", () => {
  const slot = (id: string, status: UploadSlotStatus) => ({ id, status });

  it("앞(A)이 진행 중이면 뒤(B)가 끝나도 보류 — 대표는 A", () => {
    expect(orderCompleted([slot("A", "uploading"), slot("B", "done")])).toEqual(
      [],
    );
  });

  it("A 가 끝나면 [A, B] 가 한 번에", () => {
    expect(
      orderCompleted([slot("A", "done"), slot("B", "done")]).map((s) => s.id),
    ).toEqual(["A", "B"]);
  });

  it("A 가 실패면 건너뛰고 B 만", () => {
    expect(
      orderCompleted([slot("A", "failed"), slot("B", "done")]).map((s) => s.id),
    ).toEqual(["B"]);
  });

  it("대기 칸 앞까지만 — [done, queued, done] 은 첫 장만", () => {
    expect(
      orderCompleted([
        slot("A", "done"),
        slot("B", "queued"),
        slot("C", "done"),
      ]).map((s) => s.id),
    ).toEqual(["A"]);
  });

  it("빈 목록·전부 진행 중이면 빈 배열", () => {
    expect(orderCompleted([])).toEqual([]);
    expect(orderCompleted([slot("A", "uploading")])).toEqual([]);
  });
});

describe("uploadNote — 저장 버튼 옆 한 줄", () => {
  it("올리는 중이면 잠금 안내가 실패 안내보다 앞선다", () => {
    expect(uploadNote({ uploading: true, failedCount: 2 })).toEqual({
      text: "사진 올리는 중…",
      danger: false,
    });
  });

  it("실패만 남았으면 장수를 말한다", () => {
    expect(uploadNote({ uploading: false, failedCount: 1 })).toEqual({
      text: "실패한 사진 1장은 저장되지 않아요",
      danger: true,
    });
  });

  it("둘 다 없으면 문구 없음", () => {
    expect(uploadNote({ uploading: false, failedCount: 0 })).toBeNull();
  });
});
