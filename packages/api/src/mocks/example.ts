import type { SchemaObject } from "./openapi";

/**
 * 스키마 하나에서 **결정적인** example 값을 만든다. 같은 스펙이면 늘 같은 값이다 —
 * 무작위를 섞으면 화면 검증이 매번 다른 걸 보게 된다.
 *
 * 우선순위: 스키마 `example` → `enum`의 첫 값 → 타입·format별 기본값.
 * springdoc은 요청 DTO에만 example을 적고 응답엔 거의 안 적어서, 응답은 대부분
 * 기본값으로 채워진다. 값이 중요한 응답은 `wholesale/examples/*`가 BE 스텁을 옮겨
 * 덮어쓴다 — 이 함수는 "모든 필드가 있고 타입이 맞는 뼈대"를 보장하는 게 일이다.
 *
 * `hint`는 속성 이름이다. example 없는 문자열은 이 이름을 값으로 쓴다 — 화면에서
 * "name"·"title"처럼 보여 어느 필드가 목인지 바로 알 수 있다.
 */
export function exampleOf(
  schema: SchemaObject,
  schemas: Record<string, SchemaObject>,
  hint = "",
  depth = 0,
): unknown {
  if (schema.$ref !== undefined) {
    const name = schema.$ref.split("/").at(-1) ?? "";
    const target = schemas[name];
    if (target === undefined) return null;
    // 자기 참조 스키마(카테고리 트리)가 끝없이 내려가지 않게 끊는다
    if (depth > 6) return null;
    return exampleOf(target, schemas, hint || name, depth + 1);
  }

  if (schema.example !== undefined) return schema.example;
  if (schema.enum !== undefined && schema.enum.length > 0)
    return schema.enum[0];

  if (schema.allOf !== undefined) {
    return Object.assign(
      {},
      ...schema.allOf.map((part) => exampleOf(part, schemas, hint, depth)),
    ) as Record<string, unknown>;
  }

  if (schema.properties !== undefined || schema.type === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, prop] of Object.entries(schema.properties ?? {})) {
      result[key] = exampleOf(prop, schemas, key, depth + 1);
    }
    return result;
  }

  switch (schema.type) {
    case "array":
      // 한 건만 넣는다. 빈 배열이면 화면이 빈 상태로 빠져 목록 UI를 못 본다
      if (schema.items === undefined || depth > 4) return [];
      return [exampleOf(schema.items, schemas, hint, depth + 1)];
    case "string":
      return stringExample(schema.format, hint);
    case "integer":
    case "number":
      return 0;
    case "boolean":
      return false;
    default:
      return null;
  }
}

function stringExample(format: string | undefined, hint: string): string {
  switch (format) {
    case "date-time":
      return "2026-08-01T09:00:00+09:00";
    case "date":
      return "2026-08-01";
    case "email":
      return "owner@ondo.example";
    case "uri":
    case "url":
      return "https://cdn.ondo.example/mock.jpg";
    default:
      return hint;
  }
}
