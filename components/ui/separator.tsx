import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * 分隔线组件接口。
 *
 * 继承 div 属性，并通过 orientation 决定渲染为横向或纵向分隔线。
 */
type SeparatorProps = React.ComponentProps<"div"> & {
  /** 分隔线方向，默认为 horizontal。 */
  orientation?: "horizontal" | "vertical";
};

function Separator({
  className,
  orientation = "horizontal",
  ...props
}: SeparatorProps) {
  return (
    <div
      data-slot="separator"
      role="separator"
      aria-orientation={orientation}
      className={cn(
        "shrink-0 bg-border",
        orientation === "horizontal" ? "h-px w-full" : "h-full w-px",
        className,
      )}
      {...props}
    />
  );
}

export { Separator };
