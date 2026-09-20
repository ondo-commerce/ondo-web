"use client";

import { useState } from "react";
import { flushSync } from "react-dom";
import { errorId, fieldId } from "./constants";
import { firstInvalidField, type ProductFormErrors } from "./derive";
import type { ProductField } from "./types";

/**
 * 폼 오류 상태 + **첫 오류 칸으로 데려가기.**
 *
 * 오류를 `flushSync`로 **먼저 그리고** 옮기는 이유: 가격표의 빨간 칸(`flagMissingPrice`)과
 * 오류 문구는 오류 상태가 그려져야 생긴다. 보통의 `setErrors` 뒤에 같은 틱에서 찾으면
 * 아직 없어서 표 전체로만 갈 수 있고, 문구는 우측 패널 fold 아래 그대로다 — 사장은
 * 저장을 눌렀는데 이동도 문구도 없이 버튼만 다시 켜지는 걸 봤다(dev-verify F8).
 *
 * 등록·수정 화면이 같은 순서(검증 → 오류 붙임 → 포커스)를 두 벌 갖고 있어 여기로 모았다.
 */
export function useProductFormErrors() {
  const [errors, setErrors] = useState<ProductFormErrors>({});

  return {
    errors,
    setErrors,
    /** 검증·서버 응답으로 얻은 오류를 붙이고, 그려진 뒤 첫 오류 칸으로 옮긴다 */
    showErrors: (found: ProductFormErrors) => {
      const first = firstInvalidField(found);
      if (!first) {
        setErrors(found);
        return;
      }

      flushSync(() => setErrors(found));
      if (revealInvalidField(first)) return;

      /* 칸을 못 찾았거나 포커스를 못 받는 칸(시즌 종료로 잠긴 fieldset)이다. 조용히 끝내지
         않는다 — 하단 바의 `_form` 한 줄(role=alert)은 스크롤과 무관하게 늘 보인다 */
      setErrors({ ...found, _form: found[first] });
    },
  };
}

/**
 * 오류 칸을 뷰포트 가운데로 끌어와 포커스한다. 실제로 포커스가 갔는지를 돌려준다.
 *
 * 대상이 칸 여럿을 품은 덩어리(가격표)면 **그 안의 첫 빨간 칸**으로 간다 — 표 전체에
 * 포커스를 주면 어느 행인지는 여전히 스크롤해서 찾아야 한다. 빨간 칸이 없으면(서버가
 * 행을 안 찍어 준 `PRICE_REQUIRED`) 덩어리 자체로 간다.
 *
 * 스크롤은 `focus()`에 맡기지 않는다 — 기본 동작은 `nearest`라 칸이 화면 아래 끝에
 * 걸치고, 그 아래 붙은 오류 문구는 여전히 안 보인다. 칸을 가운데 둔 뒤 문구를 `nearest`로
 * 한 번 더 — 짧은 표는 둘 다 들어오고, 긴 표는 문구가 이긴다(칸은 테두리로 이미 가리킨다).
 */
function revealInvalidField(field: ProductField): boolean {
  const container = document.getElementById(fieldId(field));
  if (!container) return false;

  const target =
    container.querySelector<HTMLElement>('input[aria-invalid="true"]') ??
    container;

  target.scrollIntoView({ block: "center" });
  target.focus({ preventScroll: true });
  document.getElementById(errorId(field))?.scrollIntoView({ block: "nearest" });
  return document.activeElement === target;
}
