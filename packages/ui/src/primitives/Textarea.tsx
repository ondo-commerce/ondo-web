import type { TextareaHTMLAttributes } from "react";
import { cn } from "../lib/cn";

export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement>;

export function Textarea({ className, ...props }: TextareaProps) {
  return (
    <textarea
      className={cn(
        "border-input bg-card text-foreground placeholder:text-muted-foreground",
        "min-h-21 w-full resize-y rounded-control border px-3 py-2.5 text-sm leading-relaxed",
        // "focus-visible:ring-ring focus-visible:border-ring focus-visible:ring-1 focus-visible:outline-hidden",
        "disabled:bg-muted disabled:text-muted-foreground disabled:cursor-not-allowed disabled:resize-none",
        className,
      )}
      {...props}
    />
  );
}
