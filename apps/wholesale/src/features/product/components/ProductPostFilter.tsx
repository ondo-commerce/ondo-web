"use client";

import { Segmented } from "@ondo/ui";
import {
  POST_FILTER_LABEL,
  POST_FILTER_VALUES,
  type PostFilterValue,
} from "../constants";

/**
 * 상품 목록 위의 게시 상태 필터. 미등록·판매중·시즌종료 세 값에 `전체`를 더한 4칸이다.
 *
 * **건수를 붙이지 않는다.** 좌측 패널 872px에 검색창(340) + `상품 등록` 버튼이 이미
 * 자리를 잡고 있어 필터에 남는 폭이 380px 남짓인데, 건수를 달면 칸이 넘쳐 두 줄로 접힌다.
 * 주문 탭이 필터를 아랫줄로 내린 것과 같은 사정이고, 여기서는 줄을 늘리는 대신
 * 숫자를 뺐다 — 이 탭은 필터 축이 하나뿐이라 무엇으로 걸렀는지만 읽히면 된다.
 *
 * 세울 칸과 순서는 `POST_FILTER_VALUES`가, 칸에 쓸 말은 `POST_FILTER_LABEL`이 갖는다.
 */
export function ProductPostFilter({
  value,
  onChange,
}: {
  value: PostFilterValue;
  onChange: (value: PostFilterValue) => void;
}) {
  return (
    <Segmented
      fit
      className="shrink-0"
      value={value}
      /* Radix가 돌려주는 값은 string이다. 캐스팅 대신 아는 값 목록에서 찾아 좁힌다 */
      onValueChange={(next) => {
        const found = POST_FILTER_VALUES.find((v) => v === next);
        if (found) onChange(found);
      }}
      aria-label="게시 상태 필터"
    >
      {POST_FILTER_VALUES.map((v) => (
        <Segmented.Item key={v} value={v}>
          {POST_FILTER_LABEL[v]}
        </Segmented.Item>
      ))}
    </Segmented>
  );
}
