import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground shadow-sm hover:bg-primary/90",
        destructive:
          "bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
        outline:
          "border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground",
        secondary:
          "bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80",
      },
      size: {
        default: "h-9 px-4 py-2",
        icon: "h-9 w-9",
        lg: "h-10 rounded-md px-6",
        sm: "h-8 rounded-md px-3 text-xs",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

/**
 * 通用按钮组件接口。
 *
 * 在原生 button 属性之外，额外支持 shadcn 风格的视觉变体、尺寸和 Slot 渲染。
 */
type ButtonProps = React.ComponentProps<"button"> & {
  /** 按钮视觉样式，例如默认按钮、描边按钮、幽灵按钮或危险操作按钮。 */
  variant?: VariantProps<typeof buttonVariants>["variant"];
  /** 按钮尺寸；icon 用于只包含图标的工具按钮。 */
  size?: VariantProps<typeof buttonVariants>["size"];
  /**
   * 是否把样式透传给子元素。
   *
   * 为 true 时使用 Radix Slot，适合把链接或自定义元素渲染成按钮外观。
   */
  asChild?: boolean;
};

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot : "button";

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
