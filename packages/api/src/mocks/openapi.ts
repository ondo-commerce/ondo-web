/**
 * 스냅샷(`openapi/*.json`)에서 목이 읽는 만큼만의 OpenAPI 타입.
 *
 * 전체 OpenAPI 3.1 타입을 들이지 않는다 — 여기서 쓰는 건 경로·메서드·응답 스키마와
 * 스키마의 example뿐이다. 모르는 키는 그냥 지나간다.
 */
export interface SchemaObject {
  $ref?: string;
  type?: "string" | "number" | "integer" | "boolean" | "array" | "object";
  format?: string;
  enum?: readonly unknown[];
  example?: unknown;
  items?: SchemaObject;
  properties?: Record<string, SchemaObject>;
  allOf?: readonly SchemaObject[];
  nullable?: boolean;
}

export interface ResponseObject {
  content?: Record<string, { schema?: SchemaObject }>;
}

export interface OperationObject {
  responses: Record<string, ResponseObject>;
}

export type HttpMethod = "get" | "post" | "put" | "patch" | "delete";

export interface OpenApiDocument {
  paths: Record<string, Partial<Record<HttpMethod, OperationObject>>>;
  components?: { schemas?: Record<string, SchemaObject> };
}

export const HTTP_METHODS: readonly HttpMethod[] = [
  "get",
  "post",
  "put",
  "patch",
  "delete",
];
