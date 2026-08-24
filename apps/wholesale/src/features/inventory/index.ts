/**
 * inventory feature의 public API.
 * 이 파일에 없는 것은 feature 밖에서 import 하지 않는다 (ESLint로 강제).
 */
export { InventoryListView } from "./components/InventoryListView";
export type { StockMovement, StockMovementType, InboundEntry } from "./types";
