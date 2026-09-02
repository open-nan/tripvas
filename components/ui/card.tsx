import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * 卡片容器组件接口。
 *
 * 继承 div 属性，组件负责提供统一的边框、背景和基础阴影。
 */
type CardProps = React.ComponentProps<"div">;

/**
 * 卡片头部组件接口。
 *
 * 继承 div 属性，用于放置标题、徽标、操作按钮等头部内容。
 */
type CardHeaderProps = React.ComponentProps<"div">;

/**
 * 卡片标题组件接口。
 *
 * 继承 div 属性，用于卡片里的主要标题文本。
 */
type CardTitleProps = React.ComponentProps<"div">;

/**
 * 卡片描述组件接口。
 *
 * 继承 div 属性，用于卡片标题下方的辅助说明文本。
 */
type CardDescriptionProps = React.ComponentProps<"div">;

/**
 * 卡片内容组件接口。
 *
 * 继承 div 属性，用于承载卡片主体区域。
 */
type CardContentProps = React.ComponentProps<"div">;

/**
 * 卡片底部组件接口。
 *
 * 继承 div 属性，用于放置底部操作区或补充信息。
 */
type CardFooterProps = React.ComponentProps<"div">;

function Card({ className, ...props }: CardProps) {
  return (
    <div
      data-slot="card"
      className={cn(
        "rounded-lg border bg-card text-card-foreground shadow-sm",
        className,
      )}
      {...props}
    />
  );
}

function CardHeader({ className, ...props }: CardHeaderProps) {
  return (
    <div
      data-slot="card-header"
      className={cn("flex flex-col gap-1.5 p-4", className)}
      {...props}
    />
  );
}

function CardTitle({ className, ...props }: CardTitleProps) {
  return (
    <div
      data-slot="card-title"
      className={cn("font-semibold leading-none tracking-normal", className)}
      {...props}
    />
  );
}

function CardDescription({ className, ...props }: CardDescriptionProps) {
  return (
    <div
      data-slot="card-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  );
}

function CardContent({ className, ...props }: CardContentProps) {
  return (
    <div
      data-slot="card-content"
      className={cn("p-4 pt-0", className)}
      {...props}
    />
  );
}

function CardFooter({ className, ...props }: CardFooterProps) {
  return (
    <div
      data-slot="card-footer"
      className={cn("flex items-center p-4 pt-0", className)}
      {...props}
    />
  );
}

export {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
};
