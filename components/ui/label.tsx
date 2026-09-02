import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * 表单标签组件接口。
 *
 * 直接继承原生 label 属性，组件只统一字号、字重和禁用态样式。
 */
type LabelProps = React.ComponentProps<"label">;

function Label({ className, ...props }: LabelProps) {
  return (
    <label
      data-slot="label"
      className={cn(
        "text-sm font-medium leading-none text-foreground peer-disabled:cursor-not-allowed peer-disabled:opacity-70",
        className,
      )}
      {...props}
    />
  );
}

export { Label };
