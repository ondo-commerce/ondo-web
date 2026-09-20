/* primitives — HTML 요소 대체재 수준. 도메인 지식 0 */
export { Badge, type BadgeProps } from "./primitives/Badge";
export { Button, type ButtonProps } from "./primitives/Button";
export { Checkbox, type CheckboxProps } from "./primitives/Checkbox";
export { Chip, type ChipProps } from "./primitives/Chip";
export { ColorDot, type ColorDotProps } from "./primitives/ColorDot";
export { Dialog } from "./primitives/Dialog";
export { IconButton, type IconButtonProps } from "./primitives/IconButton";
export { Input, type InputProps } from "./primitives/Input";
export { Panel, type PanelProps } from "./primitives/Panel";
export { Popover } from "./primitives/Popover";
export { Segmented, type SegmentedProps } from "./primitives/Segmented";
export { Select } from "./primitives/Select";
export { Switch, type SwitchProps } from "./primitives/Switch";
export { Table, type TableExpandableRowProps } from "./primitives/Table";
export { Textarea, type TextareaProps } from "./primitives/Textarea";
export { ToggleChip, type ToggleChipProps } from "./primitives/ToggleChip";

/* patterns — primitive 조합. 여전히 도메인 지식 0 */
export {
  AccordionRow,
  AccordionRows,
  type AccordionRowProps,
} from "./patterns/AccordionRow";
export { FormField, type FormFieldProps } from "./patterns/FormField";
export {
  AddSlot,
  ImageSlot,
  SlotGrid,
  type AddSlotProps,
  type ImageSlotProps,
} from "./patterns/ImageSlot";
export { Notice, type NoticeProps } from "./patterns/Notice";
export {
  ScrollSpyNav,
  type ScrollSpyItem,
  type ScrollSpyNavProps,
} from "./patterns/ScrollSpyNav";
export { SearchInput, type SearchInputProps } from "./patterns/SearchInput";

export { cn } from "./lib/cn";
