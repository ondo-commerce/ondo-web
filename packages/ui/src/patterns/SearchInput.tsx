import { Search } from "lucide-react";
import type { InputHTMLAttributes } from "react";
import { cn } from "../lib/cn";

export type SearchInputProps = InputHTMLAttributes<HTMLInputElement>;

/** 목록 상단 검색창. 테두리 없이 회색 채움 — 폼 입력과 구분하기 위해서다 */
export function SearchInput({ className, ...props }: SearchInputProps) {
  return (
    <div
      className={cn(
        "bg-secondary flex h-9 w-85 items-center gap-2 rounded-control px-3.5",
        // "focus-within:ring-ring focus-within:ring-2",
        className,
      )}
    >
      <Search
        aria-hidden
        className="text-muted-foreground size-4 shrink-0"
        strokeWidth={1.75}
      />
      <input
        type="search"
        className="placeholder:text-muted-foreground min-w-0 flex-1 bg-transparent text-sm outline-hidden [&::-webkit-search-cancel-button]:appearance-none"
        {...props}
      />
    </div>
  );
}
