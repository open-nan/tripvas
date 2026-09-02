import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-md border px-2 py-0.5 text-xs font-medium whitespace-nowrap transition-colors [&>svg]:size-3",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-primary text-primary-foreground shadow-sm",
        destructive:
          "border-transparent bg-destructive text-destructive-foreground shadow-sm",
        outline: "text-foreground",
        secondary:
          "border-transparent bg-secondary text-secondary-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

/**
 * 标签组件接口。
 *
 * 在原生 span 属性之外，支持通过 variant 切换默认、次级、描边和危险提示样式。
 */
type BadgeProps = React.ComponentProps<"span"> & {
  /** 标签视觉样式。 */
  variant?: VariantProps<typeof badgeVariants>["variant"];
};

function Badge({
  className,
  variant,
  ...props
}: BadgeProps) {
  return (
    <span
      data-slot="badge"
      className={cn(badgeVariants({ variant, className }))}
      {...props}
    />
  );
}

export { Badge, badgeVariants };
