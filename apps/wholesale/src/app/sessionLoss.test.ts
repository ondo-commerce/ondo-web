import { ApiError } from "@ondo/api";
import { describe, expect, it } from "vitest";
import { shouldRedirectOnSessionLoss } from "./sessionLoss";
import { WHOLESALE_ERROR_CODE } from "@/shared/api/errorCodes";

const error = (status: number, code: string) =>
  new ApiError({ status, code, message: "" });

const unauthenticated = error(401, WHOLESALE_ERROR_CODE.UNAUTHENTICATED);

describe("shouldRedirectOnSessionLoss — S4-4: 화면이 받겠다고 한 401만 이동에서 뺀다", () => {
  it("401 + meta.sessionLoss inline → 이동하지 않는다", () => {
    expect(
      shouldRedirectOnSessionLoss(unauthenticated, { sessionLoss: "inline" }),
    ).toBe(false);
  });

  it("401 + meta 없음 → 지금처럼 /login", () => {
    expect(shouldRedirectOnSessionLoss(unauthenticated, undefined)).toBe(true);
    expect(shouldRedirectOnSessionLoss(unauthenticated, {})).toBe(true);
  });

  it("401 + 다른 meta 값 → 이동", () => {
    expect(
      shouldRedirectOnSessionLoss(unauthenticated, { sessionLoss: "other" }),
    ).toBe(true);
  });

  it("401 아님 → 이동하지 않는다 (403 NOT_APPROVED, 500, 망 오류, ApiError 아님)", () => {
    expect(
      shouldRedirectOnSessionLoss(
        error(403, WHOLESALE_ERROR_CODE.NOT_APPROVED),
        undefined,
      ),
    ).toBe(false);
    expect(
      shouldRedirectOnSessionLoss(error(500, "INTERNAL_ERROR"), undefined),
    ).toBe(false);
    expect(shouldRedirectOnSessionLoss(new Error("x"), undefined)).toBe(false);
  });
});
