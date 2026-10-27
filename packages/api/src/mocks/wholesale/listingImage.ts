/**
 * 게시글 이미지 업로드(`POST /api/wholesale/listing-images`) 목이 쓰는 한계값과 형식 판정.
 *
 * 핸들러는 `./product`에 있다(게시글 상태와 같은 파일). 여기 둔 이유는 **값이 계약이라서**다 —
 * 4 MiB(D18)와 jpg·png(D19)는 앱 `features/product/constants.ts`에도 같은 값으로 적힌다.
 * 목이 앱 상수를 import 할 수는 없다(`packages → apps` 역방향). 두 값이 어긋나면 사전 검사가
 * 통과시킨 파일을 목이 413으로 돌려보내는 식으로 화면에서 드러난다.
 */

/** 1장 상한. 4 MiB = 4,194,304 (D18). 상한과 같은 크기는 통과, +1바이트는 413 */
export const IMAGE_MAX_BYTES = 4 * 1024 * 1024;

/** 형식 판정에 읽는 앞머리 길이. PNG 서명이 8바이트로 가장 길다 */
export const IMAGE_MAGIC_LENGTH = 8;

const JPEG_MAGIC = [0xff, 0xd8, 0xff];
const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function startsWith(bytes: Uint8Array, magic: readonly number[]): boolean {
  return magic.every((byte, i) => bytes[i] === byte);
}

/**
 * 파일 앞머리가 JPEG(`FF D8 FF`) 또는 PNG(`89 50 4E 47 0D 0A 1A 0A`)인가.
 *
 * Content-Type과 확장자는 보지 않는다 — 실서버(소매 `FileType`)도 매직 넘버로 판정하고,
 * "확장자는 jpg인데 내용은 HEIC"가 415로 떨어지는 경로를 목에서도 재현해야 한다.
 */
export function isJpegOrPng(head: Uint8Array): boolean {
  return startsWith(head, JPEG_MAGIC) || startsWith(head, PNG_MAGIC);
}
