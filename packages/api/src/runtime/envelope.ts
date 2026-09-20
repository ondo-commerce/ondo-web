/**
 * 페이징 있는 목록 응답에만 붙는 메타.
 *
 * `page`는 **0-base**다. 화면의 "3페이지"는 `page: 2`다 — 표시할 때 +1 한다.
 */
export interface PageMeta {
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
}
