import { TRANSPORT_ERROR_CODE } from "@ondo/api";
import { describe, expect, it } from "vitest";
import {
  IMAGE_MAX_BYTES,
  MAX_IMAGE_COUNT,
  PRICE_INPUT_MAX_DIGITS,
} from "./constants";
import {
  cancelUploads,
  clearImagesError,
  EMPTY_POST_FORM,
  EMPTY_PRODUCT_FORM,
  integerText,
  isImageUrl,
  isIntegerInput,
  isIntegerText,
  isPriceMissing,
  isProductFormDirty,
  LISTING_IMAGES_REQUIRED_MESSAGE,
  orderCompleted,
  parseIntegerText,
  priceRowId,
  rejectImageFile,
  remainingImageSlots,
  requeueForRetry,
  uploadFailure,
  uploadNote,
  validateProductForm,
} from "./derive";
import type {
  PostFormValue,
  ProductFormSnapshot,
  ProductFormValue,
  UploadSlotStatus,
} from "./types";
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

describe("requeueForRetry — F1: 재시도 칸은 큐 끝으로, 성공분은 그때의 끝에", () => {
  const slot = (
    slotId: string,
    status: UploadSlotStatus,
    failure: { kind: "retry" } | null = null,
  ) => ({ slotId, status, failure, idempotencyKey: `key-${slotId}` });

  it("A 실패 → B 완료 → A 재시도: B 가 보류되지 않고 먼저 올라간다", () => {
    const queue = requeueForRetry(
      [slot("A", "failed", { kind: "retry" }), slot("B", "done")],
      "A",
    );
    expect(queue.map((s) => `${s.slotId}:${s.status}`)).toEqual([
      "B:done",
      "A:queued",
    ]);
    expect(orderCompleted(queue).map((s) => s.slotId)).toEqual(["B"]);
  });

  it("A 재시도 성공 → [B, A] — 대표는 B 그대로", () => {
    const queue = requeueForRetry(
      [slot("A", "failed", { kind: "retry" }), slot("B", "done")],
      "A",
    ).map((s) => (s.slotId === "A" ? { ...s, status: "done" as const } : s));
    expect(orderCompleted(queue).map((s) => s.slotId)).toEqual(["B", "A"]);
  });

  it("같은 파일·같은 멱등키 — 자리와 상태만 바뀐다", () => {
    const [requeued] = requeueForRetry(
      [slot("A", "failed", { kind: "retry" })],
      "A",
    );
    expect(requeued).toEqual({
      slotId: "A",
      status: "queued",
      failure: null,
      idempotencyKey: "key-A",
    });
  });

  it("뒤에 대기 칸이 있어도 재시도 칸이 그 뒤로 간다 — 원래 순서의 뒤가 먼저 올라간다", () => {
    const queue = requeueForRetry(
      [
        slot("A", "failed", { kind: "retry" }),
        slot("B", "uploading"),
        slot("C", "queued"),
      ],
      "A",
    );
    expect(queue.map((s) => s.slotId)).toEqual(["B", "C", "A"]);
  });

  it("없는 칸이면 그대로", () => {
    const before = [slot("A", "done")];
    expect(requeueForRetry(before, "Z")).toEqual(before);
  });
});

describe("cancelUploads — S4-2·S4-5: 거둘 때 abort 는 진행 칸만, revoke 는 격자 미리보기 전부", () => {
  const slot = (
    slotId: string,
    status: UploadSlotStatus,
    url: string | null = null,
  ) => ({ slotId, status, previewUrl: `blob:preview-${slotId}`, url });

  it("대기·진행·보류·실패가 섞여 있으면 진행만 abort, 넷 다 revoke", () => {
    expect(
      cancelUploads([
        slot("Q", "queued"),
        slot("U", "uploading"),
        slot("H", "done", "blob:server-H"),
        slot("F", "failed"),
      ]),
    ).toEqual({
      abort: ["U"],
      revoke: [
        "blob:preview-Q",
        "blob:preview-U",
        "blob:preview-H",
        "blob:preview-F",
      ],
    });
  });

  it("S4-5 서버가 준 url(등록 칸이 그리는 것)은 revoke 에 없다", () => {
    const { revoke } = cancelUploads([
      slot("H1", "done", "blob:server-H1"),
      slot("H2", "done", "blob:server-H2"),
    ]);
    expect(revoke).not.toContain("blob:server-H1");
    expect(revoke).not.toContain("blob:server-H2");
    expect(revoke.every((u) => u.startsWith("blob:preview-"))).toBe(true);
  });

  it("빈 큐면 할 일 없음", () => {
    expect(cancelUploads([])).toEqual({ abort: [], revoke: [] });
  });

  it("F1 회귀: 재시도로 끝에 간 칸이 진행 중이면 그 칸도 abort, 순서는 큐 그대로", () => {
    const queue = requeueForRetry(
      [
        { ...slot("A", "failed"), failure: { kind: "retry" } },
        { ...slot("B", "done", "blob:server-B"), failure: null },
      ],
      "A",
    ).map((s) =>
      s.slotId === "A" ? { ...s, status: "uploading" as const } : s,
    );
    expect(queue.map((s) => s.slotId)).toEqual(["B", "A"]);
    expect(cancelUploads(queue)).toEqual({
      abort: ["A"],
      revoke: ["blob:preview-B", "blob:preview-A"],
    });
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

/* ------------------------------------------------------------------------
 * S3 — 필수 이미지(D21) · 더티 판정(D22)
 * ------------------------------------------------------------------------ */

/** 다른 칸은 전부 통과하는 폼. 이미지 검사만 남긴다 */
const BLACK_M = priceRowId(1, "M");
const validProduct: ProductFormValue = {
  name: "셔츠",
  category: ["1", "12", "121"],
  options: [
    { id: "opt-1", color: { id: 1, name: "블랙", hex: "#000" }, sizes: ["M"] },
  ],
};
const validPost: PostFormValue = {
  name: "게시글",
  description: "",
  images: [],
  allowSinglePiece: false,
  prices: { [BLACK_M]: { orderLimit: "", price: "12000" } },
};

describe("validateProductForm — S3-6: 판매 중으로 저장되는 게시글은 사진 1장 이상", () => {
  it("requireImages 인데 0장 → listing.images 오류", () => {
    const errors = validateProductForm(validProduct, validPost, {
      requireImages: true,
    });
    expect(errors["listing.images"]).toBe(LISTING_IMAGES_REQUIRED_MESSAGE);
    expect(errors["listing.images"]).toBe(
      "대표 이미지를 1장 이상 올려 주세요.",
    );
  });

  it("requireImages 인데 1장 → 오류 없음", () => {
    const errors = validateProductForm(
      validProduct,
      { ...validPost, images: ["https://cdn.ondo.test/1.jpg"] },
      { requireImages: true },
    );
    expect(errors).toEqual({});
  });

  it("requireImages 가 거짓(시즌 종료 저장)이면 0장이어도 검사 안 함", () => {
    expect(
      validateProductForm(validProduct, validPost, { requireImages: false }),
    ).toEqual({});
    // 옵션을 안 주면 거짓 — 기존 호출부가 그대로 돈다
    expect(validateProductForm(validProduct, validPost)).toEqual({});
  });

  it("post 가 null(게시글 안 보냄)이면 requireImages 여도 검사 안 함", () => {
    expect(
      validateProductForm(validProduct, null, { requireImages: true }),
    ).toEqual({});
  });

  it("다른 칸 오류와 같이 나온다 — 이미지가 다른 오류를 가리지 않는다", () => {
    const errors = validateProductForm(
      validProduct,
      { ...validPost, name: "" },
      { requireImages: true },
    );
    expect(errors["listing.title"]).toBeDefined();
    expect(errors["listing.images"]).toBeDefined();
  });
});

describe("clearImagesError — 이미지 채널은 그 칸 오류와 _form 만 지운다", () => {
  it("listing.images 와 _form 을 지우고 나머지는 둔다", () => {
    expect(
      clearImagesError({
        "listing.images": "x",
        "listing.title": "y",
        _form: "z",
      }),
    ).toEqual({ "listing.title": "y" });
  });
});

describe("isProductFormDirty — S3-15: 값으로 비교한다", () => {
  const initial: ProductFormSnapshot = {
    product: EMPTY_PRODUCT_FORM,
    post: EMPTY_POST_FORM,
    publishToMarket: false,
  };

  it("초기값 그대로면 거짓 — 같은 값의 새 객체도 거짓", () => {
    expect(isProductFormDirty(initial, initial)).toBe(false);
    expect(
      isProductFormDirty(initial, {
        product: { name: "", category: ["", "", ""], options: [] },
        post: { ...EMPTY_POST_FORM, images: [], prices: {} },
        publishToMarket: false,
      }),
    ).toBe(false);
  });

  it("품명 한 글자 → 참, 지우면 거짓", () => {
    const typed = { ...initial, product: { ...EMPTY_PRODUCT_FORM, name: "a" } };
    expect(isProductFormDirty(initial, typed)).toBe(true);
    expect(
      isProductFormDirty(initial, {
        ...typed,
        product: { ...typed.product, name: "" },
      }),
    ).toBe(false);
  });

  it("이미지 1장 추가 → 참", () => {
    expect(
      isProductFormDirty(initial, {
        ...initial,
        post: { ...EMPTY_POST_FORM, images: ["blob:a"] },
      }),
    ).toBe(true);
  });

  it("함께 게시 체크만 → 참 (등록 화면)", () => {
    expect(
      isProductFormDirty(initial, { ...initial, publishToMarket: true }),
    ).toBe(true);
  });

  it("상태 토글만 → 참 (수정 화면). 양쪽 다 없으면 거짓", () => {
    const edit: ProductFormSnapshot = {
      product: validProduct,
      post: validPost,
      status: "ON_SALE",
    };
    expect(isProductFormDirty(edit, { ...edit, status: "SEASON_ENDED" })).toBe(
      true,
    );
    expect(isProductFormDirty(edit, { ...edit })).toBe(false);
    const noPost = { product: validProduct, post: validPost };
    expect(isProductFormDirty(noPost, { ...noPost })).toBe(false);
  });

  it("가격표는 키 순서가 달라도 값이 같으면 거짓, 칸 하나가 다르면 참", () => {
    const base: ProductFormSnapshot = {
      product: validProduct,
      post: {
        ...validPost,
        prices: {
          [priceRowId(1, "M")]: { orderLimit: "", price: "12000" },
          [priceRowId(1, "L")]: { orderLimit: "3", price: "13000" },
        },
      },
    };
    expect(
      isProductFormDirty(base, {
        ...base,
        post: {
          ...base.post,
          prices: {
            [priceRowId(1, "L")]: { orderLimit: "3", price: "13000" },
            [priceRowId(1, "M")]: { orderLimit: "", price: "12000" },
          },
        },
      }),
    ).toBe(false);
    expect(
      isProductFormDirty(base, {
        ...base,
        post: {
          ...base.post,
          prices: {
            ...base.post.prices,
            [priceRowId(1, "L")]: { orderLimit: "3", price: "13001" },
          },
        },
      }),
    ).toBe(true);
  });

  it("옵션의 사이즈 하나 켬 → 참", () => {
    const edit: ProductFormSnapshot = {
      product: validProduct,
      post: validPost,
    };
    expect(
      isProductFormDirty(edit, {
        ...edit,
        product: {
          ...validProduct,
          options: validProduct.options.map((o) => ({
            ...o,
            sizes: ["M", "L"],
          })),
        },
      }),
    ).toBe(true);
  });
});
